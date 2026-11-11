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
      day: number,
      year?: number
    ) => c.activitiesForCharacters(membershipId, characterIds, month, day, year),
    getManifest: () => c.manifest,
    setFilteredActivitiesForDate: (list: any) => {
      c.filteredActivitiesForDate = list;
    },
    computeAccountStats: () => c.computeAccountStatsWithService(),
    getTimeStoryGroupFilter: () => c.timeStoryGroupFilter || null,
    getTimeStoryYearFilter: () => c.timeStoryYearFilter ?? null,
    getTimeStoryTimeZone: () =>
      typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
    getTimeStoryAllowedGames: () => {
      if (c.timeStoryYearFilter == null && !c.timeStoryGroupFilter) return undefined;
      const scopes = typeof c.timeStoryScopes !== 'undefined' ? c.timeStoryScopes : [];
      const games = [...new Set(scopes.map((scope: { game: 'D1' | 'D2' }) => scope.game))];
      return games.length ? games : undefined;
    },
    activityMatchesTimeStoryGroup: (activity: any, group: string) =>
      c.activityBreakdownService.timeStoryGroupForActivity(activity) === group,
  };
}
