import { logger } from '../utils/logger';
import { BungieApiError, BungieApiService, Game } from './bungie-api.service';
import { FlagLookupService } from './flag-lookup.service';
import { PgcrOverrideStore } from './pgcr-override.store';

/**
 * Service that implements fix-on-view for flagged D2 PGCRs.
 * 
 * When a flagged PGCR is requested:
 * 1. Check if override already exists -> serve it
 * 2. Otherwise, fetch from Bungie (async or with brief wait)
 * 3. Save to override store
 * 4. Return corrected PGCR
 * 
 * First view may return dump copy with 'verifying' marker or wait briefly.
 */

export interface FixOnViewStats {
  flaggedRequests: number;
  overrideHits: number;
  bungieFetches: number;
  bungieFetchErrors: number;
  overridesSaved: number;
}

export interface FixOnViewConfig {
  /**
   * Max time to wait for Bungie fetch on first view (ms).
   * 0 = return immediately with 'verifying' marker
   * 1000-3000 = brief wait (recommended)
   * undefined = wait indefinitely (not recommended for user requests)
   */
  firstViewWaitMs?: number;

  /**
   * Enable async background fix without blocking the response.
   * When true and override doesn't exist, triggers background fetch and returns null immediately.
   */
  asyncFix?: boolean;
}

export class FixOnViewService {
  private stats: FixOnViewStats = {
    flaggedRequests: 0,
    overrideHits: 0,
    bungieFetches: 0,
    bungieFetchErrors: 0,
    overridesSaved: 0,
  };

  constructor(
    private flagLookup: FlagLookupService,
    private overrideStore: PgcrOverrideStore,
    private bungieApi: BungieApiService,
    private config: FixOnViewConfig = {}
  ) {}

  /**
   * Get corrected PGCR if flagged, otherwise return null.
   * Null means: use the archive copy.
   * 
   * When flagged:
   * - Override exists -> return it
   * - Otherwise -> fetch from Bungie (respecting config.firstViewWaitMs)
   */
  async getCorrectedPgcr(instanceId: string, game: Game): Promise<any | null> {
    // Check if flagged
    if (!this.flagLookup.isFlagged(instanceId, game)) {
      return null; // Not flagged, use archive
    }

    this.stats.flaggedRequests++;
    logger.debug('Flagged PGCR requested', { instanceId, game });

    // Check override store first
    const existing = this.overrideStore.get(instanceId, game);
    if (existing) {
      this.stats.overrideHits++;
      logger.debug('Serving PGCR from override store', { instanceId, game });
      return existing;
    }

    // Override doesn't exist, need to fetch from Bungie
    const waitMs = this.config.firstViewWaitMs ?? 2000; // Default: 2s wait
    const asyncFix = this.config.asyncFix ?? false;

    if (asyncFix || waitMs === 0) {
      // Trigger async fix and return null immediately
      this.fetchAndSaveAsync(instanceId, game).catch((error) => {
        logger.warn('Async PGCR fix failed', { instanceId, game, error });
      });
      logger.debug('Triggering async PGCR fix', { instanceId, game });
      return null; // Caller will serve dump copy
    }

    // Wait briefly for Bungie fetch
    try {
      const bungiePgcr = await this.fetchWithTimeout(instanceId, game, waitMs);
      if (bungiePgcr) {
        this.overrideStore.put(instanceId, game, bungiePgcr);
        this.stats.overridesSaved++;
        logger.info('Fetched and saved corrected PGCR', { instanceId, game });
        return bungiePgcr;
      }
    } catch (error) {
      if (error instanceof BungieApiError) {
        // Bungie error -> don't retry, serve dump copy
        this.stats.bungieFetchErrors++;
        logger.warn('Bungie fetch failed for flagged PGCR, will serve dump copy', {
          instanceId,
          game,
          errorCode: error.errorCode,
          errorStatus: error.errorStatus,
        });
        return null;
      }
      // Timeout or other error -> serve dump copy
      logger.warn('Timed out fetching corrected PGCR, will serve dump copy', { instanceId, game, error });
      // Trigger async retry
      this.fetchAndSaveAsync(instanceId, game).catch(() => {});
      return null;
    }

    return null; // Fallback to dump copy
  }

  /**
   * Fetch PGCR from Bungie with timeout using Promise.race.
   */
  private async fetchWithTimeout(instanceId: string, game: Game, timeoutMs: number): Promise<any | null> {
    this.stats.bungieFetches++;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    });

    const fetchPromise = this.bungieApi.getBungiePgcr(instanceId, game);

    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      if ((error as Error).message === 'Timeout') {
        throw new Error('Timeout');
      }
      throw error;
    }
  }

  /**
   * Fetch and save PGCR asynchronously without blocking.
   */
  private async fetchAndSaveAsync(instanceId: string, game: Game): Promise<void> {
    try {
      // Check again if override exists (might have been created by another request)
      if (this.overrideStore.exists(instanceId, game)) {
        return;
      }

      this.stats.bungieFetches++;
      const bungiePgcr = await this.bungieApi.getBungiePgcr(instanceId, game);
      if (bungiePgcr) {
        this.overrideStore.put(instanceId, game, bungiePgcr);
        this.stats.overridesSaved++;
        logger.info('Async fixed PGCR', { instanceId, game });
      }
    } catch (error) {
      this.stats.bungieFetchErrors++;
      if (error instanceof BungieApiError) {
        // Bungie error (e.g., privacy, not found, disabled) -> permanent failure, don't retry
        logger.warn('Bungie API error during async fix (will not retry)', {
          instanceId,
          game,
          errorCode: error.errorCode,
          errorStatus: error.errorStatus,
        });
      } else {
        // Transient error -> could retry later, but for now just log
        logger.error('Failed to async fix PGCR', { instanceId, game, error });
      }
      throw error;
    }
  }

  /**
   * Batch check if overrides exist (for Played With summary builds).
   * Returns Set of instance IDs that have overrides.
   */
  async getExistingOverrides(instanceIds: string[], game: Game): Promise<Set<string>> {
    const existing = new Set<string>();
    for (const instanceId of instanceIds) {
      if (this.overrideStore.exists(instanceId, game)) {
        existing.add(instanceId);
      }
    }
    return existing;
  }

  /**
   * Pre-fix multiple PGCRs (for batch jobs).
   * Returns list of instance IDs that failed to fix.
   */
  async batchFix(
    instanceIds: string[],
    game: Game,
    onProgress?: (done: number, total: number) => void
  ): Promise<string[]> {
    const todo = instanceIds.filter((id) => !this.overrideStore.exists(id, game));
    const failed: string[] = [];
    let done = 0;

    onProgress?.(0, todo.length);

    for (const instanceId of todo) {
      try {
        this.stats.bungieFetches++;
        const bungiePgcr = await this.bungieApi.getBungiePgcr(instanceId, game);
        if (bungiePgcr) {
          this.overrideStore.put(instanceId, game, bungiePgcr);
          this.stats.overridesSaved++;
        } else {
          failed.push(instanceId);
        }
      } catch (error) {
        this.stats.bungieFetchErrors++;
        failed.push(instanceId);
        if (error instanceof BungieApiError) {
          logger.warn('Bungie error during batch fix', {
            instanceId,
            game,
            errorCode: error.errorCode,
            errorStatus: error.errorStatus,
          });
        } else {
          logger.error('Failed to fix PGCR in batch', { instanceId, game, error });
        }
      }

      done++;
      onProgress?.(done, todo.length);
    }

    return failed;
  }

  /**
   * Get current statistics.
   */
  getStats(): FixOnViewStats {
    return { ...this.stats };
  }

  /**
   * Check if service is available.
   */
  isAvailable(): boolean {
    return this.flagLookup.isAvailable() && this.overrideStore.isAvailable();
  }
}
