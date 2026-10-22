import { PlayerSelectionClearHost, PlayerSelectionClearService } from './player-selection-clear.service';

describe('PlayerSelectionClearService', () => {
  it('runs cancel → wipe → cache clear → detectChanges in order', () => {
    const order: string[] = [];
    const host: PlayerSelectionClearHost = {
      cancelBackgroundOperations: () => order.push('cancel'),
      clearPlayerSpecificCaches: () => order.push('playerCaches'),
      clearArchivePlayerActivitiesCache: () => order.push('archive'),
      setSelectedPlayers: () => order.push('players'),
      setSearchPanelExpanded: () => undefined,
      clearSelectedCharacterIds: () => undefined,
      clearCharacters: () => undefined,
      clearActivities: () => undefined,
      clearLoadingFlags: () => undefined,
      clearErrors: () => undefined,
      clearGroupedActivities: () => undefined,
      clearArchiveCoverage: () => undefined,
      setAddMode: () => undefined,
      clearFilteredActivitiesForDate: () => undefined,
      emitFilteredActivitiesEmpty: () => order.push('emitEmpty'),
      clearProcessedActivities: () => undefined,
      clearFirstEverActivities: () => undefined,
      clearGuardianFirstsMap: () => undefined,
      clearComputedAccountStats: () => undefined,
      setAccountStats: () => order.push('stats'),
      clearPerPlatformStats: () => undefined,
      setLoadingAccountStats: () => undefined,
      syncActivityStore: () => order.push('sync'),
      clearAccountLoadingStatuses: () => undefined,
      setShowBackgroundProcessingIndicator: () => undefined,
      clearActivityCaches: () => order.push('caches'),
      invalidateMemoCaches: () => undefined,
      clearFilteredActivitiesCache: () => undefined,
      clearLocalActivityCache: () => undefined,
      clearDatabaseCaches: () => order.push('db'),
      emitStatsDebounce: () => undefined,
      clearSelectedAccountsService: () => undefined,
      clearSyncedPlayers: () => undefined,
      resetSyncFlags: () => undefined,
      detectChanges: () => order.push('cd'),
    };

    new PlayerSelectionClearService().clearAllPlayers(host);
    expect(order[0]).toBe('cancel');
    expect(order).toContain('stats');
    expect(order).toContain('sync');
    expect(order[order.length - 1]).toBe('cd');
  });
});
