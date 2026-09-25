import { Router, Request, Response } from 'express';
import { ArchiveService } from '../services/archive.service';
import { BungieApiError, BungieApiService, Game, parseGame, resolvePgcrPeriod, unwrapPgcrBody } from '../services/bungie-api.service';
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
 * Prune full Bungie PGCR (D1 or D2 envelope) to PgcrLite format.
 * - D1 reports live under Response.data; D2 under Response.
 * - `period` is read from the report body (Bungie puts it next to activityDetails, not inside it).
 *   Missing period stays null; it is never replaced with the current time.
 * - Rejects a body whose instanceId differs from the one requested.
 */
export function pruneBungiePgcr(bungiePgcr: any, game: Game, requestedInstanceId: string): PgcrLite | null {
  try {
    const body = unwrapPgcrBody(bungiePgcr, game);
    const activityDetails = body?.activityDetails;
    const entries = body?.entries || [];

    if (!activityDetails) {
      return null;
    }

    const bodyInstanceId = activityDetails.instanceId != null ? String(activityDetails.instanceId) : requestedInstanceId;
    if (bodyInstanceId !== requestedInstanceId) {
      logger.warn('Bungie PGCR instanceId mismatch', { requestedInstanceId, bodyInstanceId, game });
      return null;
    }

    const period = resolvePgcrPeriod(body);
    if (!period) {
      logger.warn('Bungie PGCR has no period; returning null period', { instanceId: requestedInstanceId, game });
    }

    return {
      game,
      _source: 'live',
      activityDetails: {
        period,
        instanceId: bodyInstanceId,
        referenceId: activityDetails.referenceId ?? 0,
        directorActivityHash: activityDetails.directorActivityHash ?? 0,
        mode: activityDetails.mode ?? activityDetails.modes?.[0] ?? 0,
        isPrivate: activityDetails.isPrivate || false,
      },
      entries: entries.map((entry: any) => ({
        player: {
          destinyUserInfo: {
            membershipId: String(entry.player?.destinyUserInfo?.membershipId ?? ''),
            membershipType: entry.player?.destinyUserInfo?.membershipType || 0,
            displayName: entry.player?.destinyUserInfo?.displayName || '',
          },
        },
        characterId: String(entry.characterId ?? ''),
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
 * Resolve one PGCR for a specific game: archive first (filtered by game), then the
 * game-correct Bungie endpoint. The coverage watermark is a D2 instance-ID watermark,
 * so it only gates D2 archive lookups.
 */
async function resolvePgcr(
  instanceId: string,
  game: Game,
  archiveService: ArchiveService,
  bungieApiService: BungieApiService,
  watermarkService: WatermarkService
): Promise<PgcrLite | null> {
  const tryArchive = archiveService.isAvailable() && (game !== 'D2' || watermarkService.isCovered(instanceId));
  if (tryArchive) {
    try {
      const activities = await archiveService.getActivitiesByInstanceId(instanceId, game);
      if (activities.length > 0) {
        return leanToPgcrLite(activities);
      }
    } catch (archiveError) {
      logger.warn('Archive read failed, will try live fallback', { instanceId, game, error: archiveError });
    }
  }

  const bungiePgcr = await bungieApiService.getBungiePgcr(instanceId, game);
  return bungiePgcr ? pruneBungiePgcr(bungiePgcr, game, instanceId) : null;
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
    const instanceId = String(req.params.instanceId || '');
    const game = parseGame(getStringParam(req.query.game) || 'D2');
    try {
      const format = getStringParam(req.query.format) || 'lite';

      if (!instanceId || !/^\d+$/.test(instanceId)) {
        return res.status(400).json({
          error: 'Invalid instance ID',
        });
      }
      if (!game) {
        return res.status(400).json({ error: 'Invalid game (expected D1 or D2)' });
      }

      logger.info('GET /pgcr/:instanceId', { instanceId, game, format });

      const pgcrLite = await resolvePgcr(instanceId, game, archiveService, bungieApiService, watermarkService);

      if (!pgcrLite) {
        return res.status(404).json({
          error: 'Activity not found',
          instanceId,
          game,
        });
      }

      res.json(pgcrLite);
    } catch (error) {
      if (error instanceof BungieApiError) {
        return res.status(502).json({
          error: 'Upstream Bungie API error',
          instanceId,
          game,
          errorCode: error.errorCode,
          errorStatus: error.errorStatus,
        });
      }
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
      const { instanceIds } = req.body;
      const game = parseGame(req.body?.game ?? 'D2');

      if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
        return res.status(400).json({
          error: 'instanceIds array is required',
        });
      }
      if (!game) {
        return res.status(400).json({ error: 'Invalid game (expected D1 or D2)' });
      }

      logger.info('POST /pgcr/batch', { count: instanceIds.length, game });

      const result: Record<string, PgcrLite> = {};

      for (const rawId of instanceIds) {
        const instanceId = String(rawId);
        if (!/^\d+$/.test(instanceId)) {
          continue;
        }
        try {
          const pgcrLite = await resolvePgcr(instanceId, game, archiveService, bungieApiService, watermarkService);
          if (pgcrLite) {
            result[instanceId] = pgcrLite;
          }
        } catch (error) {
          logger.warn('Failed to fetch PGCR in batch', { instanceId, game, error });
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
