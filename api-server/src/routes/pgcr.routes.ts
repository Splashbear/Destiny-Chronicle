import { Router, Request, Response } from 'express';
import { ArchiveService } from '../services/archive.service';
import { BungieApiService } from '../services/bungie-api.service';
import { WatermarkService } from '../services/watermark.service';
import {
  LeanActivity,
  MembershipActivitiesResponse,
  InstanceResponse,
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

export function createPgcrRouter(
  archiveService: ArchiveService,
  bungieApiService: BungieApiService,
  watermarkService: WatermarkService
): Router {
  const router = Router();

  /**
   * GET /api/pgcr/watermark
   * 
   * Get current watermark information.
   * MUST be registered BEFORE /:instanceId param route.
   */
  router.get('/watermark', async (req: Request, res: Response) => {
    try {
      const watermark = watermarkService.getWatermark();

      if (!watermark) {
        return res.status(404).json({
          error: 'Watermark not available',
        });
      }

      res.json(watermark);
    } catch (error) {
      logger.error('Error in GET /api/pgcr/watermark', { error });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/pgcr/activities?membershipId=<membershipId>
   * 
   * Get all activities for a membership.
   * Returns archived activities if available, otherwise empty array.
   * Note: Live Bungie API doesn't have a direct membership→all-activities endpoint,
   * so we only return archived data here.
   * MUST be registered BEFORE /:instanceId param route.
   */
  router.get('/activities', async (req: Request, res: Response) => {
    try {
      const membershipId = getStringParam(req.query.membershipId);

      if (!membershipId) {
        return res.status(400).json({
          error: 'membershipId query parameter is required',
        });
      }

      logger.info('GET /api/pgcr/activities', { membershipId });

      if (!archiveService.isAvailable()) {
        logger.warn('Archive not available, returning empty activities');
        return res.json({
          membership_id: membershipId,
          activities: [],
          source: 'archive',
          count: 0,
        } as MembershipActivitiesResponse);
      }

      const activities = await archiveService.getActivitiesByMembership(membershipId);

      const response: MembershipActivitiesResponse = {
        membership_id: membershipId,
        activities,
        source: 'archive',
        count: activities.length,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in GET /api/pgcr/activities', { error });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/pgcr/:instanceId
   * 
   * Get a single activity by instance ID.
   * Uses watermark to route: archive if ≤ watermark, otherwise live Bungie API.
   * MUST be registered AFTER static routes (/watermark, /activities).
   */
  router.get('/:instanceId', async (req: Request, res: Response) => {
    try {
      const instanceId = String(req.params.instanceId || '');

      if (!instanceId || !/^\d+$/.test(instanceId)) {
        return res.status(400).json({
          error: 'Invalid instance ID',
        });
      }

      logger.info('GET /api/pgcr/:instanceId', { instanceId });

      let activity: LeanActivity | null = null;
      let source: 'archive' | 'live' = 'live';

      const isCovered = watermarkService.isCovered(instanceId);
      logger.debug('Watermark check', { instanceId, isCovered });

      if (isCovered && archiveService.isAvailable()) {
        try {
          logger.debug('Attempting archive lookup');
          activity = await archiveService.getActivityByInstanceId(instanceId);
          if (activity) {
            source = 'archive';
          }
        } catch (archiveError) {
          logger.warn('Archive read failed for covered ID, will try live fallback', {
            instanceId,
            error: archiveError,
          });
        }
      }

      if (!activity) {
        logger.debug('Attempting live Bungie API lookup');
        activity = await bungieApiService.getActivityByInstanceId(instanceId);
        source = 'live';
      }

      if (!activity) {
        return res.status(404).json({
          error: 'Activity not found',
          instance_id: instanceId,
        });
      }

      const response: InstanceResponse = {
        instance_id: instanceId,
        activity,
        source,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error in GET /api/pgcr/:instanceId', { error });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
