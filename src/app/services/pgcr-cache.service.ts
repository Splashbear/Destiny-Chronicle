import { Injectable, Inject } from '@angular/core';
import { Cache } from './cache.service';

interface CachedPGCR {
  activityId: string;
  timestamp: number;
  data: any;
  isFullData: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PGCRCacheService {
  private readonly CACHE_KEY = 'destiny_pgcr_cache';
  private readonly MAX_CACHE_SIZE = 50; // Maximum number of PGCRs to cache
  private readonly CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private d2PgcrCache: Cache<any>;
  private d1PgcrCache: Cache<any>;

  constructor() {
    this.d2PgcrCache = new Cache<any>('d2-pgcr-cache', 24 * 60 * 60 * 1000); // 24 hours
    this.d1PgcrCache = new Cache<any>('d1-pgcr-cache', 24 * 60 * 60 * 1000); // 24 hours
  }

  private getCache(): CachedPGCR[] {
    const cached = localStorage.getItem(this.CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  }

  private saveCache(cache: CachedPGCR[]): void {
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
  }

  private cleanCache(): void {
    const cache = this.getCache();
    const now = Date.now();

    // Remove expired entries
    const validEntries = cache.filter(entry => 
      now - entry.timestamp < this.CACHE_EXPIRY
    );

    // If still over limit, remove oldest entries
    if (validEntries.length > this.MAX_CACHE_SIZE) {
      validEntries.sort((a, b) => b.timestamp - a.timestamp);
      validEntries.splice(this.MAX_CACHE_SIZE);
    }

    this.saveCache(validEntries);
  }

  getPGCR(activityId: string): any | null {
    const cache = this.getCache();
    const entry = cache.find(e => e.activityId === activityId);
    
    if (!entry) {
      return null;
    }

    // Update timestamp to mark as recently used
    entry.timestamp = Date.now();
    this.saveCache(cache);

    return entry.data;
  }

  cachePGCR(activityId: string, data: any, isFullData: boolean = false): void {
    const cache = this.getCache();
    
    // Remove existing entry if present
    const existingIndex = cache.findIndex(e => e.activityId === activityId);
    if (existingIndex !== -1) {
      cache.splice(existingIndex, 1);
    }

    // Add new entry
    cache.push({
      activityId,
      timestamp: Date.now(),
      data,
      isFullData
    });

    this.cleanCache();
  }

  cacheMinimalPGCR(activityId: string, minimalData: any): void {
    this.cachePGCR(activityId, minimalData, false);
  }

  cacheFullPGCR(activityId: string, fullData: any): void {
    this.cachePGCR(activityId, fullData, true);
  }

  clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY);
    this.d2PgcrCache.clear();
    this.d1PgcrCache.clear();
  }

  getCacheStats(): { total: number; fullData: number; size: number } {
    const cache = this.getCache();
    const fullDataCount = cache.filter(e => e.isFullData).length;
    const cacheSize = new Blob([JSON.stringify(cache)]).size;

    return {
      total: cache.length,
      fullData: fullDataCount,
      size: cacheSize
    };
  }

  /**
   * Caches a D2 PGCR (Post Game Carnage Report).
   * @param activityId The ID of the activity to cache.
   * @param pgcr The PGCR data to cache.
   */
  cacheD2PGCR(activityId: string, pgcr: any): void {
    this.d2PgcrCache.set(activityId, pgcr);
  }

  /**
   * Gets a cached D2 PGCR (Post Game Carnage Report).
   * @param activityId The ID of the activity to get.
   * @returns The cached PGCR data, or undefined if not cached.
   */
  getD2PGCR(activityId: string): any {
    return this.d2PgcrCache.get(activityId);
  }

  /**
   * Caches a D1 PGCR (Post Game Carnage Report).
   * @param activityId The ID of the activity to cache.
   * @param pgcr The PGCR data to cache.
   */
  cacheD1PGCR(activityId: string, pgcr: any): void {
    this.d1PgcrCache.set(activityId, pgcr);
  }

  /**
   * Gets a cached D1 PGCR (Post Game Carnage Report).
   * @param activityId The ID of the activity to get.
   * @returns The cached PGCR data, or undefined if not cached.
   */
  getD1PGCR(activityId: string): any {
    return this.d1PgcrCache.get(activityId);
  }
} 