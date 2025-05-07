import { Injectable } from '@angular/core';

interface CachedManifestData {
  hash: string;
  data: any;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class ManifestCacheService {
  private readonly CACHE_KEY = 'destiny_manifest_cache';
  private readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private readonly MAX_CACHE_SIZE = 1000; // Maximum number of manifest entries to cache

  constructor() {}

  private getCache(): { [key: string]: CachedManifestData } {
    const cached = localStorage.getItem(this.CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  }

  private saveCache(cache: { [key: string]: CachedManifestData }): void {
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
  }

  private cleanCache(): void {
    const cache = this.getCache();
    const now = Date.now();
    const entries = Object.entries(cache);

    // Remove expired entries
    const validEntries = entries.filter(([_, entry]) => 
      now - entry.timestamp < this.CACHE_EXPIRY
    );

    // If still over limit, remove oldest entries
    if (validEntries.length > this.MAX_CACHE_SIZE) {
      validEntries.sort(([_, a], [__, b]) => b.timestamp - a.timestamp);
      validEntries.splice(this.MAX_CACHE_SIZE);
    }

    // Convert back to object
    const newCache = Object.fromEntries(validEntries);
    this.saveCache(newCache);
  }

  getManifestData(hash: string): any | null {
    const cache = this.getCache();
    const entry = cache[hash];
    
    if (!entry) {
      return null;
    }

    // Update timestamp to mark as recently used
    entry.timestamp = Date.now();
    this.saveCache(cache);

    return entry.data;
  }

  cacheManifestData(hash: string, data: any): void {
    const cache = this.getCache();
    
    cache[hash] = {
      hash,
      data,
      timestamp: Date.now()
    };

    this.cleanCache();
  }

  clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY);
  }

  getCacheStats(): { total: number; size: number } {
    const cache = this.getCache();
    const cacheSize = new Blob([JSON.stringify(cache)]).size;

    return {
      total: Object.keys(cache).length,
      size: cacheSize
    };
  }
} 