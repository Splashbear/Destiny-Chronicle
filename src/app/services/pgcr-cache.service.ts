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
    // Ensure id is a string for consistent lookup (matches how it's stored)
    const idStr = String(id);
    return this.dbPromise.then(db => db.get('pgcr', idStr));
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
    // Ensure activityId is a string for consistent lookup
    return this.get(String(activityId));
  }

  async cacheD2PGCR(activityId: string, pgcr: any): Promise<void> {
    return this.set(pgcr);
  }

  // Destiny 1 variants forward to same store for now – future split possible
  async getD1PGCR(activityId: string): Promise<PrunedPgcr | undefined> {
    // Ensure activityId is a string for consistent lookup
    return this.get(String(activityId));
  }

  async cacheD1PGCR(activityId: string, pgcr: any): Promise<void> {
    return this.set(pgcr);
  }

  /**
   * Batch retrieves multiple PGCRs from IndexedDB.
   * More efficient than multiple individual get() calls.
   */
  async getBatch(activityIds: string[]): Promise<Map<string, PrunedPgcr | undefined>> {
    if (activityIds.length === 0) return new Map();
    
    const db = await this.dbPromise;
    const result = new Map<string, PrunedPgcr | undefined>();
    
    // Use a single transaction for better performance
    const tx = db.transaction('pgcr', 'readonly');
    const store = tx.objectStore('pgcr');
    
    for (const id of activityIds) {
      try {
        const pgcr = await store.get(id);
        result.set(id, pgcr);
        if (!pgcr) {
          console.log(`[PGCR] Cache miss for instanceId: ${id} (type: ${typeof id})`);
        }
      } catch (error) {
        console.warn(`[PGCR] Failed to get PGCR ${id}:`, error);
        result.set(id, undefined);
      }
    }
    
    await tx.done;
    return result;
  }

  /**
   * Batch stores multiple PGCRs in a single transaction.
   * More efficient than multiple individual set() calls.
   */
  async setBatch(pgcrs: Array<{ id: string; data: any; requestedMemberId?: string }>): Promise<void> {
    if (pgcrs.length === 0) return;
    
    const db = await this.dbPromise;
    const tx = db.transaction('pgcr', 'readwrite');
    const store = tx.objectStore('pgcr');
    
    const promises = pgcrs.map(async ({ id, data, requestedMemberId }) => {
      try {
        const pruned = prunePgcr(data, requestedMemberId);
        await store.put(pruned);
      } catch (error) {
        console.warn(`[PGCR] Failed to store PGCR ${id}:`, error);
      }
    });
    
    await Promise.all(promises);
    await tx.done;
  }

  /**
   * Checks which PGCRs are missing from the cache.
   * Useful for determining which ones need to be fetched from the API.
   */
  async getMissingPGCRs(activityIds: string[]): Promise<string[]> {
    if (activityIds.length === 0) return [];
    
    const db = await this.dbPromise;
    const missing: string[] = [];
    
    const tx = db.transaction('pgcr', 'readonly');
    const store = tx.objectStore('pgcr');
    
    for (const id of activityIds) {
      try {
        const exists = await store.count(id);
        if (exists === 0) {
          missing.push(id);
        }
      } catch (error) {
        console.warn(`[PGCR] Failed to check PGCR ${id}:`, error);
        missing.push(id);
      }
    }
    
    await tx.done;
    return missing;
  }
} 