import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from './bungie-api.service';
import { PGCRCacheService } from './pgcr-cache.service';
import { FireteamStatsService, MissingPgcrEntry } from './fireteam-stats.service';
import { d1PgcrCacheKey, prunePgcr, PrunedPgcr, resolvePgcrPeriod } from '../utils/pgcr-prune';

export interface PlayedWithPrefetchProgress {
  /** Successfully cached PGCRs this run (not failed/expired attempts). */
  fetchedThisRun: number;
  /** PGCRs still to attempt this run. */
  remainingThisRun: number;
  active: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PlayedWithPrefetchService {
  readonly progress$ = new BehaviorSubject<PlayedWithPrefetchProgress>({
    fetchedThisRun: 0,
    remainingThisRun: 0,
    active: false
  });

  /** ~6 parallel connections per origin in browsers — stay near that limit. */
  private readonly minConcurrency = 4;
  private readonly maxConcurrency = 10;
  private readonly initialConcurrency = 8;
  private readonly cacheWriteBatchSize = 16;

  private cancelToken = 0;
  private concurrency = this.initialConcurrency;

  constructor(
    private bungie: BungieApiService,
    private pgcrCache: PGCRCacheService,
    private fireteamStats: FireteamStatsService
  ) {}

  cancel(): void {
    this.cancelToken++;
    this.concurrency = this.initialConcurrency;
    this.progress$.next({ fetchedThisRun: 0, remainingThisRun: 0, active: false });
  }

  async prefetchForMemberships(
    membershipIds: string[],
    onPgcrBatch: (pgcrs: PrunedPgcr[]) => void
  ): Promise<void> {
    this.cancel();
    const token = this.cancelToken;
    this.concurrency = this.initialConcurrency;

    if (!membershipIds.length) {
      return;
    }

    const queue = await this.fireteamStats.collectMissingPgcrQueue(membershipIds);
    if (token !== this.cancelToken) {
      return;
    }

    if (queue.length === 0) {
      this.progress$.next({ fetchedThisRun: 0, remainingThisRun: 0, active: false });
      return;
    }

    let fetchedThisRun = 0;
    let remainingThisRun = queue.length;
    this.progress$.next({ fetchedThisRun, remainingThisRun, active: true });

    const pendingWrites: Array<{ id: string; data: unknown; pruned: PrunedPgcr; isD1: boolean }> = [];
    let rateLimitUntil = 0;
    let index = 0;
    let inFlight = 0;

    const emitProgress = (): void => {
      if (token === this.cancelToken) {
        this.progress$.next({
          fetchedThisRun,
          remainingThisRun,
          active: remainingThisRun > 0 || inFlight > 0
        });
      }
    };

    const flushWrites = async (): Promise<void> => {
      if (pendingWrites.length === 0 || token !== this.cancelToken) {
        return;
      }
      const batch = pendingWrites.splice(0, pendingWrites.length);
      await this.pgcrCache.setBatch(
        batch.map(({ id, data, isD1 }) => ({ id, data, isD1 }))
      );
      fetchedThisRun += batch.length;
      remainingThisRun = Math.max(0, queue.length - index);
      onPgcrBatch(batch.map(b => b.pruned));
      emitProgress();
    };

    const handleRateLimit = (): void => {
      rateLimitUntil = Date.now() + 2500;
      this.concurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.concurrency * 0.6)
      );
    };

    const isRateLimitError = (err: unknown): boolean => {
      const status = (err as { status?: number })?.status;
      const message = String((err as Error)?.message ?? err ?? '');
      return status === 429 || /429|throttle|rate limit/i.test(message);
    };

    const fetchOne = async (entry: MissingPgcrEntry): Promise<void> => {
      while (Date.now() < rateLimitUntil && token === this.cancelToken) {
        await sleep(50);
      }
      if (token !== this.cancelToken) {
        return;
      }

      try {
        const raw = await firstValueFrom(this.bungie.getPGCR(entry.id, entry.isD1));
        const period = entry.period || resolvePgcrPeriod(raw);
        const cacheId = entry.isD1 && period ? d1PgcrCacheKey(entry.id, period) : entry.id;
        const pruned = prunePgcr(raw, undefined, { isD1: entry.isD1 });
        pruned.id = cacheId;
        pendingWrites.push({ id: cacheId, data: raw, pruned, isD1: entry.isD1 });
        if (pendingWrites.length >= this.cacheWriteBatchSize) {
          await flushWrites();
        }
      } catch (err) {
        if (isRateLimitError(err)) {
          handleRateLimit();
        }
      }
    };

    await new Promise<void>(resolve => {
      const pump = (): void => {
        if (token !== this.cancelToken) {
          resolve();
          return;
        }

        while (inFlight < this.concurrency && index < queue.length) {
          const entry = queue[index++];
          inFlight++;
          remainingThisRun = Math.max(0, queue.length - index);
          emitProgress();
          fetchOne(entry).finally(() => {
            inFlight--;
            if (token !== this.cancelToken) {
              resolve();
              return;
            }
            if (index >= queue.length && inFlight === 0) {
              resolve();
              return;
            }
            pump();
          });
        }
      };
      pump();
    });

    if (token === this.cancelToken) {
      await flushWrites();
      this.progress$.next({ fetchedThisRun, remainingThisRun: 0, active: false });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
