import { Injectable } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';
import { prunePgcr, PrunedPgcr } from '../utils/pgcr-prune';

interface ChronicleDB extends IDBPDatabase<any> {}

const DB_NAME = 'DestinyChroniclePgcrCache';
const DB_VERSION = 5;

@Injectable({
  providedIn: 'root'
})
export class PGCRCacheService {
  private dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pgcr')) {
        const store = db.createObjectStore('pgcr', { keyPath: 'id' });
        store.createIndex('period', 'period');
        store.createIndex('member_period', ['member', 'period']);
      }
    }
  });

  /** Retrieve a pruned PGCR from IndexedDB. */
  public get(id: string): Promise<PrunedPgcr | undefined> {
    return this.dbPromise.then(db => db.get('pgcr', id));
  }

  /** Store a full Bungie PGCR (will be pruned before writing). */
  public async set(rawPgcr: any, requestedMemberId?: string): Promise<void> {
    const pruned = prunePgcr(rawPgcr, requestedMemberId);
    (await this.dbPromise).put('pgcr', pruned).catch(console.error);
  }

  /** Get every PGCR whose period falls within one calendar day (ISO yyyy-mm-dd). */
  getForDay(isoDate: string): Promise<PrunedPgcr[]> {
    const lower = isoDate + 'T00:00:00Z';
    const upper = isoDate + 'T23:59:59Z';
    const range = IDBKeyRange.bound(lower, upper);
    return this.dbPromise.then(db => db.getAllFromIndex('pgcr', 'period', range));
  }

  /** Delete PGCRs older than N days, returns number removed. */
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
    return this.get(activityId);
  }

  async cacheD2PGCR(activityId: string, pgcr: any): Promise<void> {
    return this.set(pgcr);
  }

  // Destiny 1 variants forward to same store for now – future split possible
  async getD1PGCR(activityId: string): Promise<PrunedPgcr | undefined> {
    return this.get(activityId);
  }

  async cacheD1PGCR(activityId: string, pgcr: any): Promise<void> {
    return this.set(pgcr);
  }
} 