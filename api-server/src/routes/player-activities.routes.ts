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
 * Build coverage information from activities
 */
function buildCoverage(
  activities: LeanActivity[],
  watermarkService: WatermarkService
): PlayerActivitiesCoverage {
  if (activities.length === 0) {
    return {
      source: 'archive',
      rowCount: 0,
      minPeriod: null,
      maxPeriod: null,
    };
  }

  const periods = activities.map((a) => a.period).sort();
  const minPeriod = periods[0];
  const maxPeriod = periods[periods.length - 1];

  const watermark = watermarkService.getWatermark();
  const watermarkNote = watermark
    ? `Archive contains activities up to instance ID ${watermark.max_instance_id}`
    : undefined;

  return {
    source: 'archive',
    rowCount: activities.length,
    minPeriod,
    maxPeriod,
    watermarkNote,
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
            source: 'none',
            rowCount: 0,
            minPeriod: null,
            maxPeriod: null,
          },
          activities: [],
        };
        return res.json(response);
      }

      const activities = await archiveService.getPlayerActivities(membershipId, {
        game,
        fromPeriod,
        toPeriod,
        limit,
      });

      const coverage = buildCoverage(activities, watermarkService);
      const lightRows = activities.map(toLightActivityRow);

      const response: PlayerActivitiesResponse = {
        membershipId,
        coverage,
        activities: lightRows,
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

          const activities = await archiveService.getPlayerActivities(membershipId, {
            game,
            fromPeriod: from,
            toPeriod: to,
            limit,
          });

          const coverage = buildCoverage(activities, watermarkService);
          const lightRows = activities.map(toLightActivityRow);

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
