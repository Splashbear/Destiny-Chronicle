import { getCharacterId } from './character-profile';

/**
 * Host deps for FilteredActivitiesForDateService (CODE_CLEANUP_SPEC).
 */
export function buildFilteredActivitiesForDateHost(c: any) {
  return {
    getSelectedDate: () => c.selectedDate,
    getSelectedPlayers: () => c.selectedPlayers,
    getSelectedActivityType: () => c.selectedActivityType,
    getCacheEntry: (key: string) => c.filteredActivitiesCache.get(key),
    setCacheEntry: (key: string, entry: any) => c.filteredActivitiesCache.set(key, entry),
    isFirstFullSyncDone: () => c.firstFullSyncDone,
    getCharacterIdsForPlayer: (player: any) =>
      (c.characters[c.getPlayerKey(player)] || [])
        .map(getCharacterId)
        .filter((id: string | undefined): id is string => !!id),
    fetchActivitiesForCharacters: (
      membershipId: string,
      characterIds: string[],
      month: number,
      day: number
    ) => c.activitiesForCharacters(membershipId, characterIds, month, day),
    getManifest: () => c.manifest,
    setFilteredActivitiesForDate: (list: any) => {
      c.filteredActivitiesForDate = list;
    },
    computeAccountStats: () => c.computeAccountStatsWithService(),
  };
}
