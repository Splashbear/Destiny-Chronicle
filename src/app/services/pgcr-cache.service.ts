import { Injectable } from '@angular/core';

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

  constructor() {}

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
} 