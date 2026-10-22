import { Observable, of } from 'rxjs';
import { ActivityHistory } from '../models/activity-history.model';

export interface ActivityCacheEntry {
  activities: ActivityHistory[];
  timestamp: number;
  type?: string;
  game?: string;
}

/**
 * Return cached filtered activities when still fresh (CODE_CLEANUP_SPEC).
 */
export function getCachedFilteredActivities(
  cache: Map<string, ActivityCacheEntry>,
  cacheKey: string,
  cacheDurationMs: number
): Observable<ActivityHistory[]> | null {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheDurationMs) {
    return of(cached.activities);
  }
  return null;
}

/**
 * Store filtered activities in the activity cache (CODE_CLEANUP_SPEC).
 */
export function putCachedFilteredActivities(
  cache: Map<string, ActivityCacheEntry>,
  cacheKey: string,
  activities: ActivityHistory[],
  meta?: { type?: string; game?: string }
): void {
  cache.set(cacheKey, {
    activities,
    timestamp: Date.now(),
    type: meta?.type,
    game: meta?.game,
  });
}
