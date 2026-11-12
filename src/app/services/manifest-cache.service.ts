import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

interface CachedManifestData {
  hash: string;
  data: any;
  timestamp: number;
}

/** Dedicated IDB store — avoids ActivityDb ↔ Manifest circular DI. */
class ManifestCacheDb extends Dexie {
  entries!: Table<CachedManifestData, string>;

  constructor() {
    super('DestinyChronicleManifestCache');
    this.version(1).stores({
      entries: 'hash, timestamp',
    });
  }
}

/**
 * Manifest component cache in IndexedDB (memory mirror for hot reads).
 * Replaces the old localStorage JSON blob that blocked the main thread / hit quota.
 */
@Injectable({
  providedIn: 'root'
})
export class ManifestCacheService {
  /** Legacy localStorage key — removed on first load after this change. */
  static readonly LEGACY_LOCAL_STORAGE_KEY = 'destiny_manifest_cache';

  private readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly db = new ManifestCacheDb();
  private readonly memory = new Map<string, CachedManifestData>();
  private ready: Promise<void>;

  constructor() {
    this.purgeLegacyLocalStorage();
    this.ready = this.hydrateFromIdb();
  }

  /** Build a stable cache key for a manifest component (culture + version + component). */
  manifestComponentKey(version: string, culture: string, component: string): string {
    return `d2-${version}-${culture}-${component}`;
  }

  async getManifestData(hash: string): Promise<any | null> {
    await this.ready;
    const mem = this.memory.get(hash);
    if (mem) {
      if (Date.now() - mem.timestamp >= this.CACHE_EXPIRY) {
        this.memory.delete(hash);
        void this.db.entries.delete(hash).catch(() => undefined);
        return null;
      }
      mem.timestamp = Date.now();
      void this.db.entries.put(mem).catch(err => this.onQuotaError('touch', err));
      return mem.data;
    }

    try {
      const entry = await this.db.entries.get(hash);
      if (!entry) return null;
      if (Date.now() - entry.timestamp >= this.CACHE_EXPIRY) {
        await this.db.entries.delete(hash);
        return null;
      }
      entry.timestamp = Date.now();
      this.memory.set(hash, entry);
      void this.db.entries.put(entry).catch(err => this.onQuotaError('touch', err));
      return entry.data;
    } catch (err) {
      this.onQuotaError('get', err);
      return null;
    }
  }

  async cacheManifestData(hash: string, data: any): Promise<void> {
    await this.ready;
    const entry: CachedManifestData = {
      hash,
      data,
      timestamp: Date.now(),
    };
    this.memory.set(hash, entry);
    try {
      await this.db.entries.put(entry);
      await this.cleanCache();
    } catch (err) {
      this.onQuotaError('put', err);
    }
  }

  async clearCache(): Promise<void> {
    this.memory.clear();
    this.purgeLegacyLocalStorage();
    try {
      await this.db.entries.clear();
    } catch (err) {
      this.onQuotaError('clear', err);
    }
  }

  async getCacheStats(): Promise<{ total: number; size: number }> {
    await this.ready;
    try {
      const total = await this.db.entries.count();
      // Size estimate from in-memory mirror only (avoid serializing all IDB rows on the main thread).
      const size = new Blob([JSON.stringify([...this.memory.values()])]).size;
      return { total, size };
    } catch {
      return { total: this.memory.size, size: 0 };
    }
  }

  private purgeLegacyLocalStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(ManifestCacheService.LEGACY_LOCAL_STORAGE_KEY);
      }
    } catch {
      // Private mode / quota — ignore.
    }
  }

  private async hydrateFromIdb(): Promise<void> {
    try {
      const now = Date.now();
      const rows = await this.db.entries.toArray();
      for (const row of rows) {
        if (now - row.timestamp < this.CACHE_EXPIRY) {
          this.memory.set(row.hash, row);
        }
      }
    } catch (err) {
      this.onQuotaError('hydrate', err);
    }
  }

  private async cleanCache(): Promise<void> {
    const now = Date.now();
    const entries = await this.db.entries.toArray();
    const valid = entries.filter(e => now - e.timestamp < this.CACHE_EXPIRY);
    valid.sort((a, b) => b.timestamp - a.timestamp);
    const keep = valid.slice(0, this.MAX_CACHE_SIZE);
    const keepHashes = new Set(keep.map(e => e.hash));
    const drop = entries.filter(e => !keepHashes.has(e.hash)).map(e => e.hash);
    if (drop.length) {
      await this.db.entries.bulkDelete(drop);
      for (const h of drop) this.memory.delete(h);
    }
  }

  private onQuotaError(op: string, err: unknown): void {
    console.warn(`[ManifestCache] ${op} failed (continuing without persistent cache):`, err);
  }
}
