// @ts-nocheck
/** Anniversary / loading / archive UI helpers (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { SiteAnalyticsService } from '../../services/site-analytics.service';
import {
  loadDismissedAnniversaryIds,
  saveDismissedAnniversaryIds,
} from '../../utils/anniversary-dismiss-storage';
import { anniversaryBannerPrecheck } from '../../utils/anniversary-banner-check';
import { computeAnniversariesForSelectedDate as computeAnniversariesForDate } from '../../utils/compute-anniversaries-for-date';
import { buildComputeAnniversariesDeps } from '../../utils/compute-anniversaries-deps';
import { collectDisplayedRaidDungeonFirstsForPlayers } from '../../utils/collect-player-variant-groups';
import { anniversaryShareFlavor } from '../../utils/anniversary-share-flavor';
import { formatSelectedDateLabel as formatDateLabel } from '../../utils/format-selected-date-label';
import { sumTotalTimeForSelectedDate } from '../../utils/total-time-for-date';
import {
  getCachedPlayedWithAccounts,
  getCachedHeatmapMembershipIds,
  getCachedHeatmapCharacterMeta,
} from '../../utils/heatmap-membership-cache';
import { showInstallAppHint as showInstallAppHintUtil } from '../../utils/show-install-app-hint';
import {
  buildDecryptingCaption,
  buildDecryptingSubline,
  decryptingYearHint,
} from '../../utils/decrypting-caption';
import { mergeArchiveCoverage } from '../../utils/archive-coverage';
import { applyArchiveWatermark } from '../../utils/archive-watermark';
import { buildAccountLookupPayload } from '../../utils/lookup-analytics-send';
import { formatStatusDisplay as formatStatusDisplayUtil } from '../../utils/format-status-display';
import { addSearchChip, removeSearchChip } from '../../utils/search-chips';
import { searchModeErrorMessage } from '../../utils/search-mode-warning';
import {
  collectModalSearchPlayers,
  filterModalSelectedPlayers,
} from '../../utils/modal-search-players';
import { buildFavoriteAccountsFromPlayers } from '../../utils/favorites-from-modal';
import { preselectDefaultModalAccounts } from '../../utils/modal-account-preselect';
import { toggleInSet } from '../../utils/selection-set';
import { buildModalPlayerLoadHost } from '../../utils/modal-player-load-host';
import { buildSharePermalinkUrl } from '../../utils/share-permalink-url';
import { showSuccessMessage as showSuccessMessageUtil } from '../../utils/success-message';
import { scheduleAfterReady } from '../../utils/schedule-after-ready';
import {
  openExternalPgcr as openExternalPgcrUtil,
  openFullPgcrInNewTab as openFullPgcrInNewTabUtil,
} from '../../utils/open-external-pgcr';
import { handleActivityImageError } from '../../utils/activity-row-style';
import {
  resetAfterClearAllActivities as resetAfterClearAllActivitiesFn,
} from './player-search-session-reset';
import {
  handleEscapeKey as handleEscapeKeyFn,
  handleEnterKey as handleEnterKeyFn,
  handleTabKey as handleTabKeyFn,
  onVisibilityChange as onVisibilityChangeFn,
  closeModalOnBackdrop as closeModalOnBackdropFn,
} from './player-search-keyboard';
import {
  trapFocusInModal,
  focusFirstElementInModal,
  clearModalFocusToSearch,
} from '../../utils/modal-focus';
import { CLEAR_CACHED_DATA_CONFIRM_MESSAGE } from '../../utils/clear-cached-data-confirm';
import { parsePlayersParamFromUrl } from '../../utils/url-players-param';
import { parsePermalinkDateParam } from '../../utils/permalink-date-param';
import {
  isFavoriteAccount,
  buildFavoriteAccountFromPlayer,
} from '../../utils/favorite-account';
import { applyStopProfileLoadingFlags } from '../../utils/stop-profile-loading';
import { clampDatePickerMonthDay } from '../../utils/date-picker-month-day';
import { buildAccountStatsActivitiesMap } from '../../utils/account-stats-activities-map';
import {
  buildDisplayTitles,
  buildTitlesByLock,
} from '../../utils/title-display-list';
import {
  applySearchBundle as applySearchBundleUtil,
  resetSearchResultLists as resetSearchResultListsUtil,
} from '../../utils/player-search-bundle-apply';
import { build_asPlayerSearchTabChangeHost } from './player-search-host-adapters';
import { PlayerSearchLoadMixin } from './player-search-load-mixin';

const ANNIVERSARY_BANNER_DISMISSED_KEY = 'destiny-chronicle-anniversary-dismissed';
const HIDE_GET_STARTED_KEY = 'destiny-chronicle-hide-get-started';

export abstract class PlayerSearchUiMixin extends PlayerSearchLoadMixin {

  onDatePickerChange(dateInfo: { month: number; day: number }) {
    const next = clampDatePickerMonthDay(dateInfo.month, dateInfo.day);
    if (!next) return;
    this.selectedMonth = next.month;
    this.selectedDay = next.day;
    this.cdr.markForCheck();
  }

  protected computeAccountStatsWithService(): void {
    if (this.selectedPlayers.length === 0 || this.filteredActivitiesForDate.length === 0) {
      this.computedAccountStats = null;
      return;
    }
    const activitiesMap = buildAccountStatsActivitiesMap(
      this.selectedPlayers,
      this.filteredActivitiesForDate
    );
    this.computedAccountStats = this.statsService.calculateAccountStats(
      this.selectedPlayers,
      activitiesMap
    );
  }

  getActivityDisplayName(activity: any): string {
    const name = activity?.displayName;
    return typeof name === 'string' && name.trim().length > 0 ? name : 'Unknown';
  }

  protected runWithPlayerSyncLimit<T>(task: () => Promise<T>): Promise<T> {
    return this.playerSyncLimiter.run(task);
  }

  get displayTitles(): any[] {
    return buildDisplayTitles(this.aggregatedTitles, this.titleFilter, this.titleSort);
  }

  protected getTitlesByLock(locked: boolean): any[] {
    return buildTitlesByLock(
      this.aggregatedTitles,
      locked,
      this.titleFilter,
      this.titleSort
    );
  }

  get unlockedTitlesDisplay(): any[] {
    return this.getTitlesByLock(false);
  }

  get lockedTitlesDisplay(): any[] {
    return this.getTitlesByLock(true);
  }

  protected async clearForReplaceSearch(): Promise<void> {
    await this.activityDb.clearAllActivities();
    const remainingCount = await this.activityDb.activities.count();
    if (remainingCount > 0) {
      console.error(
        `[CLEAR] CRITICAL: ${remainingCount} activities still in database after clearing!`
      );
    }
    this.clearAllPlayers();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.textView.queryParams(),
      replaceUrl: true,
    });
  }

  protected resetSearchResultLists(): void {
    resetSearchResultListsUtil(this);
  }

  protected applySearchBundle(bundle: any, mode: 'replace' | 'append'): void {
    applySearchBundleUtil(this, bundle, mode);
  }

  toggleAddMode(): void {
    this.addMode = !this.addMode;
    if (this.addMode && this.selectedPlayers.length > 0) {
      this.searchPanelExpanded = true;
    }
    this.errorMessage = searchModeErrorMessage({
      addMode: this.addMode,
      selectedPlayersLength: this.selectedPlayers.length,
      searchUsername: this.searchUsername,
    });
    this.cdr.markForCheck();
  }

  async debugReloadFirstEver() {
    this.clearFirstEverActivitiesCache();
    this.firstEverActivity = undefined;
    if (this.selectedPlayers.length > 0) {
      this.firstEverActivity = await this.computeFirstEverActivityForSelectedPlayerFromDb();
      this.cdr.detectChanges();
    }
  }

  getAllRecordHashes(): string[] {
    const records = (window as any).d2TitleRecords;
    return records ? Object.keys(records) : [];
  }

  getRecordByHash(hash: string): any {
    const records = (window as any).d2TitleRecords;
    return records ? records[hash] : null;
  }

  getFilteredRecordHashes(): string[] {
    const filter = this.recordHashFilter.trim().toLowerCase();
    if (!filter) return this.getAllRecordHashes();
    return this.getAllRecordHashes().filter((hash) => {
      if (hash.includes(filter)) return true;
      const record = this.getRecordByHash(hash);
      return record && JSON.stringify(record).toLowerCase().includes(filter);
    });
  }

  runProfileRecordsTest() {
    if (this.selectedPlayers.length > 0) {
      const player = this.selectedPlayers[0];
      void player;
    } else {
      console.warn('[TEST] No player selected for test.');
    }
  }

  isRecordCompleted(record: any): boolean {
    return !!record && (record.state & 1) !== 0;
  }

  /** Destiny 2 accounts for the Played With menu. A Destiny 1-only membership is left out. */
  get playedWithAccounts(): PlayedWithAccountChoice[] {
    const cache = { key: this.playedWithAccountCacheKey, value: this.playedWithAccountCache };
    const accounts = getCachedPlayedWithAccounts(this.selectedPlayers, cache);
    this.playedWithAccountCacheKey = cache.key;
    this.playedWithAccountCache = cache.value;
    return accounts;
  }
  get heatmapMembershipIds(): string[] {
    const cache = { key: this.heatmapIdCacheKey, value: this.heatmapIdCache };
    const ids = getCachedHeatmapMembershipIds(this.selectedPlayers, cache);
    this.heatmapIdCacheKey = cache.key;
    this.heatmapIdCache = cache.value;
    return ids;
  }
  get heatmapCharacterMeta(): Record<string, HeatmapCharacterLookup> {
    const cache = { key: this.heatmapClassCacheKey, value: this.heatmapClassCache };
    const meta = getCachedHeatmapCharacterMeta(
      this.selectedPlayers,
      this.characters,
      (p) => this.getPlayerKey(p),
      cache
    );
    this.heatmapClassCacheKey = cache.key;
    this.heatmapClassCache = cache.value;
    return meta;
  }
  get isOfflineArchiveMode(): boolean {
    return this.archiveRuntime.isOfflineMode;
  }
  get isArchiveSyncing(): boolean {
    return this.archiveRuntime.isOnlineSyncSession;
  }
  get showInstallAppHint(): boolean {
    return showInstallAppHintUtil({
      showOfflineDeviceReady: this.showOfflineDeviceReady,
      isOfflineArchiveMode: this.isOfflineArchiveMode,
    });
  }
  get offlineFrozenLabel(): string | null {
    return this.archiveRuntime.frozenAtLabel;
  }

  /**
   * True while Account Summary count/time should show a placeholder instead of 0.
   * Shared by Summary, profile cards, and text view — backed by ActivityStore.
   */
  get accountStatsPending(): boolean {
    return this.activityStore.statsPending();
  }

  /** Shared activity count for Summary / cards — null while pending. */
  get displayTotalActivityCount(): number | null {
    return this.activityStore.totalActivitiesDisplay();
  }

  /** Shared activity-only time (seconds) for Summary — null while pending. */
  get displayActivityTimeSeconds(): number | null {
    return this.activityStore.timeInLoadedActivitiesDisplay();
  }

  /** Keep ActivityStore in sync with local accountStats / load flags (CODE_CLEANUP_SPEC Step 3). */
  protected syncActivityStore(): void {
    this.activityStore.setSelectedPlayerCount(this.selectedPlayers.length);
    this.activityStore.setProfileLoadInProgress(this.profileLoadInProgress);
    this.activityStore.setLoadingStats(this.loadingAccountStats);
    this.activityStore.setFromAccountStats(this.accountStats, this.perPlatformStats);
    this.syncProfileStore();
  }

  /** Keep ProfileStore in sync with selection / coverage / load progress (CODE_CLEANUP_SPEC). */
  protected syncProfileStore(): void {
    this.profileStore.syncFromHost({
      selectedPlayers: this.selectedPlayers,
      profileLoadInProgress: this.profileLoadInProgress,
      archiveCoverage: this.archiveCoverage,
      showLoadingModal: this.showLoadingModal,
      loadingProgress: this.loadingProgress,
    });
  }

  /** Total time in seconds for the selected date (from filteredActivitiesForDate). When account cards are selected, only sums time for those accounts. */
  get totalTimeForSelectedDate(): number {
    return sumTotalTimeForSelectedDate({
      activities: this.filteredActivitiesForDate,
      selectedAccountKeys: this.selectedAccountKeysForActivities,
      getAccountKey: (act) => this.getActivityAccountKey(act),
      getDurationSeconds: (act) => this.getActivityDurationSeconds(act),
    });
  }

  /** Formats the selected date for display (e.g. "April 23, 2024") */
  formatSelectedDateLabel(): string {
    return formatDateLabel(
      this.selectedYear ?? new Date().getFullYear(),
      this.selectedMonth,
      this.selectedDay
    );
  }
  protected loadDismissedAnniversaries(): void {
    this.dismissedAnniversaries = loadDismissedAnniversaryIds(
      ANNIVERSARY_BANNER_DISMISSED_KEY
    );
  }
  protected saveDismissedAnniversaries(): void {
    saveDismissedAnniversaryIds(
      ANNIVERSARY_BANNER_DISMISSED_KEY,
      this.dismissedAnniversaries
    );
  }

  /**
   * Generates a unique key for dismissing an anniversary banner.
   */
  protected getAnniversaryDismissKey(): string {
    const playerKeys = this.selectedPlayers.map(p => this.getPlayerKey(p)).sort().join(',');
    return `${this.selectedDate}:${playerKeys}`;
  }

  /**
   * Checks if firsts are loaded and computes anniversaries for the selected date.
   * Only triggers if both activities and firsts are loaded, and banner hasn't been dismissed.
   */
  checkAndShowAnniversaryBanner(): void {
    const pre = anniversaryBannerPrecheck({
      loadingActivities: !!this.loadingActivities[this.selectedDate],
      loadingGuardianFirsts: this.loadingGuardianFirsts,
      dismissKey: this.getAnniversaryDismissKey(),
      dismissedAnniversaries: this.dismissedAnniversaries,
      selectedPlayersLength: this.selectedPlayers.length,
      selectedDate: this.selectedDate,
    });
    if (pre === 'skip') return;
    if (pre === 'hide') {
      this.showAnniversaryBanner = false;
      return;
    }
    const anniversaries = this.computeAnniversariesForSelectedDate();
    if (anniversaries.length > 0) {
      this.anniversaryFirsts = anniversaries;
      this.showAnniversaryBanner = true;
      this.cdr.detectChanges();
    } else {
      this.showAnniversaryBanner = false;
    }
  }

  /**
   * Computes Guardian Firsts-tab milestones that fall on the selected date.
   * Uses the same Firsts records as the Firsts tab (not activity clears).
   * First Ever is shown only when it is not already that Firsts milestone.
   */
  protected computeAnniversariesForSelectedDate(): AnniversaryFirst[] {
    if (!this.selectedDate) return [];
    return computeAnniversariesForDate(buildComputeAnniversariesDeps(this as any));
  }

  /** One clear per raid or dungeon version, the same records the Firsts cards render. */
  protected displayedRaidDungeonFirsts(): ActivityFirstCompletion[] {
    return collectDisplayedRaidDungeonFirstsForPlayers(this.selectedPlayers, (player) => [
      ...this.getPlayerD2RaidVariants(player),
      ...this.getPlayerD1RaidVariants(player),
      ...this.getPlayerD2DungeonVariants(player),
      ...this.getPlayerPantheonVariants(player),
      ...this.getPlayerRiteOfTheNineVariants(player),
    ]);
  }

  /**
   * Dismisses the anniversary celebration banner for this session.
   */
  onDismissAnniversaryBanner(): void {
    const dismissKey = this.getAnniversaryDismissKey();
    this.dismissedAnniversaries.add(dismissKey);
    this.saveDismissedAnniversaries();
    this.showAnniversaryBanner = false;
    this.cdr.detectChanges();
  }

  /**
   * Navigates to the Firsts tab when an anniversary is clicked.
   */
  onNavigateToAnniversary(anniversary: AnniversaryFirst): void {
    this.activeTab = 'firsts';
    this.cdr.detectChanges();
  }

  /** Open the decrypted-memory share card (Phase 2). */
  onShareAnniversaryMemory(anniversary: AnniversaryFirst): void {
    this.shareMemoryItem = anniversary;
    this.shareMemoryFlavor = anniversaryShareFlavor(anniversary.yearsAgo);
    this.shareMemoryOpen = true;
    this.cdr.markForCheck();
  }
  closeShareMemoryCard(): void {
    this.shareMemoryOpen = false;
    this.shareMemoryItem = null;
    this.cdr.markForCheck();
  }

  /** Reset privacy-safe lookup analytics state for a new multi-account load. */
  protected beginLookupAnalytics(): void {
    this.lookupStartedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lookupDataSources.clear();
    this.lookupAnalyticsSent = false;
  }
  protected noteLookupDataSource(source: 'archive' | 'bungie'): void {
    this.lookupDataSources.add(source);
  }
  noteArchiveCoverage(cov: PlayerActivitiesCoverage): void {
    const next = mergeArchiveCoverage(this.archiveCoverage, cov.level);
    if (next) {
      this.archiveCoverage = next;
    }
    this.ensureArchiveWatermark();
  }

  /** Caption for the loading engram (years when known, else profile / phase). */
  get decryptingCaption(): string {
    return buildDecryptingCaption({
      isLoadingComplete: this.isLoadingComplete,
      yearHint: this.decryptingYearHint,
      profileDisplayName: this.getCurrentLoadingProfile()?.displayName,
    });
  }

  /** Numeric sub-line under the engram — keep Stop + counts visible. */
  get decryptingSubline(): string {
    return buildDecryptingSubline({
      completedCount: this.getCompletedCount(),
      totalStatuses: this.accountLoadingStatuses.length,
      loadingProgress: this.loadingProgress,
    });
  }

  /** Prefer a year from the progress message when present (e.g. "…2019…"). */
  protected get decryptingYearHint(): string | null {
    return decryptingYearHint(this.loadingProgress?.message);
  }
  protected ensureArchiveWatermark(): void {
    if (this.archiveWatermarkRequested || !this.pgcrApiService.enabled) {
      return;
    }
    this.archiveWatermarkRequested = true;
    void this.pgcrApiService.fetchWatermark().then((mark) => {
      if (!mark || !this.archiveCoverage) {
        return;
      }
      const next = applyArchiveWatermark(this.archiveCoverage, mark);
      if (!next) return;
      this.archiveCoverage = next;
      this.cdr.markForCheck();
    });
  }

  /** Fire account_lookup (+ per-error lookup_error) once when a load batch finishes. */
  protected maybeSendLookupAnalytics(): void {
    const payload = buildAccountLookupPayload({
      alreadySent: this.lookupAnalyticsSent,
      statuses: this.accountLoadingStatuses,
      lookupStartedAtMs: this.lookupStartedAtMs,
      lookupDataSources: this.lookupDataSources,
      bucketLoadMs: (ms) => SiteAnalyticsService.bucketLoadMs(ms),
    });
    if (!payload) return;
    this.lookupAnalyticsSent = true;
    this.siteAnalytics.trackAccountLookup(payload.track as any);
    if (payload.errorCount > 0) {
      this.siteAnalytics.trackLookupError('account_load_failed');
    }
  }
  protected updateAccountLoadingStatus(
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    status: AccountLoadingStatus['status'],
    message: string,
    progress?: number
  ) {
    this.accountLoadingStatusSvc.updateAccountLoadingStatus(
      this.asAccountLoadingStatusHost(),
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      status,
      message,
      progress
    );
  }

  /**
   * Removes the loading status for a completed account
   */
  protected removeAccountLoadingStatus(accountKey: string) {
    this.accountLoadingStatusSvc.removeAccountLoadingStatus(
      this.asAccountLoadingStatusHost(),
      accountKey
    );
  }

  /**
   * Mark a profile as failed/skipped when a multi-load is cancelled (load token changed).
   * Keeps the loading modal honest so it never sits forever on "Fetching Profile".
   */
  protected markAccountLoadCancelled(
    player: PlayerSearchDisplay | PlayerSearchResult,
    reason: string
  ): void {
    this.accountLoadingStatusSvc.markAccountLoadCancelled(
      this.asAccountLoadingStatusHost(),
      player,
      reason
    );
  }

  /**
   * Formats status for display in the UI
   */
  public formatStatusDisplay(status: string): string {
    return formatStatusDisplayUtil(status);
  }

  /**
   * Closes the loading modal
   */
  public closeLoadingModal(): void {
    this.showLoadingModal = false;
    this.isLoadingComplete = false;
  }

  /**
   * Gets the count of completed accounts
   */
  public getCompletedCount(): number {
    return this.accountLoadingStatuses.filter(s => s.status === 'complete').length;
  }
  public getOverallProgress(): number {
    if (this.accountLoadingStatuses.length === 0) return 0;
    return Math.round((this.getCompletedCount() / this.accountLoadingStatuses.length) * 100);
  }

  /** Returns the profile currently being loaded (not complete) for display in the loading modal */
  public getCurrentLoadingProfile(): { displayName: string; platform: string } | null {
    const loading = this.accountLoadingStatuses.find(s => s.status !== 'complete' && s.status !== 'error');
    return loading ? { displayName: loading.displayName, platform: loading.platform } : null;
  }
  public continueInBackground(): void {
    // Deprecated: replaced by passive notice. Keep no-op for safety.
    this.showLoadingModal = true;
  }

  /**
   * Batched UI update to prevent excessive re-renders during progressive loading
   */
  protected scheduleBatchedUpdate(): void {
    if (this.pendingActivityUpdates) {
      return; // Already scheduled
    }

    this.pendingActivityUpdates = true;
    
    if (this.updateBatchTimer) {
      clearTimeout(this.updateBatchTimer);
    }

    this.updateBatchTimer = setTimeout(() => {
      this.performBatchedUpdate();
    }, this.BATCH_UPDATE_DELAY);
  }
  protected performBatchedUpdate(): void {
    if (!this.pendingActivityUpdates) {
      return;
    }

    // Update the activities display
    this.processAndGroupActivities();
    this.cdr.detectChanges();
    
    // Reset flags
    this.pendingActivityUpdates = false;
    this.updateBatchTimer = null;
  }
  protected async hydrateFromOfflineArchive(): Promise<void> {
    await this.archiveExportFlow.hydrateFromOfflineArchive(this.asArchiveExportFlowHost());
  }
  async saveForOfflineOnDevice(includePgcr = true): Promise<void> {
    await this.archiveExportFlow.runArchiveExport(
      this.asArchiveExportFlowHost(),
      'prepare',
      includePgcr
    );
  }
  async buildOfflineArchive(includePgcr = true): Promise<void> {
    await this.archiveExportFlow.runArchiveExport(
      this.asArchiveExportFlowHost(),
      'download',
      includePgcr
    );
  }
  async buildHtmlArchiveReport(): Promise<void> {
    await this.archiveExportFlow.buildHtmlArchiveReport(this.asArchiveExportFlowHost());
  }
  async updateOfflineArchive(): Promise<void> {
    await this.archiveExportFlow.updateOfflineArchive(this.asArchiveExportFlowHost());
  }
  async onArchiveFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      await this.archiveExportFlow.importArchiveFile(this.asArchiveExportFlowHost(), file);
    } finally {
      input.value = '';
    }
  }
  exitOfflineArchive(): void {
    this.archiveService.exitOfflineMode();
    this.showOfflineDeviceReady = false;
    window.location.reload();
  }
  dismissOfflineReadyBanner(): void {
    this.dismissOfflineDeviceReady = true;
    this.cdr.detectChanges();
  }
  toggleArchiveBackupOptions(): void {
    this.showArchiveBackupOptions = !this.showArchiveBackupOptions;
    this.cdr.detectChanges();
  }
  triggerArchiveImport(): void {
    document.getElementById('archive-import-input')?.click();
  }

  /** While in offline mode: reach out to Bungie, sync archived accounts, refresh archive in place. */
  async checkForArchiveUpdates(): Promise<void> {
    await this.archiveExportFlow.checkForArchiveUpdates(this.asArchiveExportFlowHost());
  }

  protected scheduleAfterBrowseReady(fn: () => void): void {
    scheduleAfterReady(
      () => !this.showLoadingModal && !this.loadingProgress,
      fn
    );
  }

  onSearchInput(value: string): void {
    this.searchTerm$.next(value);
    this.errorMessage = searchModeErrorMessage({
      addMode: this.addMode,
      selectedPlayersLength: this.selectedPlayers.length,
      searchUsername: value,
    });
  }

  handleSearchEnter(event: Event): void {
    event.preventDefault();
    this.addSearchChip();
  }

  addSearchChip(): void {
    const result = addSearchChip(this.searchChips, this.searchUsername);
    if (!result) return;
    this.searchChips = result.chips;
    this.searchUsername = result.value;
    this.errorMessage = '';
  }

  removeSearchChip(index: number): void {
    this.searchChips = removeSearchChip(this.searchChips, index);
  }

  async selectAllPlayersInModal() {
    this.modalSelectedPlayers.clear();
    for (const player of this.collectAllModalPlayers()) {
      this.modalSelectedPlayers.add(this.getPlayerKey(player));
    }
    this.cdr.detectChanges();
  }

  protected collectAllModalPlayers(): any[] {
    return collectModalSearchPlayers({
      crossSavePlayer: this.crossSavePlayer,
      d2SearchResults: this.d2SearchResults,
      d1SearchResults: this.d1SearchResults,
    });
  }

  async addSelectedToFavorites() {
    const selectedPlayers = filterModalSelectedPlayers(
      this.collectAllModalPlayers(),
      this.modalSelectedPlayers,
      (p) => this.getPlayerKey(p)
    );
    const favorites = buildFavoriteAccountsFromPlayers(
      selectedPlayers,
      (a) => this.getFavoriteKey(a)
    );
    for (const fav of favorites) {
      await this.addFavorite(fav);
    }
  }

  clearModalSelection() {
    this.modalSelectedPlayers.clear();
    this.cdr.detectChanges();
  }

  openPlatformPicker(): void {
    this.preselectDefaultModalAccounts();
    this.showPlatformPicker = true;
    this.cdr.detectChanges();
  }

  protected preselectDefaultModalAccounts(): void {
    this.modalSelectedPlayers = preselectDefaultModalAccounts({
      crossSavePlayer: this.crossSavePlayer,
      d1SearchResults: this.d1SearchResults,
      getPlayerKey: (p) => this.getPlayerKey(p),
    });
  }

  expandSearchPanel(): void {
    this.searchPanelExpanded = true;
  }

  collapseSearchPanel(): void {
    this.searchPanelExpanded = false;
  }

  isPlayerSelected(player: any): boolean {
    return this.modalSelectedPlayers.has(this.getPlayerKey(player));
  }

  togglePlayerSelection(player: any, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    this.modalSelectedPlayers = toggleInSet(
      this.modalSelectedPlayers,
      this.getPlayerKey(player)
    );
    this.showPlatformPicker = true;
    this.cdr.markForCheck();
  }

  getSelectedCount(): number {
    return this.modalSelectedPlayers.size;
  }

  get d2ModalAccounts(): any[] {
    return this.d2SearchResults.filter((p) => !p.isCrossSavePrimary);
  }

  getTotalCount(): number {
    return this.collectAllModalPlayers().length;
  }

  async loadSelectedPlayers() {
    await this.modalPlayerLoad.loadSelectedPlayers(buildModalPlayerLoadHost(this));
  }

  dismissGetStartedBanner(): void {
    this.hideGetStartedBanner = true;
    if (typeof localStorage !== 'undefined') localStorage.setItem(HIDE_GET_STARTED_KEY, 'true');
  }

  async exportBreakdownToExcel(): Promise<void> {
    await this.exportShareFlow.exportBreakdownToExcel(this.asExportShareFlowHost());
  }

  async exportActivities(): Promise<void> {
    await this.exportShareFlow.exportActivities(this.asExportShareFlowHost());
  }

  openExportOptionsDialog() {
    this.exportShareFlow.openExportOptionsDialog(this.asExportShareFlowHost());
  }

  async handleExportOptions(options: any) {
    await this.exportShareFlow.handleExportOptions(this.asExportShareFlowHost(), options);
  }

  async refreshTitles() {
    await this.exportShareFlow.refreshTitles(this.asExportShareFlowHost());
  }

  async debugTitles() {
    console.log('[Titles] Starting debug...');
    await this.titleService.debugAllTitles();
  }

  getMainMembershipId(): string {
    const mainPlayer =
      this.selectedPlayers.find((p) => !this.isD1Player(p) && p.isPrimary) ||
      this.crossSavePlayer ||
      this.selectedPlayers.find((p) => !this.isD1Player(p));
    return mainPlayer?.membershipId || '';
  }

  async loadActivityBreakdown(options?: { preserveView?: boolean }): Promise<void> {
    await this.activityBreakdownLoad.loadActivityBreakdown(
      this.asActivityBreakdownLoadHost(),
      options
    );
  }

  async onTabChange(
    tab:
      | 'activities'
      | 'firsts'
      | 'titles'
      | 'accomplishments'
      | 'breakdown'
      | 'heatmap'
      | 'playedWith'
  ) {
    await this.playerSearchTabChange.onTabChange(
      build_asPlayerSearchTabChangeHost(this),
      tab
    );
  }

  protected async ensureTitlesLoadedForTab(): Promise<void> {
    await this.titlesTabLoad.ensureTitlesLoadedForTab(this.asTitlesTabLoadHost());
  }

  async loadTitlesForPlayer(player: any): Promise<void> {
    await this.titlesTabLoad.loadTitlesForPlayer(this.asTitlesTabLoadHost(), player);
  }

  get d2Players(): any[] {
    return this.selectedPlayers.filter((p) => p.game === 'D2');
  }

  async shareDailyView(): Promise<void> {
    await this.exportShareFlow.shareDailyView(this.asExportShareFlowHost());
  }

  clearFirstEverActivitiesCache(): void {
    this.firstEverActivities = {};
    this.firstEverActivity = undefined;
    if (this.firstActivityService) {
      this.firstActivityService.clearCache();
    }
  }

  protected updateUrlForPermalink() {
    this.location.replaceState(
      buildSharePermalinkUrl({
        date: this.selectedDate,
        players: this.selectedPlayers,
        textView: this.textView.enabled(),
      })
    );
  }

  async copyDataToClipboard() {
    await this.exportShareFlow.copyDataToClipboard(this.asExportShareFlowHost());
  }

  async exportCurrentDate() {
    await this.exportShareFlow.exportCurrentDate(this.asExportShareFlowHost());
  }

  async captureScreenshot() {
    await this.exportShareFlow.captureScreenshot(this.asExportShareFlowHost());
  }

  protected showSuccessMessage(message: string) {
    showSuccessMessageUtil(message);
  }

  protected clearFilteredActivitiesCache(): void {
    this.filteredActivitiesCache.clear();
  }

  openExternalPGCR(activity: any, isD1: boolean, event?: MouseEvent): void {
    openExternalPgcrUtil(activity, isD1, event, {
      selectedPlayers: this.selectedPlayers,
      activeTab: this.activeTab,
      getActivityName: (a, d1) => this.getActivityName(a, d1),
      openPgcrLiteFromActivity: (a, d1, name) =>
        this.pgcrModalService.openPgcrLiteFromActivity(a, d1, name),
      openFullPgcrInNewTab: (id, d1) => this.openFullPgcrInNewTab(id, d1),
    });
  }

  protected openFullPgcrInNewTab(instanceId: string | number, isD1: boolean): void {
    openFullPgcrInNewTabUtil(instanceId, isD1);
  }

  handleImageError(event: Event, _isD1: boolean): void {
    handleActivityImageError(event);
  }

  async clearAllActivitiesFromDb() {
    if (
      !confirm(
        'Are you sure you want to clear all activities from the database? This cannot be undone.'
      )
    ) {
      return;
    }
    await this.activityDb.clearAllActivities();
    resetAfterClearAllActivitiesFn(this);
    alert('All activities have been cleared from the database.');
  }

  onDateSearch() {
    this.onDateSelect(this.selectedMonth.toString(), this.selectedDay.toString());
  }

  openExternalPGCRFromStored(activity: any, _event?: MouseEvent) {
    if (!activity) return;
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) return;
    if (this.activeTab === 'firsts') {
      this.pgcrModalService.openPgcrLiteFromStored(activity, false);
      return;
    }
    this.openExternalPGCR(activity as any, false);
  }

  protected onVisibilityChange(): void {
    onVisibilityChangeFn(this);
  }

  dismissBackgroundLoadingTip(): void {
    this.showBackgroundLoadingTip = false;
    this.cdr.markForCheck();
  }

  /** True when pointer-down started on the overlay (not the panel) — avoids close-on-reflow. */
  protected modalBackdropArmed = false;

  onModalOverlayPointerDown(event: Event): void {
    this.modalBackdropArmed = event.target === event.currentTarget;
  }

  closeModalOnBackdrop(event: Event): void {
    closeModalOnBackdropFn(this, event);
  }

  protected handleEscapeKey(): void {
    handleEscapeKeyFn(this);
  }

  protected handleEnterKey(event: KeyboardEvent): void {
    handleEnterKeyFn(this, event);
  }

  protected handleTabKey(event: KeyboardEvent): void {
    handleTabKeyFn(this, event);
  }

  protected trapFocusInModal(event: KeyboardEvent): void {
    trapFocusInModal(event);
  }

  protected focusFirstElementInModal(modalSelector: string): void {
    focusFirstElementInModal(modalSelector);
  }

  protected clearModalFocus(): void {
    clearModalFocusToSearch();
  }

  openFavoritesModal(): void {
    this.showFavoritesModal = true;
    this.focusFirstElementInModal('.modal.show');
  }

  confirmClearData(): void {
    if (confirm(CLEAR_CACHED_DATA_CONFIRM_MESSAGE)) {
      this.clearAllActivitiesFromDb();
    }
  }

  async loadFavorites() {
    this.favoriteAccounts = await this.activityDb.getFavorites();
    this.cdr.detectChanges();
  }

  async loadAndDisplayFavorites() {
    await this.loadFavorites();
    this.showFavoritesLoadPrompt =
      this.favoriteAccounts.length > 0 && this.selectedPlayers.length === 0;
    this.cdr.detectChanges();
  }

  async confirmLoadFavorites(): Promise<void> {
    this.showFavoritesLoadPrompt = false;
    if (this.favoriteAccounts.length === 0) {
      return;
    }
    await this.loadMultipleFavorites(this.favoriteAccounts);
  }

  dismissFavoritesPrompt(): void {
    this.showFavoritesLoadPrompt = false;
    this.cdr.detectChanges();
  }

  stopProfileLoading(): void {
    applyStopProfileLoadingFlags(this);
    this.clearAllPlayers();
    this.syncActivityStore();
    this.cdr.detectChanges();
  }

  async showCachedDataInstantly(player: any, playerKey: string): Promise<boolean> {
    return this.cachedActivityHydrate.showCachedDataInstantly(
      {
        setPlayerActivities: (key, activities) => {
          this.activities[key] = activities;
        },
        loadAllFilteredActivities: (force) => this.loadAllFilteredActivities(force),
      },
      player,
      playerKey
    );
  }

  async loadMultipleFavorites(favorites: any[]) {
    await this.favoritesLoad.loadMultipleFavorites(this.asFavoritesLoadHost(), favorites);
  }

  isFavorite(player: any): boolean {
    return isFavoriteAccount(this.favoriteAccounts, player);
  }

  protected applyPlayersParamFromUrl(playersParam: string): void {
    const parsed = parsePlayersParamFromUrl(playersParam);
    if (parsed) {
      this.pendingPlayerData = parsed;
      return;
    }
    if (playersParam) {
      console.warn('Invalid player data in URL (could not JSON.parse after decode attempts)');
    }
  }

  protected applyPermalinkDate(dateParam: string | null | undefined): void {
    const parsed = parsePermalinkDateParam(dateParam);
    if (!parsed) return;
    this.selectedYear = parsed.year;
    this.selectedMonth = parsed.month;
    this.selectedDay = parsed.day;
    this.selectedDate = parsed.date;
  }

  async loadPlayersFromUrlData(playerData: any[]) {
    await this.favoritesLoad.loadPlayersFromUrlData(this.asFavoritesLoadHost(), playerData);
  }

  async toggleFavorite(player: any) {
    if (this.isFavorite(player)) {
      await this.removeFavorite(player.membershipId, player.game);
    } else {
      await this.addFavorite(player);
    }
  }

  async addFavorite(player: any) {
    const favorite = buildFavoriteAccountFromPlayer(player, (a) => this.getFavoriteKey(a));
    await this.activityDb.addFavorite(favorite);
    await this.loadFavorites();
  }

  async removeFavorite(
    membershipId: string,
    game: 'D1' | 'D2',
    membershipType?: number
  ) {
    await this.activityDb.removeFavorite(membershipId, game, membershipType);
    await this.loadFavorites();
  }
}
