import { Router, Request, Response } from 'express';
import { ArchiveService } from '../services/archive.service';
import { BungieApiService } from '../services/bungie-api.service';
import { WatermarkService } from '../services/watermark.service';
import { PgcrLite, leanToPgcrLite } from '../types/pgcr-lite.types';
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
 * Prune full Bungie PGCR to PgcrLite format.
 */
function pruneBungiePgcr(bungiePgcr: any): PgcrLite | null {
  try {
    const response = bungiePgcr.Response || bungiePgcr;
    const activityDetails = response.activityDetails || {};
    const entries = response.entries || [];

    if (!activityDetails.instanceId) {
      return null;
    }

    return {
      activityDetails: {
        period: activityDetails.period || new Date().toISOString(),
        instanceId: String(activityDetails.instanceId),
        referenceId: activityDetails.referenceId || 0,
        directorActivityHash: activityDetails.directorActivityHash || 0,
        mode: activityDetails.mode || activityDetails.modes?.[0] || 0,
        isPrivate: activityDetails.isPrivate || false,
      },
      entries: entries.map((entry: any) => ({
        player: {
          destinyUserInfo: {
            membershipId: entry.player?.destinyUserInfo?.membershipId || '',
            membershipType: entry.player?.destinyUserInfo?.membershipType || 0,
            displayName: entry.player?.destinyUserInfo?.displayName || '',
          },
        },
        characterId: entry.characterId || '',
        values: {
          deaths: { basic: { value: entry.values?.deaths?.basic?.value || 0 } },
          kills: { basic: { value: entry.values?.kills?.basic?.value || 0 } },
          assists: { basic: { value: entry.values?.assists?.basic?.value || 0 } },
          completed: { basic: { value: entry.values?.completed?.basic?.value || 0 } },
          activityDurationSeconds: {
            basic: { value: entry.values?.activityDurationSeconds?.basic?.value || 0 },
          },
          standing: { basic: { value: entry.values?.standing?.basic?.value || 0 } },
        },
      })),
    };
  } catch (error) {
    logger.error('Failed to prune Bungie PGCR', { error });
    return null;
  }
}

/**
 * Create DC-facing PGCR router (returns PgcrLite format).
 * Mounted at /pgcr for Destiny Chronicle Angular app compatibility.
 */
export function createDcPgcrRouter(
  archiveService: ArchiveService,
  bungieApiService: BungieApiService,
  watermarkService: WatermarkService
): Router {
  const router = Router();

  /**
   * GET /pgcr/:instanceId?game=D2&format=lite
   * 
   * DC-compatible endpoint returning PgcrLite format.
   * Loads ALL entries for the instance from archive.
   */
  router.get('/:instanceId', async (req: Request, res: Response) => {
    try {
      const instanceId = String(req.params.instanceId || '');
      const game = getStringParam(req.query.game) || 'D2';
      const format = getStringParam(req.query.format) || 'lite';

      if (!instanceId || !/^\d+$/.test(instanceId)) {
        return res.status(400).json({
          error: 'Invalid instance ID',
        });
      }

      logger.info('GET /pgcr/:instanceId', { instanceId, game, format });

      let pgcrLite: PgcrLite | null = null;

      const isCovered = watermarkService.isCovered(instanceId);
      logger.debug('Watermark check', { instanceId, isCovered });

      if (isCovered && archiveService.isAvailable()) {
        try {
          logger.debug('Attempting archive lookup for all entries');
          const activities = await archiveService.getActivitiesByInstanceId(instanceId);
          if (activities.length > 0) {
            pgcrLite = leanToPgcrLite(activities);
            logger.debug('Converted lean to PgcrLite', { entryCount: activities.length });
          }
        } catch (archiveError) {
          logger.warn('Archive read failed, will try live fallback', {
            instanceId,
            error: archiveError,
          });
        }
      }

      if (!pgcrLite) {
        logger.debug('Attempting live Bungie API lookup');
        const bungiePgcr = await bungieApiService.getBungiePgcr(instanceId);
        if (bungiePgcr) {
          pgcrLite = pruneBungiePgcr(bungiePgcr);
        }
      }

      if (!pgcrLite) {
        return res.status(404).json({
          error: 'Activity not found',
          instanceId,
        });
      }

      res.json(pgcrLite);
    } catch (error) {
      logger.error('Error in GET /pgcr/:instanceId', { error });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /pgcr/batch
   * 
   * DC-compatible batch endpoint.
   * Body: { instanceIds: string[], game: 'D1' | 'D2' }
   * Returns: { [instanceId]: PgcrLite }
   */
  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const { instanceIds, game } = req.body;

      if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
        return res.status(400).json({
          error: 'instanceIds array is required',
        });
      }

      logger.info('POST /pgcr/batch', { count: instanceIds.length, game });

      const result: Record<string, PgcrLite> = {};

      for (const instanceId of instanceIds) {
        try {
          const isCovered = watermarkService.isCovered(instanceId);

          let pgcrLite: PgcrLite | null = null;

          if (isCovered && archiveService.isAvailable()) {
            try {
              const activities = await archiveService.getActivitiesByInstanceId(instanceId);
              if (activities.length > 0) {
                pgcrLite = leanToPgcrLite(activities);
              }
            } catch {
              // Fall through to live
            }
          }

          if (!pgcrLite) {
            const bungiePgcr = await bungieApiService.getBungiePgcr(instanceId);
            if (bungiePgcr) {
              pgcrLite = pruneBungiePgcr(bungiePgcr);
            }
          }

          if (pgcrLite) {
            result[instanceId] = pgcrLite;
          }
        } catch (error) {
          logger.warn('Failed to fetch PGCR in batch', { instanceId, error });
        }
      }

      res.json(result);
    } catch (error) {
      logger.error('Error in POST /pgcr/batch', { error });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
