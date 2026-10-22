import { Observable, of } from 'rxjs';
import { ActivityHistory } from '../models/activity-history.model';
import { filterActivitiesBySelectedType } from './filter-activities-by-type';
import {
  getCachedFilteredActivities,
  putCachedFilteredActivities,
  ActivityCacheEntry,
} from './filtered-activities-cache';

/**
 * Filter activities by selected type with cache (CODE_CLEANUP_SPEC).
 */
export function getFilteredActivitiesCached(input: {
  activities: ActivityHistory[];
  game: string;
  selectedActivityType: { label: string } | null | undefined;
  selectedDate: string;
  cache: Map<string, ActivityCacheEntry>;
  cacheDurationMs: number;
  getActivityType: (ref: any, mode: any, isD1: boolean) => string;
  getActivityName: (ref: any, isD1: boolean) => string;
}): Observable<ActivityHistory[]> {
  const type = input.selectedActivityType;
  if (!type || type.label === 'All') {
    return of(input.activities);
  }
  const cacheKey = `${input.game}-${type.label}-${input.selectedDate}`;
  const hit = getCachedFilteredActivities(
    input.cache,
    cacheKey,
    input.cacheDurationMs
  );
  if (hit) return hit;

  const filtered = filterActivitiesBySelectedType(
    input.activities,
    input.game,
    type as any,
    {
      getActivityType: input.getActivityType,
      getActivityName: input.getActivityName,
    }
  );

  putCachedFilteredActivities(input.cache, cacheKey, filtered, {
    type: type.label,
    game: input.game,
  });

  return of(filtered);
}
