import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ActivityDbService } from './activity-db.service';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export interface DateRange {
  start: Date;
  end: Date;
}

@Injectable({
  providedIn: 'root'
})
export class SmartCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private preloadQueue: string[] = [];
  private isPreloading = false;
  
  // Cache configuration
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly ACTIVITY_TTL = 30 * 60 * 1000; // 30 minutes for activity data
  private readonly MAX_CACHE_SIZE = 1000; // Maximum number of cache entries

  public cacheStats$ = new BehaviorSubject<{
    size: number;
    hits: number;
    misses: number;
    preloadQueue: number;
  }>({ size: 0, hits: 0, misses: 0, preloadQueue: 0 });

  private stats = { hits: 0, misses: 0 };

  constructor(private activityDb: ActivityDbService) {
    this.startCleanupInterval();
  }

  /**
   * Get data from cache with automatic TTL checking
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    this.stats.hits++;
    this.updateStats();
    return entry.data;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Clean up old entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL
    });

    this.updateStats();
  }

  /**
   * Preload activities for a date range
   */
  async preloadActivities(membershipId: string, characterId: string, dateRange: DateRange): Promise<void> {
    const cacheKey = `activities-${membershipId}-${characterId}-${dateRange.start.toISOString()}-${dateRange.end.toISOString()}`;
    
    // Check if already cached
    if (this.get(cacheKey)) {
      return;
    }

    // Add to preload queue
    this.preloadQueue.push(cacheKey);
    this.updateStats();

    // Start preloading if not already running
    if (!this.isPreloading) {
      this.processPreloadQueue();
    }
  }

  /**
   * Preload activities for common date patterns
   */
  async preloadCommonDates(membershipId: string, characterId: string): Promise<void> {
    const today = new Date();
    const commonDates: DateRange[] = [
      // Today
      { start: new Date(today.getFullYear(), today.getMonth(), today.getDate()), 
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) },
      
      // Yesterday
      { start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1), 
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
      
      // This week (last 7 days)
      { start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7), 
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) },
      
      // This month
      { start: new Date(today.getFullYear(), today.getMonth(), 1), 
        end: new Date(today.getFullYear(), today.getMonth() + 1, 1) },
      
      // Last month
      { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), 
        end: new Date(today.getFullYear(), today.getMonth(), 1) }
    ];

    // Preload each date range
    for (const dateRange of commonDates) {
      await this.preloadActivities(membershipId, characterId, dateRange);
    }
  }

  /**
   * Process the preload queue
   */
  private async processPreloadQueue(): Promise<void> {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }

    this.isPreloading = true;

    try {
      while (this.preloadQueue.length > 0) {
        const cacheKey = this.preloadQueue.shift()!;
        
        // Parse the cache key to extract parameters
        const parts = cacheKey.replace('activities-', '').split('-');
        if (parts.length < 4) continue;

        const membershipId = parts[0];
        const characterId = parts[1];
        const startDate = new Date(parts[2]);
        const endDate = new Date(parts[3]);

        try {
          // Fetch activities for the date range
          const activities = await this.activityDb.getActivitiesInDateRange(
            membershipId,
            startDate,
            endDate
          );

          // Cache the result
          this.set(cacheKey, activities, this.ACTIVITY_TTL);
        } catch (error) {
          console.warn(`[SmartCache] Failed to preload ${cacheKey}:`, error);
        }

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } finally {
      this.isPreloading = false;
      this.updateStats();
    }
  }

  /**
   * Get activities for a specific date with smart caching
   */
  async getActivitiesForDate(
    membershipId: string, 
    characterId: string, 
    month: number, 
    day: number, 
    year?: number
  ): Promise<any[]> {
    const cacheKey = `date-${membershipId}-${characterId}-${month}-${day}-${year || 'any'}`;
    
    // Try cache first
    const cached = this.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const activities = await this.activityDb.getActivitiesByDate(
      membershipId, 
      characterId, 
      month, 
      day, 
      year
    );

    // Cache the result
    this.set(cacheKey, activities, this.ACTIVITY_TTL);
    
    return activities;
  }

  /**
   * Clear cache entries for a specific character
   */
  clearCharacterCache(membershipId: string, characterId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(`${membershipId}-${characterId}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    this.updateStats();
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
    this.preloadQueue = [];
    this.updateStats();
  }

  /**
   * Evict oldest cache entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 20% of entries
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.timestamp + entry.ttl) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.cache.delete(key));
      
      if (keysToDelete.length > 0) {
        this.updateStats();
      }
    }, 60000); // Run every minute
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.cacheStats$.next({
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      preloadQueue: this.preloadQueue.length
    });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cacheStats$.value;
  }
}