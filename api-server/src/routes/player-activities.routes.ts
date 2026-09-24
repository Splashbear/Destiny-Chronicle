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
 * Calculates distinct instance count for accuracy.
 */
function buildCoverage(
  activities: LeanActivity[],
  watermarkService: WatermarkService,
  tierInfo: {
    level: 'full' | 'partial' | 'absent';
    source: 'lite' | 'extract' | 'compact_ids' | 'none' | 'pending' | 'archive';
    indexComplete?: boolean;
    filtersApplied?: boolean;
    notes?: string[];
  }
): PlayerActivitiesCoverage {
  const rowCount = activities.length;
  const distinctInstances = new Set(activities.map(a => a.instance_id).filter(id => id)).size;

  if (activities.length === 0) {
    return {
      level: tierInfo.level,
      source: tierInfo.source,
      rowCount: 0,
      distinctInstances: 0,
      minPeriod: null,
      maxPeriod: null,
      indexComplete: tierInfo.indexComplete,
      filtersApplied: tierInfo.filtersApplied,
      notes: tierInfo.notes,
    };
  }

  // For compact tier, periods are empty strings
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

  return {
    level: tierInfo.level,
    source: tierInfo.source,
    rowCount,
    distinctInstances,
    minPeriod,
    maxPeriod,
    watermarkNote,
    indexComplete: tierInfo.indexComplete,
    filtersApplied: tierInfo.filtersApplied,
    notes: tierInfo.notes,
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
      const limit = limitStr ? Math.min(parseInt(limitStr, 10), 10000) : 1000;
      const includePartial = getStringParam(req.query.includePartial) === '1';

      logger.info('GET /players/:membershipId/activities', {
        membershipId,
        game,
        fromPeriod,
        toPeriod,
        limit,
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
        game,
        fromPeriod,
        toPeriod,
        limit,
      });

      const coverage = buildCoverage(result.activities, watermarkService, result.tier);
      
      // For partial coverage (compact IDs only), protect old clients:
      // - Don't return IDs in activities[] unless caller opts in
      // - Keep rowCount: 0 for backward compatibility
      // - Put IDs in separate field when requested
      let lightRows: LightActivityRow[] = [];
      let partialInstanceIds: string[] | undefined;
      
      if (result.tier.level === 'partial') {
        if (includePartial) {
          // Caller opted in, return IDs in separate field
          partialInstanceIds = result.activities
            .map(a => a.instance_id)
            .filter(id => id && id !== '');
        }
        // Keep activities empty for old clients
        lightRows = [];
        // Override rowCount to 0 for backward compatibility
        coverage.rowCount = 0;
      } else {
        lightRows = result.activities.map(toLightActivityRow);
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
      const { membershipIds, game, from, to, limit: requestLimit } = req.body;

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

      const limit = requestLimit ? Math.min(parseInt(requestLimit, 10), 10000) : 1000;

      logger.info('POST /players/activities/batch', {
        count: membershipIds.length,
        game,
        from,
        to,
        limit,
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

      for (const membershipId of membershipIds) {
        try {
          if (!/^\d+$/.test(membershipId)) {
            logger.warn('Invalid membership ID in batch, skipping', { membershipId });
            continue;
          }

          const activitiesResult = await archiveService.getPlayerActivitiesMultiTier(membershipId, {
            game,
            fromPeriod: from,
            toPeriod: to,
            limit,
          });

          const coverage = buildCoverage(activitiesResult.activities, watermarkService, activitiesResult.tier);
          const lightRows = activitiesResult.activities.map(toLightActivityRow);

          result[membershipId] = {
            membershipId,
            coverage,
            activities: lightRows,
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
