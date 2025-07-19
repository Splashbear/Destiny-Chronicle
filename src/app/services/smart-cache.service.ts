import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  totalEntries: number;
  hitRate: number;
  memoryUsage: number;
}

@Injectable({
  providedIn: 'root'
})
export class SmartCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly MAX_CACHE_SIZE = 100;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute
  
  private hits = 0;
  private misses = 0;
  private cleanupTimer: any;

  private statsSubject = new BehaviorSubject<CacheStats>({
    totalEntries: 0,
    hitRate: 0,
    memoryUsage: 0
  });

  public stats$ = this.statsSubject.asObservable();

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get data from cache or execute factory function
   */
  async get<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    // Check if we have valid cached data
    if (entry && now < entry.expiresAt) {
      entry.accessCount++;
      entry.lastAccessed = now;
      this.hits++;
      this.updateStats();
      return entry.data;
    }

    // Cache miss - fetch new data
    this.misses++;
    const data = await factory();
    
    // Store in cache
    this.set(key, data, ttl);
    this.updateStats();
    
    return data;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    const now = Date.now();
    
    // Ensure we don't exceed max cache size
    if (this.cache.size >= this.MAX_CACHE_SIZE && !this.cache.has(key)) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      accessCount: 1,
      lastAccessed: now
    });

    this.updateStats();
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Remove specific key from cache
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.updateStats();
    return result;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.updateStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.statsSubject.value;
  }

  /**
   * Preload data into cache
   */
  async preload<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    if (!this.has(key)) {
      const data = await factory();
      this.set(key, data, ttl);
    }
  }

  /**
   * Get multiple keys at once
   */
  async getMultiple<T>(
    keys: string[],
    factory: (key: string) => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const promises: Promise<void>[] = [];

    for (const key of keys) {
      promises.push(
        this.get(key, () => factory(key), ttl).then(data => {
          results.set(key, data);
        })
      );
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.updateStats();
    return count;
  }

  /**
   * Get cache keys matching pattern
   */
  getKeysMatching(pattern: RegExp): string[] {
    return Array.from(this.cache.keys()).filter(key => pattern.test(key));
  }

  private evictLeastUsed(): void {
    let leastUsedKey: string | null = null;
    let leastUsedScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Score based on access count and recency
      const score = entry.accessCount * (Date.now() - entry.lastAccessed);
      if (score < leastUsedScore) {
        leastUsedScore = score;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      this.updateStats();
    }
  }

  private updateStats(): void {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
    
    // Estimate memory usage (rough calculation)
    const memoryUsage = this.cache.size * 1024; // Assume 1KB per entry on average

    this.statsSubject.next({
      totalEntries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage
    });
  }

  ngOnDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}