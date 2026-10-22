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
    day: number
  ): Promise<StoredActivity[]>;
  getManifest(): ActivityTypeManifest;
  setFilteredActivitiesForDate(list: ActivityWithMembership[]): void;
  computeAccountStats(): void;
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
    const cacheKey = filteredActivitiesCacheKey(
      selectedDate,
      selectedPlayers,
      selectedActivityType.label
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

    const playerActivitiesPromises = selectedPlayers.map(async (player) => {
      const charIds = host.getCharacterIdsForPlayer(player);
      let playerActivities = charIds.length
        ? await host.fetchActivitiesForCharacters(player.membershipId, charIds, month, day)
        : [];
      playerActivities = filterStoredActivitiesByType(
        playerActivities,
        player,
        selectedActivityType,
        manifest
      );
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
