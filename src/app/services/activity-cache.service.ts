import { Injectable } from '@angular/core';
import { ActivityHistory } from '../models/activity-history.model';

interface CachedActivityData {
  activities: ActivityHistory[];
  lastUpdated: number;
  characterId: string;
  membershipType: number;
  membershipId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityCacheService {
  private readonly CACHE_KEY_PREFIX = 'destiny_activity_cache_';
  private readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {}

  private getCacheKey(membershipType: number, membershipId: string, characterId: string): string {
    return `${this.CACHE_KEY_PREFIX}${membershipType}_${membershipId}_${characterId}`;
  }

  getCachedActivities(membershipType: number, membershipId: string, characterId: string): ActivityHistory[] | null {
    const cacheKey = this.getCacheKey(membershipType, membershipId, characterId);
    const cachedData = localStorage.getItem(cacheKey);
    
    if (!cachedData) {
      return null;
    }

    const parsedData: CachedActivityData = JSON.parse(cachedData);
    const now = Date.now();

    // Check if cache is expired
    if (now - parsedData.lastUpdated > this.CACHE_EXPIRY) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return parsedData.activities;
  }

  cacheActivities(
    activities: ActivityHistory[],
    membershipType: number,
    membershipId: string,
    characterId: string
  ): void {
    const cacheKey = this.getCacheKey(membershipType, membershipId, characterId);
    const cacheData: CachedActivityData = {
      activities,
      lastUpdated: Date.now(),
      characterId,
      membershipType,
      membershipId
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  }

  clearCache(membershipType: number, membershipId: string, characterId: string): void {
    const cacheKey = this.getCacheKey(membershipType, membershipId, characterId);
    localStorage.removeItem(cacheKey);
  }

  clearAllCache(): void {
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.CACHE_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  }
} 