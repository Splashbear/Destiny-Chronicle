import { Router, Request, Response } from 'express';
import { ArchiveService } from '../services/archive.service';
import { WatermarkService } from '../services/watermark.service';
import {
  LeanActivity,
  LightActivityRow,
  PlayerActivitiesResponse,
  PlayerActivitiesCoverage,
  BatchPlayerActivitiesResponse,
} from '../types/lean-activity.types';
import { logger } from '../utils/logger';
import { resolveCoverageLevel, shouldStripPartialActivities } from '../utils/coverage-level';
import { filterSocialHubs } from '../utils/social-hubs';

/** W6: exclude social hubs unless explicitly requested or EXCLUDE_SOCIAL_HUBS=false. */
function shouldIncludeSocialHubs(req: Request): boolean {
  if (getStringParam(req.query.includeSocialHubs) === '1') return true;
  if (process.env.EXCLUDE_SOCIAL_HUBS === 'false') return true;
  return false;
}

/**
 * Fetch with headroom so W6 hub filter still fills `limit` with real activities.
 */
function fetchLimitForHubs(limit: number, includeHubs: boolean): number {
  if (includeHubs) return limit;
  const max = maxActivitiesLimit();
  // Hubs are a large fraction of some accounts (~2–3k); pad so post-filter hits limit.
  return Math.min(max, Math.max(limit + 8000, Math.ceil(limit * 1.35)));
}

function applySocialHubFilter(
  activities: LeanActivity[],
  tierNotes: string[] | undefined,
  limit: number,
  includeHubs: boolean
): { activities: LeanActivity[]; notes: string[] } {
  const notes = [...(tierNotes || [])];
  if (includeHubs) {
    return { activities: activities.slice(0, limit), notes };
  }
  const { kept, excluded } = filterSocialHubs(activities);
  if (excluded > 0) {
    notes.push(
      `W6: excluded ${excluded} social hub rows (mode 40 / mode-0 hub hashes)`
    );
  }
  return { activities: kept.slice(0, limit), notes };
}

/** W11: one call can return a full player list (Kaiser ~18k / Splash ~22k). */
function maxActivitiesLimit(): number {
  const n = parseInt(process.env.PGCR_MAX_ACTIVITIES_LIMIT || '100000', 10);
  return Number.isFinite(n) && n > 0 ? n : 100000;
}

function clampLimit(raw: string | number | undefined, defaultLimit: number): number {
  const max = maxActivitiesLimit();
  if (raw === undefined || raw === '') return Math.min(defaultLimit, max);
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return Math.min(defaultLimit, max);
  return Math.min(n, max);
}

/**
 * Helper to extract string from query parameter
 */
function getStringParam(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  return '';
}

/**
 * Convert LeanActivity to LightActivityRow for API response
 */
function toLightActivityRow(activity: LeanActivity): LightActivityRow {
  return {
    instanceId: activity.instance_id,
    period: activity.period,
    activityHash: activity.activity_hash,
    mode: activity.mode,
    membershipId: activity.membership_id,
    membershipType: activity.membership_type,
    characterId: activity.character_id,
    completed: activity.completed,
    deaths: activity.deaths,
    kills: activity.kills,
    assists: activity.assists,
    durationSeconds: activity.duration_seconds,
    game: activity.game,
    displayName: activity.display_name || undefined,
  };
}

/**
 * Build coverage information from activities and tier info.
 * Applies W3 rules so 'full' is honest (D1 / empty / truncated / W9 holes → not full).
 */
function buildCoverage(
  activities: LeanActivity[],
  watermarkService: WatermarkService,
  tierInfo: {
    level: 'full' | 'partial' | 'absent';
    source: 'lite' | 'extract' | 'compact_ids' | 'gap_lean' | 'merged' | 'none' | 'pending' | 'archive';
    indexComplete?: boolean;
    filtersApplied?: boolean;
    notes?: string[];
  },
  options: {
    game?: 'D1' | 'D2';
    limit: number;
    gapLeanEnabled: boolean;
  }
): PlayerActivitiesCoverage {
  const rowCount = activities.length;
  const distinctInstances = new Set(activities.map(a => a.instance_id).filter(id => id)).size;

  const periodsWithValues = activities
    .map((a) => a.period)
    .filter(p => p && p !== '')
    .sort();

  const minPeriod = periodsWithValues.length > 0 ? periodsWithValues[0] : null;
  const maxPeriod = periodsWithValues.length > 0 ? periodsWithValues[periodsWithValues.length - 1] : null;

  const watermark = watermarkService.getWatermark();
  const watermarkNote = watermark
    ? `Archive contains activities up to instance ID ${watermark.max_instance_id}`
    : undefined;

  const resolved = resolveCoverageLevel({
    tierLevel: tierInfo.level,
    source: tierInfo.source,
    game: options.game,
    activities,
    limit: options.limit,
    gapLeanEnabled: options.gapLeanEnabled,
  });

  const notes = Array.from(
    new Set([...(tierInfo.notes || []), ...resolved.notes].filter(Boolean))
  );

  return {
    level: resolved.level,
    source: tierInfo.source,
    rowCount,
    distinctInstances: resolved.level === 'partial' && tierInfo.source === 'compact_ids'
      ? undefined
      : distinctInstances,
    minPeriod,
    maxPeriod,
    watermarkNote,
    indexComplete: tierInfo.indexComplete,
    filtersApplied: tierInfo.filtersApplied,
    notes: notes.length ? notes : undefined,
  };
}

/**
 * Create player activities router for /players endpoints.
 */
export function createPlayerActivitiesRouter(
  archiveService: ArchiveService,
  watermarkService: WatermarkService
): Router {
  const router = Router();

  /**
   * GET /players/:membershipId/activities
   * 
   * Get activities for a player with optional filtering.
   * Query params: game (D1|D2), from (ISO period), to (ISO period), limit
   */
  router.get('/:membershipId/activities', async (req: Request, res: Response) => {
    try {
      const membershipId = String(req.params.membershipId || '');

      if (!membershipId || !/^\d+$/.test(membershipId)) {
        return res.status(400).json({
          error: 'Invalid membership ID',
        });
      }

      const game = getStringParam(req.query.game) as 'D1' | 'D2' | undefined;
      const fromPeriod = getStringParam(req.query.from) || undefined;
      const toPeriod = getStringParam(req.query.to) || undefined;
      const limitStr = getStringParam(req.query.limit);
      const limit = clampLimit(limitStr || undefined, 1000);
      const includePartial = getStringParam(req.query.includePartial) === '1';
      const includeHubs = shouldIncludeSocialHubs(req);
      const fetchLimit = fetchLimitForHubs(limit, includeHubs);

      logger.info('GET /players/:membershipId/activities', {
        membershipId,
        game,
        fromPeriod,
        toPeriod,
        limit,
        includeHubs,
      });

      if (!archiveService.isAvailable()) {
        logger.warn('Archive not available, returning empty activities');
        const response: PlayerActivitiesResponse = {
          membershipId,
          coverage: {
            level: 'absent',
            source: 'none',
            rowCount: 0,
            minPeriod: null,
            maxPeriod: null,
          },
          activities: [],
        };
        return res.json(response);
      }

      const result = await archiveService.getPlayerActivitiesMultiTier(membershipId, {
        game: game === 'D1' || game === 'D2' ? game : undefined,
        fromPeriod,
        toPeriod,
        limit: fetchLimit,
      });

      const filtered = applySocialHubFilter(
        result.activities,
        result.tier.notes,
        limit,
        includeHubs
      );
      result.activities = filtered.activities;
      result.tier.notes = filtered.notes;

      const coverage = buildCoverage(result.activities, watermarkService, result.tier, {
        game: game === 'D1' || game === 'D2' ? game : undefined,
        limit,
        gapLeanEnabled: archiveService.isGapLeanEnabled(),
      });
      
      // W10: strip activities ONLY for compact-only partials (old client safety).
      // Merged/gap/lite/extract partials keep rows so the client can use them and
      // fill holes from Bungie; label stays 'partial'.
      let lightRows: LightActivityRow[] = [];
      let partialInstanceIds: string[] | undefined;
      const stripPartial = coverage.level === 'partial' && shouldStripPartialActivities(coverage.source);
      
      if (stripPartial) {
        if (includePartial) {
          const uniqueIds = new Set(
            result.activities
              .map(a => a.instance_id)
              .filter(id => id && id !== '')
          );
          partialInstanceIds = Array.from(uniqueIds);
        }
        lightRows = [];
        coverage.rowCount = 0;
        delete coverage.distinctInstances;
      } else if (coverage.level === 'absent') {
        lightRows = [];
        coverage.rowCount = 0;
      } else {
        // full OR partial with lean/merged rows
        lightRows = result.activities.map(toLightActivityRow);
        coverage.rowCount = lightRows.length;
      }

      const response: PlayerActivitiesResponse = {
        membershipId,
        coverage,
        activities: lightRows,
        partialInstanceIds,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in GET /players/:membershipId/activities', { error });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /players/activities/batch
   * 
   * Get activities for multiple players.
   * Body: { membershipIds: string[], game?: 'D1' | 'D2', from?: string, to?: string, limit?: number }
   */
  router.post('/activities/batch', async (req: Request, res: Response) => {
    try {
      const {
        membershipIds,
        game,
        from,
        to,
        limit: requestLimit,
        includePartial,
        includeSocialHubs,
      } = req.body;

      if (!Array.isArray(membershipIds) || membershipIds.length === 0) {
        return res.status(400).json({
          error: 'membershipIds array is required',
        });
      }

      if (membershipIds.length > 20) {
        return res.status(400).json({
          error: 'Maximum 20 membership IDs per batch request',
        });
      }

      const limit = clampLimit(requestLimit, 1000);
      const includePartialFlag = includePartial === true || includePartial === 1 || includePartial === '1';
      const includeHubs =
        includeSocialHubs === true ||
        includeSocialHubs === 1 ||
        includeSocialHubs === '1' ||
        process.env.EXCLUDE_SOCIAL_HUBS === 'false';
      const fetchLimit = fetchLimitForHubs(limit, includeHubs);

      logger.info('POST /players/activities/batch', {
        count: membershipIds.length,
        game,
        from,
        to,
        limit,
        includeHubs,
      });

      const result: BatchPlayerActivitiesResponse = {};

      if (!archiveService.isAvailable()) {
        logger.warn('Archive not available, returning empty activities for all');
        for (const membershipId of membershipIds) {
          result[membershipId] = {
            membershipId,
            coverage: {
              level: 'absent',
              source: 'none',
              rowCount: 0,
              minPeriod: null,
              maxPeriod: null,
            },
            activities: [],
          };
        }
        return res.json(result);
      }

      // W11: run per-mid lookups concurrently (old loop was fully sequential).
      const concurrency = Math.max(
        1,
        parseInt(process.env.PGCR_BATCH_CONCURRENCY || '4', 10) || 4
      );
      const ids = membershipIds.filter((id: unknown) => typeof id === 'string');
      let cursor = 0;

      async function processOne(membershipId: string): Promise<void> {
        try {
          if (!/^\d+$/.test(membershipId)) {
            logger.warn('Invalid membership ID in batch, skipping', { membershipId });
            return;
          }

          const activitiesResult = await archiveService.getPlayerActivitiesMultiTier(membershipId, {
            game: game === 'D1' || game === 'D2' ? game : undefined,
            fromPeriod: from,
            toPeriod: to,
            limit: fetchLimit,
          });

          const filtered = applySocialHubFilter(
            activitiesResult.activities,
            activitiesResult.tier.notes,
            limit,
            includeHubs
          );
          activitiesResult.activities = filtered.activities;
          activitiesResult.tier.notes = filtered.notes;

          const coverage = buildCoverage(
            activitiesResult.activities,
            watermarkService,
            activitiesResult.tier,
            {
              game: game === 'D1' || game === 'D2' ? game : undefined,
              limit,
              gapLeanEnabled: archiveService.isGapLeanEnabled(),
            }
          );

          let lightRows: LightActivityRow[] = [];
          let partialInstanceIds: string[] | undefined;
          const stripPartial =
            coverage.level === 'partial' && shouldStripPartialActivities(coverage.source);

          if (stripPartial) {
            if (includePartialFlag) {
              const uniqueIds = new Set(
                activitiesResult.activities
                  .map(a => a.instance_id)
                  .filter(id => id && id !== '')
              );
              partialInstanceIds = Array.from(uniqueIds);
            }
            lightRows = [];
            coverage.rowCount = 0;
            delete coverage.distinctInstances;
          } else if (coverage.level === 'absent') {
            lightRows = [];
            coverage.rowCount = 0;
          } else {
            lightRows = activitiesResult.activities.map(toLightActivityRow);
            coverage.rowCount = lightRows.length;
          }

          result[membershipId] = {
            membershipId,
            coverage,
            activities: lightRows,
            partialInstanceIds,
          };
        } catch (error) {
          logger.warn('Failed to fetch activities in batch', { membershipId, error });
          result[membershipId] = {
            membershipId,
            coverage: {
              level: 'absent',
              source: 'none',
              rowCount: 0,
              minPeriod: null,
              maxPeriod: null,
            },
            activities: [],
          };
        }
      }

      async function worker(): Promise<void> {
        while (cursor < ids.length) {
          const idx = cursor++;
          await processOne(ids[idx]);
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())
      );

      res.json(result);
    } catch (error) {
      logger.error('Error in POST /players/activities/batch', { error });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
