import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { openDB, IDBPDatabase } from 'idb';
import {
  d1PgcrCacheKey,
  isUsablePrunedPgcr,
  normalizePgcrPeriodKey,
  pgcrPeriodMatches,
  prunePgcr,
  PrunedPgcr,
  resolvePgcrPeriod,
} from '../utils/pgcr-prune';

interface ChronicleDB extends IDBPDatabase<any> {}

const DB_NAME = 'DestinyChroniclePgcrCache';
const DB_VERSION = 5;

@Injectable({
  providedIn: 'root'
})
export class PGCRCacheService {
  readonly stored$ = new Subject<void>();

  private dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pgcr')) {
        const store = db.createObjectStore('pgcr', { keyPath: 'id' });
        store.createIndex('period', 'period');
        store.createIndex('member_period', ['member', 'period']);
      }
    }
  });

  public get(id: string): Promise<PrunedPgcr | undefined> {
    const idStr = String(id);
    return this.dbPromise.then(db => db.get('pgcr', idStr));
  }

  public async set(
    rawPgcr: any,
    requestedMemberId?: string,
    opts?: { isD1?: boolean; fireteamOnly?: boolean }
  ): Promise<void> {
    const pruned = prunePgcr(rawPgcr, requestedMemberId, {
      isD1: opts?.isD1,
      fireteamOnly: opts?.fireteamOnly,
    });
    await (await this.dbPromise).put('pgcr', pruned);
    this.stored$.next();
  }

  getForDay(isoDate: string): Promise<PrunedPgcr[]> {
    const lower = isoDate + 'T00:00:00Z';
    const upper = isoDate + 'T23:59:59Z';
    const range = IDBKeyRange.bound(lower, upper);
    return this.dbPromise.then(db => db.getAllFromIndex('pgcr', 'period', range));
  }

  async purgeOlderThan(days = 365): Promise<number> {
    const cutoff = new Date(Date.now() - days * 864e5).toISOString();
    const db = await this.dbPromise;
    let removed = 0;
    const tx = db.transaction('pgcr', 'readwrite');
    const index = tx.store.index('period');
    for await (const cursor of index.iterate()) {
      if (cursor.key < cutoff) {
        cursor.delete();
        removed++;
      }
    }
    await tx.done;
    return removed;
  }

  async getD2PGCR(activityId: string): Promise<PrunedPgcr | undefined> {
    return this.get(String(activityId));
  }

  async cacheD2PGCR(activityId: string, pgcr: any): Promise<void> {
    return this.set(pgcr);
  }

  async getD1PGCR(activityId: string, activityPeriod?: string): Promise<PrunedPgcr | undefined> {
    const idStr = String(activityId);
    const accept = (candidate: PrunedPgcr | undefined): PrunedPgcr | undefined => {
      if (!candidate) {
        return undefined;
      }
      if (
        activityPeriod &&
        !pgcrPeriodMatches(activityPeriod, candidate.period, 3_600_000)
      ) {
        return undefined;
      }
      return isUsablePrunedPgcr(candidate) ? candidate : undefined;
    };

    if (activityPeriod) {
      const keyed = accept(await this.get(d1PgcrCacheKey(idStr, activityPeriod)));
      if (keyed) {
        return keyed;
      }
      const legacyKeyed = accept(await this.get(`d1|${idStr}|${activityPeriod.trim()}`));
      if (legacyKeyed) {
        return legacyKeyed;
      }
      const legacy = accept(await this.get(idStr));
      if (legacy) {
        return legacy;
      }
      return undefined;
    }
    const bare = await this.get(idStr);
    return isUsablePrunedPgcr(bare) ? bare : undefined;
  }

  /** Cache full D1 instance (all players); filter fireteam when displaying Activities popup. */
  async cacheD1PGCR(
    activityId: string,
    pgcr: any,
    requestedMemberId?: string,
    activityPeriod?: string
  ): Promise<void> {
    const period = normalizePgcrPeriodKey(activityPeriod || resolvePgcrPeriod(pgcr));
    const pruned = prunePgcr(pgcr, requestedMemberId, { isD1: true, fireteamOnly: false });
    if (!isUsablePrunedPgcr(pruned)) {
      return;
    }
    if (period) {
      pruned.id = d1PgcrCacheKey(String(activityId), period);
    }
    await (await this.dbPromise).put('pgcr', pruned);
    this.stored$.next();
  }

  async cacheD1PGCRFull(activityId: string, pgcr: any): Promise<void> {
    return this.cacheD1PGCR(activityId, pgcr);
  }

  async getBatch(activityIds: string[]): Promise<Map<string, PrunedPgcr | undefined>> {
    if (activityIds.length === 0) {
      return new Map();
    }

    const db = await this.dbPromise;
    const result = new Map<string, PrunedPgcr | undefined>();
    const tx = db.transaction('pgcr', 'readonly');
    const store = tx.objectStore('pgcr');

    for (const id of activityIds) {
      try {
        const pgcr = await store.get(id);
        result.set(id, pgcr);
      } catch (error) {
        console.warn(`[PGCR] Failed to get PGCR ${id}:`, error);
        result.set(id, undefined);
      }
    }

    await tx.done;
    return result;
  }

  async setBatch(
    pgcrs: Array<{
      id: string;
      data: any;
      requestedMemberId?: string;
      isD1?: boolean;
      fireteamOnly?: boolean;
    }>
  ): Promise<void> {
    if (pgcrs.length === 0) {
      return;
    }

    const db = await this.dbPromise;
    const tx = db.transaction('pgcr', 'readwrite');
    const store = tx.objectStore('pgcr');

    const promises = pgcrs.map(async ({ id, data, requestedMemberId, isD1, fireteamOnly }) => {
      try {
        const pruned = prunePgcr(data, requestedMemberId, { isD1, fireteamOnly });
        if (isD1) {
          const period = normalizePgcrPeriodKey(resolvePgcrPeriod(data));
          const instanceId = String(data?.activityDetails?.instanceId ?? id);
          pruned.id = period ? d1PgcrCacheKey(instanceId, period) : String(id);
        } else {
          pruned.id = String(id);
        }
        await store.put(pruned);
      } catch (error) {
        console.warn(`[PGCR] Failed to store PGCR ${id}:`, error);
      }
    });

    await Promise.all(promises);
    await tx.done;
    this.stored$.next();
  }

  async getMissingPGCRs(activityIds: string[]): Promise<string[]> {
    if (activityIds.length === 0) {
      return [];
    }

    const missing: string[] = [];
    const chunkSize = 500;
    for (let i = 0; i < activityIds.length; i += chunkSize) {
      const chunk = activityIds.slice(i, i + chunkSize);
      const batch = await this.getBatch(chunk);
      for (const id of chunk) {
        if (!batch.get(id)) {
          missing.push(id);
        }
      }
    }
    return missing;
  }
}
