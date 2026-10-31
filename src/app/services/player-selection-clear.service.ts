import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { AccountStatsSnapshot } from './account-stats-calculator.service';

const EMPTY_ACCOUNT_STATS: AccountStatsSnapshot = {
  totalTime: 0,
  totalActivityTime: 0,
  totalActivityCount: 0,
  totalSeals: 0,
  perType: {},
};

/**
 * Host for wiping selection + caches (CODE_CLEANUP_SPEC).
 * Extracted from PlayerSearchComponent.clearAllPlayers.
 */
export interface PlayerSelectionClearHost {
  cancelBackgroundOperations(): void;
  clearPlayerSpecificCaches(): void;
  clearArchivePlayerActivitiesCache(): void;
  setSelectedPlayers(players: PlayerSearchDisplay[]): void;
  setSearchPanelExpanded(expanded: boolean): void;
  clearSelectedCharacterIds(): void;
  clearCharacters(): void;
  clearActivities(): void;
  clearLoadingFlags(): void;
  clearErrors(): void;
  clearGroupedActivities(): void;
  clearArchiveCoverage(): void;
  setAddMode(on: boolean): void;
  clearFilteredActivitiesForDate(): void;
  emitFilteredActivitiesEmpty(): void;
  clearProcessedActivities(): void;
  clearFirstEverActivities(): void;
  clearGuardianFirstsMap(): void;
  clearComputedAccountStats(): void;
  setAccountStats(stats: AccountStatsSnapshot & { bungieTotalTime?: number }): void;
  clearPerPlatformStats(): void;
  setLoadingAccountStats(loading: boolean): void;
  syncActivityStore(): void;
  clearAccountLoadingStatuses(): void;
  setShowBackgroundProcessingIndicator(show: boolean): void;
  clearActivityCaches(): void;
  invalidateMemoCaches(): void;
  clearFilteredActivitiesCache(): void;
  clearLocalActivityCache(): void;
  clearDatabaseCaches(): void;
  emitStatsDebounce(): void;
  clearSelectedAccountsService(): void;
  clearSyncedPlayers(): void;
  resetSyncFlags(): void;
  detectChanges(): void;
  /** Drop ?players= from the address bar so refresh does not re-hydrate accounts. */
  updateUrlForPermalink(): void;
  logClear?(phase: 'start' | 'done', snapshot: Record<string, number>): void;
  getClearDebugSnapshot?(): Record<string, number>;
}

/** Host for removing one selected player (CODE_CLEANUP_SPEC). */
export interface PlayerSelectionRemoveHost {
  getSelectedPlayers(): PlayerSearchDisplay[];
  removeSelectedAccount(membershipId: string): void;
  getPlayerKey(player: PlayerSearchDisplay): string;
  removeAccountLoadingStatus(accountKey: string): void;
  clearFilteredActivitiesForDate(): void;
  emitFilteredActivitiesEmpty(): void;
  clearGroupedActivities(): void;
  clearSelectedAccountKeysForActivities(): void;
  clearSelectedAccountKeysForBreakdown(): void;
  clearSelectedAccountKeysForFirsts(): void;
  calculateAccountStats(): void;
  detectChanges(): void;
  getActiveTab(): string;
  syncActiveFirstsGameWithPlayers(): void;
  updatePlatformTabs(): void;
  updateUrlForPermalink(): void;
}

/**
 * Reset all selected accounts and related UI/caches.
 */
@Injectable({ providedIn: 'root' })
export class PlayerSelectionClearService {
  clearAllPlayers(host: PlayerSelectionClearHost): void {
    host.logClear?.('start', host.getClearDebugSnapshot?.() ?? {});

    host.cancelBackgroundOperations();
    host.clearPlayerSpecificCaches();
    host.clearArchivePlayerActivitiesCache();

    host.setSelectedPlayers([]);
    host.setSearchPanelExpanded(true);
    host.clearSelectedCharacterIds();
    host.clearCharacters();
    host.clearActivities();
    host.clearLoadingFlags();
    host.clearErrors();
    host.clearGroupedActivities();
    host.clearArchiveCoverage();
    host.setAddMode(false);

    host.clearFilteredActivitiesForDate();
    host.emitFilteredActivitiesEmpty();
    host.clearProcessedActivities();

    host.clearFirstEverActivities();
    host.clearGuardianFirstsMap();

    host.clearComputedAccountStats();
    host.setAccountStats({ ...EMPTY_ACCOUNT_STATS, bungieTotalTime: 0 });
    host.clearPerPlatformStats();
    host.setLoadingAccountStats(false);
    host.syncActivityStore();

    host.clearAccountLoadingStatuses();
    host.setShowBackgroundProcessingIndicator(false);

    host.clearActivityCaches();
    host.invalidateMemoCaches();
    host.clearFilteredActivitiesCache();
    host.clearLocalActivityCache();
    host.clearDatabaseCaches();

    host.emitFilteredActivitiesEmpty();
    host.emitStatsDebounce();
    host.clearSelectedAccountsService();

    host.clearSyncedPlayers();
    host.resetSyncFlags();
    host.updateUrlForPermalink();

    host.logClear?.('done', host.getClearDebugSnapshot?.() ?? {});
    host.detectChanges();
  }

  removePlayer(host: PlayerSelectionRemoveHost, index: number): void {
    const players = host.getSelectedPlayers();
    const removed = players.splice(index, 1)[0];
    if (removed) {
      host.removeSelectedAccount(removed.membershipId);
      host.removeAccountLoadingStatus(host.getPlayerKey(removed));
    }
    host.clearFilteredActivitiesForDate();
    host.emitFilteredActivitiesEmpty();
    host.clearGroupedActivities();
    host.clearSelectedAccountKeysForActivities();
    host.clearSelectedAccountKeysForBreakdown();
    host.clearSelectedAccountKeysForFirsts();
    host.calculateAccountStats();
    host.detectChanges();
    if (host.getActiveTab() === 'firsts') {
      host.syncActiveFirstsGameWithPlayers();
    }
    host.updatePlatformTabs();
    host.updateUrlForPermalink();
  }
}
