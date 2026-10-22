// @ts-nocheck
/** Session wipe for replace-mode primary select (CODE_CLEANUP_SPEC). */

/** Wipe local activity caches after DB clear-all (CODE_CLEANUP_SPEC). */
export function resetAfterClearAllActivities(c: any): void {
  c.activities = {};
  c.clearCache();
  c.accountStats = {
    totalTime: 0,
    totalActivityTime: 0,
    bungieTotalTime: 0,
    totalActivityCount: 0,
    totalSeals: 0,
    perType: {},
  };
  c.perPlatformStats = [];
  c.syncActivityStore();
  c.cdr.detectChanges();
}

export function resetSessionForPrimarySelect(c: any): void {
  c.activities = {};
  c.characters = {};
  c.selectedCharacterIds = {};
  c.groupedActivitiesByAccount = [];
  c.processedActivities = [];
  c.filteredActivities$.next([]);
  c.filteredActivitiesForDate = [];
  c.loadingAccountStats = true;
  c.accountStats = {
    totalTime: 0,
    totalActivityTime: 0,
    bungieTotalTime: 0,
    totalActivityCount: 0,
    totalSeals: 0,
    perType: {},
  };
  c.perPlatformStats = [];
  c.syncActivityStore();
  c.guardianFirsts = [];
  c.playerTitles = {};
  c.firstFullSyncDone = false;
  c.syncedPlayers.clear();
  c.accountLoadingStatus.clear();
  c.accountLoadingStatuses = [];
}
