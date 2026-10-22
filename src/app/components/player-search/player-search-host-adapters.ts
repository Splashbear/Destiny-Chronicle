// @ts-nocheck
/** Host adapter factories extracted from PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCharacterId } from "../../utils/character-profile";
import type { AccountLoadingStatus } from "../../models/account-loading-status.model";

export function build_asPlayerSearchInitHost(c: any) {
  return {
    installRegressionProbe: () => c.installRegressionProbe(),
    isOfflineArchiveMode: () => c.isOfflineArchiveMode,
    hydrateFromOfflineArchive: () => c.hydrateFromOfflineArchive(),
    setShowOfflineDeviceReady: (on: boolean) => {
      c.showOfflineDeviceReady = on;
    },
    setDefaultTodayDate: () => {
      const today = new Date();
      c.selectedMonth = today.getMonth() + 1;
      c.selectedDay = today.getDate();
      c.selectedYear = today.getFullYear();
      c.selectedDate = `${c.selectedYear}-${c.selectedMonth
        .toString()
        .padStart(2, '0')}-${c.selectedDay.toString().padStart(2, '0')}`;
    },
    applyPermalinkDate: (dateParam: any) => c.applyPermalinkDate(dateParam),
    applyPlayersParamFromUrl: (playersParam: string) =>
      c.applyPlayersParamFromUrl(playersParam),
    getPendingPlayerData: () => c.pendingPlayerData,
    setPendingPlayerData: (data: any) => {
      c.pendingPlayerData = data as any;
    },
    clearFirstEverActivities: () => {
      c.firstEverActivities = {};
    },
    loadPlayersFromUrlData: (data: any) => c.loadPlayersFromUrlData(data as any),
    loadAndDisplayFavorites: () => c.loadAndDisplayFavorites(),
    setDbReady: (ready: boolean) => {
      c.dbReady = ready;
    },
    detectChanges: () => c.cdr.detectChanges(),
    addVisibilityListener: () => {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', c.visibilityChangeHandler);
      }
    },
    getSelectedPlayersLength: () => c.selectedPlayers.length,
  };
}

export function build_asFavoritesLoadHost(c: any) {
  return {
    ...c.asPlayerAccountSyncHost(),
    getCurrentLoadToken: () => c.currentLoadToken,
    setShowFavoritesLoadPrompt: (show: boolean) => {
      c.showFavoritesLoadPrompt = show;
    },
    setProfileLoadInProgress: (on: boolean) => {
      c.profileLoadInProgress = on;
    },
    syncActivityStore: () => c.syncActivityStore(),
    setShowLoadingModal: (show: boolean) => {
      c.showLoadingModal = show;
    },
    clearAccountLoadingStatuses: () => {
      c.accountLoadingStatuses = [];
    },
    resetSelectionCachesForFavorites: () => {
      c.selectedPlayers = [];
      c.selectedCharacterIds = {};
      c.characters = {};
      c.activities = {};
      c.loading = {};
      c.error = {};
      c.groupedActivitiesByAccount = [];
      c.clearCache();
    },
    setSelectedPlayers: (players: any) => {
      c.selectedPlayers = [...players];
    },
    setSelectedCharacterId: (key: string, id: any) => {
      c.selectedCharacterIds[key] = id;
    },
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    ensureSelectedDate: () => c.ensureSelectedDate(),
    setDateActivityLoading: (loading: boolean) => {
      c.loadingActivities[c.selectedDate] = loading;
    },
    updateLoadingProgress: (
      phase: any,
      current: number,
      total: number,
      message: string
    ) => c.updateLoadingProgress(phase, current, total, message),
    detectChanges: () => c.cdr.detectChanges(),
    seedFetchingProfileStatuses: (players: any, suffix?: string) =>
      c.seedFetchingProfileStatuses(players, suffix),
    loadAllFilteredActivities: (force: boolean) => c.loadAllFilteredActivities(force),
    getSelectedDate: () => c.selectedDate,
    emitStatsDebounce: () => c.statsDebounce$.next(),
    noteBungieApiIssue: (scope: any, err: any) => c.noteBungieApiIssue(scope, err),
    markAccountLoadCancelled: (player: any, reason: string) =>
      c.markAccountLoadCancelled(player, reason),
    markAccountLoadFailed: (player: any) => c.markAccountLoadFailed(player),
    setErrorMessage: (message: string) => {
      c.errorMessage = message;
    },
    showSuccessMessage: (message: string) => c.showSuccessMessage(message),
  };
}

export function build_asPlayerSelectLoadHost(c: any) {
  return {
    ...c.asPlayerAccountSyncHost(),
    getSelectedPlayers: () => c.selectedPlayers,
    setSelectedPlayers: (players: any) => {
      c.selectedPlayers = [...players];
    },
    pushSelectedPlayer: (player: any) => {
      c.selectedPlayers.push(player);
    },
    getAddMode: () => c.addMode,
    setErrorMessage: (message: string) => {
      c.errorMessage = message;
    },
    setShowPlatformPicker: (show: boolean) => {
      c.showPlatformPicker = show;
    },
    setSearchPanelExpanded: (expanded: boolean) => {
      c.searchPanelExpanded = expanded;
    },
    resetSessionForPrimarySelect: () => c.resetSessionForPrimarySelect(),
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    setSelectedCharacterId: (key: string, id: any) => {
      c.selectedCharacterIds[key] = id;
    },
    clearSelectedCharacterId: (key: string) => {
      delete c.selectedCharacterIds[key];
    },
    addSelectedAccount: (p: any) => c.addSelectedAccount(p),
    ensureSelectedDate: () => c.ensureSelectedDate(),
    setDateActivityLoading: (loading: boolean) => {
      c.loadingActivities[c.selectedDate] = loading;
    },
    updateLoadingProgress: (
      phase: any,
      current: number,
      total: number,
      message: string
    ) => c.updateLoadingProgress(phase, current, total, message),
    detectChanges: () => c.cdr.detectChanges(),
    seedFetchingProfileStatuses: (players: any) => c.seedFetchingProfileStatuses(players),
    setOverallActivitiesProcessed: (n: number) => {
      c.overallActivitiesProcessed = n;
    },
    getSelectedDate: () => c.selectedDate,
    loadAllFilteredActivities: (force: boolean) =>
      c.loadAllFilteredActivities(force),
    emitStatsDebounce: () => c.statsDebounce$.next(),
    updateUrlForPermalink: () => c.updateUrlForPermalink(),
    getActiveTab: () => c.activeTab,
    syncActiveFirstsGameWithPlayers: () => c.syncActiveFirstsGameWithPlayers(),
    updatePlatformTabs: () => c.updatePlatformTabs(),
    markSyncedPlayer: (playerKey: string) => {
      c.syncedPlayers.add(playerKey);
    },
    getFirstFullSyncDone: () => c.firstFullSyncDone,
    refreshComputedViews: () => c.refreshComputedViews(),
  };
}

export function build_asPlayerAccountSyncHost(c: any) {
  return {
    isD1Player: (p) => c.isD1Player(p),
    runWithPlayerSyncLimit: (task) => c.runWithPlayerSyncLimit(task),
    loadCharacterHistory: (p) => c.loadCharacterHistory(p),
    scheduleAfterBrowseReady: (fn) => c.scheduleAfterBrowseReady(fn),
    loadGuardianFirsts: (p) => c.loadGuardianFirsts(p),
    loadDungeonSoloFirsts: (p) => c.loadDungeonSoloFirsts(p),
    loadTitlesForPlayer: (p) => c.loadTitlesForPlayer(p),
    debugPlayerActivities: (id) => c.activityDb.debugPlayerActivities(id),
  };
}

export function build_asProfileCharacterLoadHost(c: any) {
  return {
    getPlayerKey: (p) => c.getPlayerKey(p),
    isD1Player: (p) => c.isD1Player(p),
    getPlatformName: (mt) => c.getPlatformName(mt),
    setCharactersKeyLoading: (key, loading) => {
      c.loading[key] = loading;
    },
    setCharactersKeyError: (key, message) => {
      c.error[key] = message;
    },
    updateAccountLoadingStatus: (
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      status,
      message,
      progress
    ) => {
      c.updateAccountLoadingStatus(
        accountKey,
        displayName,
        platform,
        game,
        membershipType,
        status as AccountLoadingStatus['status'],
        message,
        progress
      );
    },
    setPlayerCharacters: (playerKey, characters) => {
      c.characters[playerKey] = characters;
    },
    setSelectedCharacterId: (playerKey, characterId) => {
      c.selectedCharacterIds[playerKey] = characterId;
    },
    resetActivityCount: (accountKey) => {
      c.activityCountByAccount.set(accountKey, 0);
    },
    reportActivityCountDelta: (
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      delta,
      isDone
    ) => {
      c.reportActivityCountDelta(
        accountKey,
        displayName,
        platform,
        game,
        membershipType,
        delta,
        isDone
      );
    },
    noteBungieApiIssue: (g, e) => c.noteBungieApiIssue(g, e),
    loadActivityHistoryForCharacter: (character) =>
      c.loadActivityHistoryForCharacter(character),
  };
}

export function build_asActivityHistoryLoadHost(c: any) {
  return {
    setCharacterActivityLoading: (k, v) => c.setCharacterActivityLoading(k, v),
    setCharacterActivityError: (k, m) => c.setCharacterActivityError(k, m),
    // Param must not be named `c` — that shadows the component host and breaks loads.
    beginCharacterActivityFetch: (character) => c.beginCharacterActivityFetch(character),
    reportActivityCountDelta: (ctx, game, mt, delta, done) =>
      c.reportActivityCountDeltaFromHost(ctx, game, mt, delta, done),
    noteActivitiesStored: () => c.noteActivitiesStored(),
    invalidateMembershipActivitiesCache: (id) => c.invalidateMembershipActivitiesCache(id),
    addOverallActivitiesProcessed: (n) => c.addOverallActivitiesProcessed(n),
    noteLookupDataSource: (s) => c.noteLookupDataSource(s),
    noteArchiveCoverage: (cov) => c.noteArchiveCoverage(cov),
    noteDcApiFallback: () => c.noteDcApiFallback(),
    clearDcApiFallbackNotice: () => c.clearDcApiFallbackNotice(),
    hasDcApiFallbackNotice: () => c.hasDcApiFallbackNotice(),
    processAndGroupActivities: () => { void c.processAndGroupActivities(); },
    noteBungieApiIssue: (g, e) => c.noteBungieApiIssue(g, e),
    refreshFilteredViewIfNeeded: (a) => c.refreshFilteredViewIfNeeded(a),
    tryShowInitialDisplay: (a) => c.tryShowInitialDisplay(a),
  };
}

export function build_asDateActivityGroupingHost(c: any) {
  return {
    getFilteredActivitiesForDate: () => c.filteredActivitiesForDate,
    setGroupedActivitiesByAccount: (groups: any) => {
      c.groupedActivitiesByAccount = groups as GameGroup[];
    },
    clearFirstEverActivity: () => {
      c.firstEverActivity = undefined;
    },
    setFirstEverActivityFromDb: () => c.setFirstEverActivityFromDb(),
    updateLoadingProgress: (phase, current, total, message) =>
      c.updateLoadingProgress(phase, current, total, message),
    detectChanges: () => c.cdr.detectChanges(),
    getActivityName: (referenceId, isD1) => c.manifest.getActivityName(referenceId, isD1),
    getMappedActivityName: (referenceId) => c.getMappedActivityName(referenceId),
    getActivityType: (referenceId, mode, isD1) =>
      c.manifest.getActivityType(referenceId, mode, isD1),
    getBaseActivityName: (name) => baseActivityNameFromVersioned(name),
    getActivityImage: (activity, isD1) => c.getActivityImage(activity, isD1),
  };
}

export function build_asFilteredActivitiesBrowseHost(c: any) {
  return {
    beginLoadToken: (markComplete) =>
      markComplete ? ++c.currentLoadToken : c.currentLoadToken,
    getCurrentLoadToken: () => c.currentLoadToken,
    getSelectedPlayers: () => c.selectedPlayers,
    getSelectedDate: () => c.selectedDate,
    getPlayerKey: (p) => c.getPlayerKey(p),
    isD1Player: (p) => c.isD1Player(p),
    getPlatformName: (mt) => c.getPlatformName(mt),
    updateAccountLoadingStatus: (
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      status,
      message
    ) => {
      c.updateAccountLoadingStatus(
        accountKey,
        displayName,
        platform,
        game,
        membershipType,
        status as AccountLoadingStatus['status'],
        message
      );
    },
    getAccountLoadingStatus: (accountKey) => {
      const s = c.accountLoadingStatus.get(accountKey);
      return s
        ? {
            status: s.status,
            displayName: s.displayName,
            platform: s.platform,
            game: s.game,
            membershipType: s.membershipType,
          }
        : undefined;
    },
    updateLoadingProgress: (phase, current, total, message) =>
      c.updateLoadingProgress(phase, current, total, message),
    clearLoadingProgress: () => {
      c.loadingProgress = null;
    },
    detectChanges: () => c.cdr.detectChanges(),
    fetchFilteredActivities: (forceRefresh) =>
      c.getAllFilteredActivitiesForDate(forceRefresh),
    buildReportCountMessage: (activities) => c.buildReportCountMessage(activities),
    getReportSummaryLine: (activities) => c.getReportSummaryLine(activities),
    enrichActivitiesWithCharacterClass: (activities) =>
      c.enrichActivitiesWithCharacterClass(activities),
    setFilteredActivitiesForDate: (activities) => {
      c.filteredActivitiesForDate = activities;
    },
    getFilteredActivitiesForDateLength: () => c.filteredActivitiesForDate.length,
    scheduleBatchedUpdate: () => c.scheduleBatchedUpdate(),
    ensureManifestLoaded: async () => {
      if (!c.manifest.isLoadedSync) {
        await c.manifest.isLoaded().toPromise();
      }
    },
    processAndGroupActivities: (message) => {
      void c.processAndGroupActivities(message);
    },
    startBackgroundProcessing: (activities) =>
      c.startBackgroundProcessing(activities, c.manifest),
    updateActivityDisplay: () => c.updateActivityDisplay(),
    setDateActivityLoading: (loading) => {
      c.loadingActivities[c.selectedDate] = loading;
    },
    checkAndShowAnniversaryBanner: () => c.checkAndShowAnniversaryBanner(),
  };
}

export function build_asAccountStatsCalculatorHost(c: any) {
  return {
    beginStatsToken: () => ++c.statsCalcToken,
    getCurrentStatsToken: () => c.statsCalcToken,
    getSelectedPlayers: () => c.selectedPlayers,
    getPlayerKey: (p) => c.getPlayerKey(p),
    isD1Player: (p) => c.isD1Player(p),
    getCharactersByKey: () => c.characters,
    getActivitiesByKey: () => c.activities,
    getAggregatedTitles: () => c.aggregatedTitles,
    getUnlockedTitlesCount: () => c.unlockedTitlesDisplay.length,
    getActivityType: (ref, mode) => c.manifest.getActivityType(ref, mode),
    getActivityDurationSeconds: (act) => c.getActivityDurationSeconds(act),
    getClassName: (ct) => c.getClassName(ct),
    getGuardianFirstsMap: () => c.guardianFirstsMap,
    setGuardianFirstsMapEntry: (key, firsts) => {
      c.guardianFirstsMap[key] = firsts;
    },
    deleteGuardianFirstsMapKey: (key) => {
      delete c.guardianFirstsMap[key];
    },
    setAggregateGuardianFirsts: (firsts) => {
      c.aggregateGuardianFirsts = firsts;
    },
    setGuardianFirsts: (firsts) => {
      c.guardianFirsts = firsts;
    },
    setLoadingAccountStats: (loading) => {
      c.loadingAccountStats = loading;
    },
    setLoadingGuardianFirsts: (loading) => {
      c.loadingGuardianFirsts = loading;
    },
    setPerPlatformStats: (stats) => {
      c.perPlatformStats = stats;
    },
    setAccountStats: (stats) => {
      c.accountStats = stats as any;
    },
    syncActivityStore: () => c.syncActivityStore(),
    detectChanges: () => c.cdr.detectChanges(),
    checkAndShowAnniversaryBanner: () => c.checkAndShowAnniversaryBanner(),
  };
}

export function build_asDateSelectFlowHost(c: any) {
  return {
    getSelectedYear: () => c.selectedYear || new Date().getFullYear(),
    setSelectedYear: (year: number) => {
      c.selectedYear = year;
    },
    getSelectedMonth: () => c.selectedMonth,
    setSelectedMonth: (month: number) => {
      c.selectedMonth = month;
    },
    getSelectedDay: () => c.selectedDay,
    setSelectedDay: (day: number) => {
      c.selectedDay = day;
    },
    getSelectedDate: () => c.selectedDate,
    setSelectedDate: (date: string) => {
      c.selectedDate = date;
    },
    bumpLoadToken: () => {
      c.currentLoadToken++;
    },
    setInitialDisplayShown: (shown: boolean) => {
      c.initialDisplayShown = shown;
    },
    clearFilteredActivitiesForDate: () => {
      c.filteredActivitiesForDate = [];
    },
    clearGroupedActivitiesByAccount: () => {
      c.groupedActivitiesByAccount = [];
    },
    clearFilteredActivitiesCache: () => c.clearFilteredActivitiesCache(),
    updateUrlForPermalink: () => c.updateUrlForPermalink(),
    clearAccountLoadingStatuses: () => {
      c.accountLoadingStatus.clear();
      c.accountLoadingStatuses = [];
    },
    getSelectedPlayersLength: () => c.selectedPlayers.length,
    setDateActivityLoading: (loading: boolean) => {
      c.loadingActivities[c.selectedDate] = loading;
    },
    updateLoadingProgress: (
      phase: any,
      current: number,
      total: number,
      message: string
    ) => c.updateLoadingProgress(phase, current, total, message),
    detectChanges: () => c.cdr.detectChanges(),
    loadAllFilteredActivities: (force?: boolean) =>
      c.loadAllFilteredActivities(!!force),
    getActivitiesMap: () => c.activities as any,
    filterActivitiesByDate: (activities: any, date: string) =>
      c.filterActivitiesByDate(activities, date),
    formatActivitiesForDisplay: (map: any) => c.formatActivitiesForDisplay(map),
    setFilteredActivitiesForDate: (list: any) => {
      c.filteredActivitiesForDate = list;
    },
    computeAccountStats: () => c.computeAccountStatsWithService(),
  };
}

export function build_asPlayerSearchFlowHost(c: any) {
  return {
    isOfflineArchiveMode: () => c.isOfflineArchiveMode,
    offlineSearchDisabledMessage: () => c.uiI18n.t('archive.offlineSearchDisabled'),
    isProfileLoadBusy: () => c.profileLoadInProgress || c.showLoadingModal,
    stopProfileLoading: () => c.stopProfileLoading(),
    setShowFavoritesLoadPrompt: (show: boolean) => {
      c.showFavoritesLoadPrompt = show;
    },
    getSearchUsername: () => c.searchUsername,
    setSearchUsername: (value: string) => {
      c.searchUsername = value;
    },
    getSearchChips: () => c.searchChips,
    setSearchChips: (chips: any) => {
      c.searchChips = chips;
    },
    setErrorMessage: (message: string) => {
      c.errorMessage = message;
    },
    getAddMode: () => c.addMode,
    clearForReplaceSearch: () => c.clearForReplaceSearch(),
    resetSearchResultLists: () => c.resetSearchResultLists(),
    setSearchLoading: (loading: boolean) => {
      c.loading['search'] = loading;
    },
    clearSearchErrorMap: () => {
      c.error = {};
    },
    detectChanges: () => c.cdr.detectChanges(),
    applySearchBundle: (bundle: any, mode: any) => c.applySearchBundle(bundle, mode),
    selectPlayer: (player: any) => c.selectPlayer(player as PlayerSearchResult),
    getD1SearchResults: () => c.d1SearchResults,
    setD1SearchResults: (players: any) => {
      c.d1SearchResults = players;
    },
    getD2SearchResults: () => c.d2SearchResults,
    setD2SearchResults: (players: any) => {
      c.d2SearchResults = players;
    },
    pushD2SearchResults: (players: any) => {
      c.d2SearchResults.push(...players);
    },
    pushD1SearchResults: (players: any) => {
      c.d1SearchResults.push(...players);
    },
    getCrossSavePlayer: () => c.crossSavePlayer,
    setCrossSavePlayer: (player: any) => {
      c.crossSavePlayer = player;
    },
    openPlatformPicker: () => c.openPlatformPicker(),
    focusSearchModal: () => c.focusFirstElementInModal('.modal.show'),
    setAddMode: (on: boolean) => {
      c.addMode = on;
    },
  };
}

export function build_asPlayerSearchTabChangeHost(c: any) {
  return {
    setActiveTab: (tab: any) => {
      c.activeTab = tab;
    },
    detectChanges: () => c.cdr.detectChanges(),
    markForCheck: () => c.cdr.markForCheck(),
    getSelectedPlayersLength: () => c.selectedPlayers.length,
    syncActiveFirstsGameWithPlayers: () => c.syncActiveFirstsGameWithPlayers(),
    updatePlatformTabs: () => c.updatePlatformTabs(),
    syncActiveAccomplishmentsGameWithPlayers: () =>
      c.syncActiveAccomplishmentsGameWithPlayers(),
    loadActivityBreakdown: () => c.loadActivityBreakdown(),
    ensureTitlesLoadedForTab: () => c.ensureTitlesLoadedForTab(),
  };
}

export function build_asPlayerSelectionRemoveHost(c: any) {
  return {
    getSelectedPlayers: () => c.selectedPlayers,
    removeSelectedAccount: (membershipId: string) =>
      c.selectedAccounts.remove(membershipId),
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    removeAccountLoadingStatus: (accountKey: string) =>
      c.removeAccountLoadingStatus(accountKey),
    clearFilteredActivitiesForDate: () => {
      c.filteredActivitiesForDate = [];
    },
    emitFilteredActivitiesEmpty: () => c.filteredActivities$.next([]),
    clearGroupedActivities: () => {
      c.groupedActivitiesByAccount = [];
    },
    clearSelectedAccountKeysForActivities: () => {
      c.selectedAccountKeysForActivities = new Set();
    },
    clearSelectedAccountKeysForBreakdown: () => {
      c.selectedAccountKeysForBreakdown = new Set();
    },
    clearSelectedAccountKeysForFirsts: () => {
      c.selectedAccountKeysForFirsts = new Set();
    },
    calculateAccountStats: () => {
      void c.calculateAccountStats();
    },
    detectChanges: () => c.cdr.detectChanges(),
    getActiveTab: () => c.activeTab,
    syncActiveFirstsGameWithPlayers: () => c.syncActiveFirstsGameWithPlayers(),
    updatePlatformTabs: () => c.updatePlatformTabs(),
    updateUrlForPermalink: () => c.updateUrlForPermalink(),
  };
}

export function build_asPlayerSelectionClearHost(c: any) {
  return {
    cancelBackgroundOperations: () => c.cancelBackgroundOperations(),
    clearPlayerSpecificCaches: () => c.clearPlayerSpecificCaches(),
    clearArchivePlayerActivitiesCache: () =>
      c.pgcrApiService.clearPlayerActivitiesCache(),
    setSelectedPlayers: (players: any) => {
      c.selectedPlayers = players;
    },
    setSearchPanelExpanded: (expanded: boolean) => {
      c.searchPanelExpanded = expanded;
    },
    clearSelectedCharacterIds: () => {
      c.selectedCharacterIds = {};
    },
    clearCharacters: () => {
      c.characters = {};
    },
    clearActivities: () => {
      c.activities = {};
    },
    clearLoadingFlags: () => {
      c.loading = {};
    },
    clearErrors: () => {
      c.error = {};
    },
    clearGroupedActivities: () => {
      c.groupedActivitiesByAccount = [];
    },
    clearArchiveCoverage: () => {
      c.archiveCoverage = null;
      c.archiveWatermarkRequested = false;
    },
    setAddMode: (on: boolean) => {
      c.addMode = on;
    },
    clearFilteredActivitiesForDate: () => {
      c.filteredActivitiesForDate = [];
    },
    emitFilteredActivitiesEmpty: () => c.filteredActivities$.next([]),
    clearProcessedActivities: () => {
      c.processedActivities = [];
    },
    clearFirstEverActivities: () => {
      c.firstEverActivities = {};
    },
    clearGuardianFirstsMap: () => {
      c.guardianFirstsMap = {};
    },
    clearComputedAccountStats: () => {
      c.computedAccountStats = null;
    },
    setAccountStats: (stats: any) => {
      c.accountStats = stats as any;
    },
    clearPerPlatformStats: () => {
      c.perPlatformStats = [];
    },
    setLoadingAccountStats: (loading: boolean) => {
      c.loadingAccountStats = loading;
    },
    syncActivityStore: () => c.syncActivityStore(),
    clearAccountLoadingStatuses: () => {
      c.accountLoadingStatus.clear();
      c.accountLoadingStatuses = [];
    },
    setShowBackgroundProcessingIndicator: (show: boolean) => {
      c.showBackgroundProcessingIndicator = show;
    },
    clearActivityCaches: () => c.clearCache(),
    invalidateMemoCaches: () => c.invalidateMemoCaches(),
    clearFilteredActivitiesCache: () => c.filteredActivitiesCache.clear(),
    clearLocalActivityCache: () => c.activityCache.clear(),
    clearDatabaseCaches: () => c.activityDb.clearAllCaches(),
    emitStatsDebounce: () => c.statsDebounce$.next(),
    clearSelectedAccountsService: () => c.selectedAccounts.clear(),
    clearSyncedPlayers: () => c.syncedPlayers.clear(),
    resetSyncFlags: () => {
      c.firstFullSyncDone = false;
      c.initialDisplayShown = false;
    },
    detectChanges: () => c.cdr.detectChanges(),
    getClearDebugSnapshot: () => ({
      selectedPlayers: c.selectedPlayers.length,
      filteredActivities: c.filteredActivitiesForDate.length,
      processedActivities: c.processedActivities.length,
      cacheSize: c.filteredActivitiesCache.size,
      activityCacheSize: c.activityCache.size,
    }),
    logClear: (phase: any, snapshot: any) => {
      if (phase === 'start') {
        console.log('[CLEAR] Starting clearAllPlayers - current state:', snapshot);
      } else {
        console.log('[CLEAR] clearAllPlayers completed - new state:', snapshot);
      }
    },
  };
}

export function build_asGuardianFirstsLoadHost(c: any) {
  return {
    setLoadingGuardianFirsts: (loading: boolean) => {
      c.loadingGuardianFirsts = loading;
    },
    isD1Player: (p: any) => c.isD1Player(p),
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    getCharacterIdsForPlayer: (player: any) =>
      (c.characters[c.getPlayerKey(player)] || [])
        .map(getCharacterId)
        .filter((id: any) => !!id),
    setGuardianFirstsForPlayer: (playerKey: string, firsts: any) => {
      c.guardianFirstsMap[playerKey] = firsts;
    },
    getGuardianFirstsMapValues: () =>
      Object.values(c.guardianFirstsMap) as any[],
    setAggregateGuardianFirsts: (firsts: any) => {
      c.aggregateGuardianFirsts = firsts;
    },
    setGuardianFirsts: (firsts: any) => {
      c.guardianFirsts = firsts;
    },
    deriveFirstEverFromLoadedFirsts: (
      player: any,
      sorted: any) => c.deriveFirstEverFromLoadedFirsts(player, sorted),
    computeFirstEverActivityForPlayer: (player: any) => c.computeFirstEverActivityForPlayer(player),
    setFirstEverForPlayer: (playerKey: string, activity: any) => {
      c.firstEverActivities[playerKey] = activity;
    },
    bumpFirstEverActivities: () => {
      c.firstEverActivities = { ...c.firstEverActivities };
    },
    rebuildAggregateGuardianFirstsFromMap: () => c.rebuildAggregateGuardianFirstsFromMap(),
    updatePlatformTabs: () => c.updatePlatformTabs(),
    checkAndShowAnniversaryBanner: () => c.checkAndShowAnniversaryBanner(),
    detectChanges: () => c.cdr.detectChanges(),
  };
}

export function build_asActivityBreakdownLoadHost(c: any) {
  return {
    getSelectedPlayersLength: () => c.selectedPlayers.length,
    getActivityBreakdownGroupsLength: () => c.activityBreakdownGroups?.length ?? 0,
    isBreakdownLoadInFlight: () => c.breakdownLoadInFlight,
    setBreakdownDirty: (dirty: boolean) => {
      c.breakdownDirty = dirty;
    },
    bumpBreakdownLoadGen: () => ++c.breakdownLoadGen,
    getBreakdownLoadGen: () => c.breakdownLoadGen,
    setBreakdownLoadInFlight: (on: boolean) => {
      c.breakdownLoadInFlight = on;
    },
    setLoadingActivityBreakdown: (loading: boolean) => {
      c.loadingActivityBreakdown = loading;
    },
    clearBreakdownRowsAndGroups: () => {
      c.activityBreakdownRows = null;
      c.activityBreakdownGroups = [];
    },
    clearSelectedBreakdownCardLabels: () => {
      c.selectedBreakdownCardLabels = new Set();
    },
    markForCheck: () => c.cdr.markForCheck(),
    getBreakdownMembershipIds: () => c.getBreakdownMembershipIds(),
    getBreakdownSelectedGames: () => c.getBreakdownSelectedGames(),
    setBreakdownRetainExpansion: (retain: boolean) => {
      c.breakdownRetainExpansion = retain;
    },
    setActivityBreakdownRows: (rows: any) => {
      c.activityBreakdownRows = rows;
    },
    setActivityBreakdownGroups: (
      groups: any) => {
      c.activityBreakdownGroups = groups;
    },
    recomputeBreakdownChartData: () => c.recomputeBreakdownChartData(),
    logBreakdownDebug: (context: string) => c.logBreakdownDebug(context),
    getActiveTab: () => c.activeTab,
    isBreakdownDirty: () => c.breakdownDirty,
    reloadBreakdownPreserveView: () => {
      void c.loadActivityBreakdown({ preserveView: true });
    },
  };
}

export function build_asAccountLoadingStatusHost(c: any) {
  return {
    getAccountLoadingStatusMap: () => c.accountLoadingStatus,
    setAccountLoadingStatuses: (statuses: any) => {
      c.accountLoadingStatuses = statuses;
    },
    getAccountLoadingStatuses: () => c.accountLoadingStatuses,
    setShowLoadingModal: (show: boolean) => {
      c.showLoadingModal = show;
    },
    setIsLoadingComplete: (complete: boolean) => {
      c.isLoadingComplete = complete;
    },
    getIsLoadingComplete: () => c.isLoadingComplete,
    beginLookupAnalytics: () => c.beginLookupAnalytics(),
    getLoadingProgress: () => c.loadingProgress,
    updateLoadingProgress: (
      phase: any,
      current: number,
      total: number,
      message: string
    ) => c.updateLoadingProgress(phase, current, total, message),
    maybeSendLookupAnalytics: () => c.maybeSendLookupAnalytics(),
    closeLoadingModal: () => c.closeLoadingModal(),
    detectChanges: () => c.cdr.detectChanges(),
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    isD1Player: (p: any) => c.isD1Player(p),
    getPlatformName: (mt: number) => c.getPlatformName(mt),
    trackLookupError: (code: string) => c.siteAnalytics.trackLookupError(code),
  };
}

export function build_asTitlesTabLoadHost(c: any) {
  return {
    getSelectedPlayers: () => c.selectedPlayers,
    isD1Player: (p: any) => c.isD1Player(p),
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    hasPlayerTitles: (playerKey: string) => !!c.playerTitles[playerKey],
    getPlayerTitlesMap: () => c.playerTitles,
    setLoadingTitlesOverall: (loading: boolean) => {
      c.loadingTitlesOverall = loading;
    },
    setLoadingTitlesForPlayer: (playerKey: string, loading: boolean) => {
      c.loadingTitles[playerKey] = loading;
    },
    setPlayerTitles: (playerKey: string, titles: unknown[]) => {
      c.playerTitles[playerKey] = titles;
    },
    setAggregatedTitles: (titles: unknown[]) => {
      c.aggregatedTitles = titles;
    },
    emitStatsDebounce: () => c.statsDebounce$.next(),
    detectChanges: () => c.cdr.detectChanges(),
  };
}

export function build_asExportShareFlowHost(c: any) {
  return {
    getSelectedPlayers: () => c.selectedPlayers,
    getSelectedDate: () => c.selectedDate,
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    getCharacters: () => c.characters,
    getFilteredBreakdownSummaryCards: () => c.filteredActivityBreakdownSummaryCards,
    getFilteredBreakdownGroups: () => c.filteredActivityBreakdownGroups,
    getBreakdownSummaryCards: () => c.activityBreakdownSummaryCards,
    getBreakdownGroups: () => c.activityBreakdownGroups,
    formatSecondsToHoursMinutes: (s: number) => c.formatSecondsToHoursMinutes(s),
    getFilteredActivitiesForDate: () => c.filteredActivitiesForDate,
    getAccountStats: () => c.accountStats,
    getActivityBreakdownSnapshot: () => ({
      summaryCards: c.activityBreakdownSummaryCards,
      groups: c.activityBreakdownGroups,
      filters: {
        selectedAccountKeys: Array.from(
          c.selectedAccountKeysForBreakdown || []
        ) as string[],
        selectedCardLabels: Array.from(
          c.selectedBreakdownCardLabels || []
        ) as string[],
        chartGame: c.breakdownChartGame as string,
        chartCategory: c.breakdownChartCategory as string,
      },
    }),
    setShowExportDialog: (show: boolean) => {
      c.showExportDialog = show;
    },
    setShowShareDropdown: (show: boolean) => {
      c.showShareDropdown = show;
    },
    detectChanges: () => c.cdr.detectChanges(),
    getActiveTab: () => c.activeTab,
    onTabChange: (tab: string) => c.onTabChange(tab),
    isD1Player: (p: any) => c.isD1Player(p),
    clearPlayerTitlesCache: () => {
      c.playerTitles = {};
      c.aggregatedTitles = [];
    },
    setLoadingTitlesOverall: (loading: boolean) => {
      c.loadingTitlesOverall = loading;
    },
    markTitlesLoadingForPlayers: () => {
      for (const player of c.selectedPlayers) {
        if (c.isD1Player(player)) continue;
        const pKey = c.getPlayerKey(player);
        c.loadingTitles[pKey] = true;
        delete c.playerTitles[pKey];
      }
    },
  };
}

export function build_asArchiveExportFlowHost(c: any) {
  return {
    getSelectedPlayers: () => c.selectedPlayers,
    setErrorMessage: (message: string) => {
      c.errorMessage = message;
    },
    needProfilesMessage: () => c.uiI18n.t('archive.needProfiles'),
    exportFailedMessage: () => c.uiI18n.t('archive.exportFailed'),
    exportStartingMessage: () => c.uiI18n.t('archive.exportStarting'),
    setArchiveExporting: (on: boolean) => {
      c.archiveExporting = on;
    },
    setArchiveProgressMessage: (message: string) => {
      c.archiveProgressMessage = message;
    },
    setArchiveProgressPercent: (percent: number) => {
      c.archiveProgressPercent = percent;
    },
    detectChanges: () => c.cdr.detectChanges(),
    setApiAvailable: (on: boolean) => {
      c.apiAvailable = on;
    },
    setBungieUnavailable: (on: boolean) => {
      c.bungieUnavailable = on;
    },
    setShowOfflineDeviceReady: (on: boolean) => {
      c.showOfflineDeviceReady = on;
    },
    setDismissOfflineDeviceReady: (on: boolean) => {
      c.dismissOfflineDeviceReady = on;
    },
    loadAllFilteredActivities: (force: boolean) => c.loadAllFilteredActivities(force),
    getPlayerKey: (p: any) => c.getPlayerKey(p),
    getCharacters: (key: string) => c.characters[key] || [],
    getFirstEverActivity: () => c.firstEverActivity,
    setSelectedPlayers: (players: any) => {
      c.selectedPlayers = players;
    },
    setDateActivityLoading: (loading: boolean) => {
      c.loadingActivities[c.selectedDate] = loading;
    },
    showCachedDataInstantly: (player: any, playerKey: string) =>
      c.showCachedDataInstantly(player, playerKey),
    loadFavorites: () => c.loadFavorites(),
    loadCharacterHistory: (player: any) => c.loadCharacterHistory(player),
  };
}

