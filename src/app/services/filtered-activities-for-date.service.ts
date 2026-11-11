import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ActivityTypeOption } from '../models/activity-types';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { StoredActivity } from './activity-db.service';
import {
  ActivityTypeManifest,
  dedupeAndSortFilteredActivities,
  filteredActivitiesCacheKey,
  filterStoredActivitiesByType,
  stampActivitiesForPlayer,
} from '../utils/filtered-activities-for-date';
import { yearOfPeriod } from '../utils/time-story-by-year';

export interface FilteredActivitiesCacheEntry {
  list: ActivityWithMembership[];
  dirty: boolean;
}

/**
 * Host for per-date filtered activity fetch (CODE_CLEANUP_SPEC).
 * IDB reads + type filter + stamp/dedupe; UI cache/stats on the host.
 */
export interface FilteredActivitiesForDateHost {
  getSelectedDate(): string;
  getSelectedPlayers(): PlayerSearchDisplay[];
  getSelectedActivityType(): ActivityTypeOption;
  getCacheEntry(key: string): FilteredActivitiesCacheEntry | undefined;
  setCacheEntry(key: string, entry: FilteredActivitiesCacheEntry): void;
  isFirstFullSyncDone(): boolean;
  getCharacterIdsForPlayer(player: PlayerSearchDisplay): string[];
  fetchActivitiesForCharacters(
    membershipId: string,
    characterIds: string[],
    month: number,
    day: number,
    year?: number
  ): Promise<StoredActivity[]>;
  getManifest(): ActivityTypeManifest;
  setFilteredActivitiesForDate(list: ActivityWithMembership[]): void;
  computeAccountStats(): void;
  getTimeStoryGroupFilter?(): string | null;
  getTimeStoryYearFilter?(): number | null;
  getTimeStoryTimeZone?(): string | undefined;
  getTimeStoryAllowedGames?(): Array<'D1' | 'D2'>;
  activityMatchesTimeStoryGroup?(activity: StoredActivity, group: string): boolean;
}

/**
 * Retrieves all filtered activities for the selected date and players.
 */
@Injectable({ providedIn: 'root' })
export class FilteredActivitiesForDateService {
  async getAllFilteredActivitiesForDate(
    host: FilteredActivitiesForDateHost,
    forceRefresh = false
  ): Promise<ActivityWithMembership[]> {
    const selectedDate = host.getSelectedDate();
    if (!selectedDate) {
      return [];
    }

    const selectedPlayers = host.getSelectedPlayers();
    const selectedActivityType = host.getSelectedActivityType();
    const groupFilter = host.getTimeStoryGroupFilter?.() || '';
    const yearFilter = host.getTimeStoryYearFilter?.();
    const timeZone = host.getTimeStoryTimeZone?.();
    const allowedGames = host.getTimeStoryAllowedGames?.();
    const cacheKey = filteredActivitiesCacheKey(
      selectedDate,
      selectedPlayers,
      selectedActivityType.label +
        (groupFilter ? `|ts:${groupFilter}` : '') +
        (yearFilter != null ? `|tsy:${yearFilter}` : '')
    );
    const cachedEntry = host.getCacheEntry(cacheKey);
    if (cachedEntry && !forceRefresh && !cachedEntry.dirty && host.isFirstFullSyncDone()) {
      return cachedEntry.list;
    }

    const dateParts = selectedDate.split('-');
    if (dateParts.length !== 3) {
      if (environment.debug) {
        console.warn('Invalid selectedDate format:', selectedDate);
      }
      return [];
    }
    const [, month, day] = dateParts.map(Number);
    const manifest = host.getManifest();
    const fetchYear = yearFilter ?? undefined;

    const scopedPlayers =
      allowedGames?.length
        ? selectedPlayers.filter(player => allowedGames.includes(player.game === 'D1' ? 'D1' : 'D2'))
        : selectedPlayers;

    const playerActivitiesPromises = scopedPlayers.map(async (player) => {
      const charIds = host.getCharacterIdsForPlayer(player);
      let playerActivities = charIds.length
        ? await host.fetchActivitiesForCharacters(player.membershipId, charIds, month, day, fetchYear)
        : [];
      playerActivities = filterStoredActivitiesByType(
        playerActivities,
        player,
        selectedActivityType,
        manifest
      );
      if (yearFilter != null) {
        playerActivities = playerActivities.filter(
          activity => yearOfPeriod(activity.period, timeZone) === yearFilter
        );
      }
      if (groupFilter && host.activityMatchesTimeStoryGroup) {
        playerActivities = playerActivities.filter((activity) =>
          host.activityMatchesTimeStoryGroup!(activity, groupFilter)
        );
      }
      return stampActivitiesForPlayer(playerActivities, player, manifest);
    });

    const allFilteredActivities = (await Promise.all(playerActivitiesPromises)).flat();
    const dedupedActivities = dedupeAndSortFilteredActivities(allFilteredActivities);

    if (host.isFirstFullSyncDone()) {
      host.setCacheEntry(cacheKey, { list: dedupedActivities, dirty: false });
    }

    host.setFilteredActivitiesForDate(dedupedActivities);
    host.computeAccountStats();
    return dedupedActivities;
  }
}
