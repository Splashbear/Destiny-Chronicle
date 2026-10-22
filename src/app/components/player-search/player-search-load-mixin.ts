// @ts-nocheck
/** Load / date / format orchestration for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Observable } from 'rxjs';
import { PlatformAccount } from '../../models/platform-account.model';
import { ActivityMode, ACTIVITY_MODE_MAP } from '../../models/activity-types';
import { formatSecondsToHoursMinutes as formatDurationHm } from '../../utils/format-duration';
import { formatDurationParts } from '../../utils/format-duration-parts';
import {
  filterActivitiesByMonthDay,
  flattenAndSortActivitiesByPeriod,
  isActivityOnMonthDay,
  validateSelectedDateString,
} from '../../utils/date-activity-match';
import {
  getSortedYears as getSortedYearsUtil,
  getSortedTypes as getSortedTypesUtil,
} from '../../utils/sorted-activity-keys';
import { getPlatformsForGame } from '../../utils/player-platforms';
import { resolveBungieApiIssueNotices } from '../../utils/bungie-api-issue';
import {
  buildReportCountMessage as buildReportCountMessageUtil,
  getReportSummaryLine as getReportSummaryLineUtil,
} from '../../utils/report-count-message';
import { isD1Player as isD1PlayerUtil } from '../../utils/is-d1-player';
import { classNameFromType } from '../../utils/character-class-for-first';
import { getPlatformName as platformNameFromType } from '../../utils/platform-name';
import { clearPlayerSpecificCaches as clearPlayerSpecificCachesUtil } from '../../utils/clear-player-caches';
import { getActivityDurationSeconds as activityDurationSeconds } from '../../utils/activity-duration';
import { buildPgcrEnrichHost } from '../../utils/pgcr-enrich-host';
import { getFilteredActivitiesCached } from '../../utils/get-filtered-activities';
import {
  getActivityKills,
  getActivityDeaths,
  getActivityKdRatio,
} from '../../utils/activity-kd';
import { resolveActivityDisplayName } from '../../utils/resolve-activity-name';
import { buildFilteredActivitiesForDateHost } from '../../utils/filtered-activities-for-date-host';
import {
  resetSessionForPrimarySelect as resetSessionForPrimarySelectFn,
} from './player-search-session-reset';
import { PlayerSearchActivitiesMixin } from './player-search-activities-mixin';

export abstract class PlayerSearchLoadMixin extends PlayerSearchActivitiesMixin {
  formatSecondsToHoursMinutes(totalSeconds: number | undefined | null): string {
    return formatDurationHm(totalSeconds);
  }

  protected updatePlatformTabs() {
    // Limit the platform list to those that belong to the selected game tab so that
    // Destiny 1 & Destiny 2 never mix within the same sub-view.
    this.platformTabs = this.getPlatforms(this.activeFirstsGame);
    if (!this.platformTabs.includes(this.activeFirstsTab) && this.activeFirstsTab !== 'all') {
      this.activeFirstsTab = 'all';
    }
  }

  // On API error, set apiAvailable = false and show cached favorites
  async handleApiError(error: any) {
    this.noteBungieApiIssue('both', error);
    if (error?.status === 503 || error?.status === 0) {
      this.apiAvailable = false;
      await this.loadFavorites();
    }
  }

  /**
   * Chronicle archive API hard-failed; history is coming from live Bungie (slower).
   * Cleared automatically if a later archive request succeeds.
   */
  protected noteDcApiFallback(): void {
    this.dcApiFallbackNotice =
      'Destiny Chronicle archive is temporarily unavailable. Loading activity history from Bungie API instead — this can take longer than usual.';
    this.cdr.detectChanges();
  }

  /** Clear archive-fallback notice after a successful archive response (or user dismiss). */
  dismissDcApiFallbackNotice(): void {
    this.dcApiFallbackNotice = null;
    this.cdr.detectChanges();
  }

  /**
   * Record a user-visible notice when Bungie D1/D2 endpoints are down or disabled.
   * SystemDisabled (ErrorCode 5) is common for Destiny 1 stats right now.
   */
  protected noteBungieApiIssue(game: 'D1' | 'D2' | 'both', error: unknown): void {
    const notices = resolveBungieApiIssueNotices(game, error);
    if (!notices) return;
    if (notices.d1ApiIssue) this.d1ApiIssue = notices.d1ApiIssue;
    if (notices.d2ApiIssue) this.d2ApiIssue = notices.d2ApiIssue;
    this.apiAvailable = notices.apiAvailable;
    this.cdr.detectChanges();
  }

  get hasD1Players(): boolean {
    return this.selectedPlayers.some(player => this.isD1Player(player));
  }

  get hasD2Players(): boolean {
    return this.selectedPlayers.some(player => !this.isD1Player(player));
  }

  /**
   * Returns the list of platforms that actually produced at least one stored
   * activity for the given game.  Brand-new guardians with zero history are
   * ignored so we don't show empty tabs.
   */
  getPlatforms(game: string): string[] {
    return getPlatformsForGame({
      game,
      perPlatformStats: this.perPlatformStats,
      selectedPlayers: this.selectedPlayers,
      isD1Player: (p) => this.isD1Player(p),
      getPlatformName: (mt) => this.getPlatformName(mt),
    });
  }

  getPlayersByGameAndPlatform(game: string, platform: string): PlayerSearchResult[] {
    return this.selectedPlayers.filter(player => {
      const isGameMatch = (game === 'D1' && this.isD1Player(player)) || 
                         (game === 'D2' && !this.isD1Player(player));
      const isPlatformMatch = this.getPlatformName(player.membershipType) === platform;
      return isGameMatch && isPlatformMatch;
    });
  }

  async selectPlayer(player: PlayerSearchResult) {
    await this.playerSelectLoad.selectPlayer(this.asPlayerSelectLoadHost(), player);
  }

  /**
   * Appends a player to the current dashboard without clearing any existing
   * state.  Internally mirrors the logic used for the "rest" accounts in
   * selectAllPlayersInModal().
   */
  protected async appendPlayer(player: PlayerSearchDisplay) {
    await this.playerSelectLoad.appendPlayer(this.asPlayerSelectLoadHost(), player);
  }

  /** Wipe activity/session state for a replace-mode primary select. */
  protected resetSessionForPrimarySelect(): void {
    resetSessionForPrimarySelectFn(this);
  }

  protected ensureSelectedDate(): void {
    if (this.selectedDate) return;
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const year = today.getFullYear();
    this.selectedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  protected seedFetchingProfileStatuses(
    players: PlayerSearchDisplay[],
    messageSuffix = ''
  ): void {
    this.accountLoadingStatusSvc.seedFetchingProfileStatuses(
      this.asAccountLoadingStatusHost(),
      players,
      messageSuffix
    );
  }

  /** Mark account status error after a per-player sync failure (favorites/permalink). */
  protected markAccountLoadFailed(player: PlayerSearchDisplay): void {
    this.accountLoadingStatusSvc.markAccountLoadFailed(
      this.asAccountLoadingStatusHost(),
      player
    );
  }

  protected addSelectedAccount(player: PlayerSearchResult | PlayerSearchDisplay): void {
    const acc: PlatformAccount = {
      platformType: player.membershipType,
      membershipId: player.membershipId,
      displayName: player.displayName,
      platformGroups: [],
    };
    this.selectedAccounts.add(acc);
  }
  /** Clears memoisation caches and marks the view for check. */
  protected refreshComputedViews(): void {
    this.invalidateMemoCaches();
    this.cdr.markForCheck();
  }

  /**
   * Cancel any ongoing background operations to prevent interference with new searches
   */
  protected cancelBackgroundOperations(): void {
    if (this.updateBatchTimer) {
      clearTimeout(this.updateBatchTimer);
      this.updateBatchTimer = null;
    }
    // Abort in-flight loads that check currentLoadToken
    this.currentLoadToken++;
    this.pendingActivityUpdates = false;
    this.showBackgroundProcessingIndicator = false;
  }

  /**
   * Clear player-specific caches to prevent leftover data
   */
  protected clearPlayerSpecificCaches(): void {
    clearPlayerSpecificCachesUtil({
      selectedPlayers: this.selectedPlayers,
      getPlayerKey: (p) => this.getPlayerKey(p),
      activityCache: this.activityCache,
      characters: this.characters,
      activities: this.activities,
    });
  }

  /** Wipe all memoised getters so newly added players appear immediately. */
  protected invalidateMemoCaches(): void {
    /* no-op — reserved for future memoization */
  }
  async loadCharacterHistory(player: PlayerSearchResult | PlayerSearchDisplay) {
    await this.profileCharacterLoader.loadCharacterHistory(
      this.asProfileCharacterLoadHost(),
      player
    );
  }

  protected async validatePGCRBatch(
    activities: ActivityHistory[],
    character: CharacterWithGame,
    startIdx: number
  ): Promise<ActivityHistory[]> {
    return this.activityPgcrBatch.validateBatch(
      activities,
      character,
      startIdx,
      this.PGCR_BATCH_SIZE,
      (mt) => this.getPlatformName(mt)
    );
  }

  // --- ActivityHistoryLoadHost (CODE_CLEANUP_SPEC) ---

  // reportActivityCountDelta kept on mixin; host uses the ctx overload via wrapper
  reportActivityCountDeltaFromHost(
    ctx: ActivityHistoryLoadAccountCtx,
    game: 'D1' | 'D2',
    membershipType: number,
    delta: number,
    isDone: boolean
  ): void {
    this.reportActivityCountDelta(
      ctx.accountKey,
      ctx.displayName,
      ctx.platform,
      game,
      membershipType,
      delta,
      isDone
    );
  }

  invalidateMembershipActivitiesCache(membershipId: string): void {
    this.activitiesCache.delete(membershipId);
  }

  addOverallActivitiesProcessed(count: number): void {
    this.overallActivitiesProcessed += count;
  }

  clearDcApiFallbackNotice(): void {
    this.dcApiFallbackNotice = null;
  }

  hasDcApiFallbackNotice(): boolean {
    return !!this.dcApiFallbackNotice;
  }

  protected async loadActivityHistoryForCharacter(character: CharacterWithGame): Promise<void> {
    await this.activityHistoryLoader.loadForCharacter(this.asActivityHistoryLoadHost(), character);
  }

  /**
   * Build a user-visible message: "X reports for username platform found. Done!" (or per-player list).
   */
  protected buildReportCountMessage(activities: ActivityHistory[]): string {
    return buildReportCountMessageUtil(
      activities,
      this.selectedPlayers,
      (mt) => this.getPlatformName(mt)
    );
  }

  /** One line for "Total number of reports for X is N": e.g. "splashbear PlayStation" or "splashbear PlayStation, otheruser Xbox". */
  protected getReportSummaryLine(activities: ActivityHistory[]): string {
    return getReportSummaryLineUtil(
      activities,
      this.selectedPlayers,
      (mt) => this.getPlatformName(mt)
    );
  }

  protected async processAndGroupActivities(progressMessage?: string): Promise<void> {
    await this.dateActivityGrouping.processAndGroupActivities(
      this.asDateActivityGroupingHost(),
      progressMessage
    );
  }
  getActivityDurationSeconds(activity: ActivityHistory): number {
    return activityDurationSeconds(activity);
  }

  /**
   * Start background processing for activities
   */
  protected startBackgroundProcessing(activities: any[], manifest: any) {
    if (activities.length === 0) return;

    // Only start background processing for large datasets
    if (activities.length < 100) return;

    
    // Show notification that processing continues in background
    this.showBackgroundProcessingIndicator = true;
  }

  /**
   * Resume processing when user returns to tab
   */

  /**
   * Load and display filtered activities for the selected date.
   * @param forceRefresh - Bypass cache when fetching from DB.
   * @param markAccountsComplete - If true, set account status to 'complete' when done (use false when
   *   called from incremental refresh during sync so the progress modal stays until the full sync finishes).
   */
  public async loadAllFilteredActivities(forceRefresh: boolean = false, markAccountsComplete: boolean = true) {
    await this.filteredActivitiesBrowse.loadAllFilteredActivities(
      this.asFilteredActivitiesBrowseHost(),
      forceRefresh,
      markAccountsComplete
    );
  }

  /**
   * Enrich the provided activities list with character class information using cached/fetched PGCRs.
   * This runs automatically so UI can show class icons without any user action.
   */
  protected async enrichActivitiesWithCharacterClass(activities: ActivityHistory[]): Promise<void> {
    await this.pgcrCharacterClassEnrich.enrichActivitiesWithCharacterClass(
      buildPgcrEnrichHost(this),
      activities
    );
  }

  protected updateActivityDisplay(): void {
    // Force change detection to update the view
    this.cdr.detectChanges();
  }

  getPlatformName(membershipType: number | undefined): string {
    return platformNameFromType(membershipType);
  }

  isD1Player(player: PlayerSearchResult | PlayerSearchDisplay | undefined): boolean {
    return isD1PlayerUtil(player as any);
  }

  getClassName(classType: number): string {
    return classNameFromType(classType);
  }

  formatDate(dateString: string): string {
    return this.timezoneService.formatDate(dateString);
  }

  /** Formats a date that may come from an ActivityHistory (period) or ActivityFirstCompletion (completionDate). */
  formatActivityOrCompletionDate(first: any): string {
    if (!first) return '';
    const raw: string = (first.period || first.completionDate || '') as string;
    return this.timezoneService.formatDateTime(raw);
  }

  /**
   * Gets activities filtered by type and game version with caching.
   * @param activities Array of activities to filter
   * @param game Game version ('D1' or 'D2')
   * @returns Observable of filtered activities
   */
  getFilteredActivities(activities: ActivityHistory[], game: string): Observable<ActivityHistory[]> {
    return getFilteredActivitiesCached({
      activities,
      game,
      selectedActivityType: this.selectedActivityType,
      selectedDate: this.selectedDate,
      cache: this.activityCache,
      cacheDurationMs: this.CACHE_DURATION,
      getActivityType: (ref, mode, isD1) =>
        this.manifest.getActivityType(ref, mode, isD1),
      getActivityName: (ref, isD1) => this.manifest.getActivityName(ref, isD1),
    });
  }

  getObjectKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  // Add cache clearing method
  protected clearCache(): void {
    this.activityCache.clear();
    this.firstEverActivities = {};
    this.firstEverActivity = undefined;
  }

  getKills(activity: ActivityHistory): number | undefined {
    return getActivityKills(activity);
  }

  getDeaths(activity: ActivityHistory): number | undefined {
    return getActivityDeaths(activity);
  }

  getKDRatio(activity: ActivityHistory): string | undefined {
    return getActivityKdRatio(activity);
  }

  getActivityName(activity: ActivityHistory, isD1: boolean): string {
    return resolveActivityDisplayName(activity, isD1, (ref, d1) =>
      this.manifest.getActivityName(ref, d1)
    );
  }

  async calculateAccountStats() {
    await this.accountStatsCalculator.calculateAccountStats(this.asAccountStatsCalculatorHost());
  }

  // Helper method to format duration
  formatDuration(seconds: number): string {
    return formatDurationParts(seconds);
  }

  // Helper method to safely get perType stats
  getPerTypeStats(type: string): { count: number, time: number } {
    return this.accountStats.perType[type] || { count: 0, time: 0 };
  }
  // Helper method to safely get activity count
  getActivityCount(type: string): number {
    return this.getPerTypeStats(type).count;
  }

  // Helper method to safely get activity time
  getActivityTime(type: string): number {
    return this.getPerTypeStats(type).time;
  }
  async onDateSelect(month: string, day: string) {
    await this.dateSelectFlow.onDateSelect(this.asDateSelectFlowHost(), month, day);
  }

  /**
   * Instantly show activities for the newly selected date using cached data
   * This makes date changes feel instantaneous for users with favorites
   */
  async showInstantDateChange(): Promise<void> {
    await this.dateSelectFlow.showInstantDateChange(this.asDateSelectFlowHost());
  }
  /**
   * Filter activities array by the selected date (month/day across all years)
   */
  protected filterActivitiesByDate(activities: ActivityWithMembership[], targetDate: string): ActivityWithMembership[] {
    return filterActivitiesByMonthDay(activities, targetDate);
  }

  /**
   * Format filtered activities for display in the UI
   */
  protected formatActivitiesForDisplay(filteredActivities: { [playerKey: string]: ActivityWithMembership[] }): any[] {
    return flattenAndSortActivitiesByPeriod(filteredActivities);
  }

  protected isActivityOnSelectedDate(activity: ActivityHistory): boolean {
    return isActivityOnMonthDay(activity, this.selectedMonth, this.selectedDay);
  }

  onDateOrTypeChange() {
    this.clearFilteredActivitiesCache();
    this.loadAllFilteredActivities();
  }

  /**
   * Validates and sets the selected date, ensuring it's in the user's local timezone.
   * This method:
   * 1. Converts the input date to local midnight
   * 2. Prevents selection of future dates
   * 3. Maintains the date in the user's local timezone
   */
  protected validateAndSetDate(dateStr: string): void {
    const validated = validateSelectedDateString(dateStr);
    if (!validated) return;
    this.selectedDate = validated.selectedDate;
    this.selectedMonth = validated.selectedMonth;
    this.selectedDay = validated.selectedDay;
    this.selectedYear = validated.selectedYear;
  }

  /**
   * Handles date input changes from the user.
   * This method:
   * 1. Validates the input format (yyyy-MM-dd)
   * 2. Converts the date to local midnight
   * 3. Triggers activity reload with the new date
   */
  onDateInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    
    // Accept only valid yyyy-MM-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // Convert input date to local midnight
      const inputDate = new Date(value);
      inputDate.setHours(0, 0, 0, 0);
      this.validateAndSetDate(inputDate.toISOString().split('T')[0]);
      this.cdr.detectChanges();
    }
  }

  getSortedYears(yearGroups: { [year: string]: any }): string[] {
    return getSortedYearsUtil(yearGroups);
  }

  getSortedTypes(typeGroups: { [type: string]: any }): string[] {
    return getSortedTypesUtil(typeGroups);
  }

  /**
   * Gets the activity type for a given mode number.
   * Uses the ACTIVITY_MODE_MAP to determine the type, falling back to 'Other' if not found.
   * @param mode The activity mode number
   * @returns The corresponding activity type
   */
  getActivityType(mode: number): ActivityMode {
    return ACTIVITY_MODE_MAP[mode] || 'Other';
  }

  onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement)?.value;
    if (value) {
      this.validateAndSetDate(value);
      this.cdr.detectChanges();
    }
  }

  formatTime(dateString: string): string {
    return this.timezoneService.formatTime(dateString);
  }

  formatDateTime(dateString: string): string {
    return this.timezoneService.formatDateTime(dateString);
  }

  onActivityTypeChange(event: Event): void {
    this.cdr.detectChanges();
  }

  /**
   * Searches for Destiny accounts across both D1 and D2.
   */
  async addPlayer() {
    await this.playerSearchFlow.addPlayer(this.asPlayerSearchFlowHost());
  }


  /**
   * Clear all selected players and reset to replace mode
   */
  clearAllPlayers(): void {
    this.playerSelectionClear.clearAllPlayers(this.asPlayerSelectionClearHost());
  }

  removePlayer(index: number) {
    this.playerSelectionClear.removePlayer(
      build_asPlayerSelectionRemoveHost(this),
      index
    );
  }

  /** One date read for the account, then keep the characters the caller asked for. */
  protected async activitiesForCharacters(
    membershipId: string,
    characterIds: string[],
    month: number,
    day: number
  ): Promise<StoredActivity[]> {
    const rows = await this.activityDb.getActivitiesByDateForMembership(membershipId, month, day);
    const wanted = new Set(characterIds);
    return rows.filter(row => wanted.has(row.characterId));
  }

  /**
   * Retrieves all filtered activities for the selected date and players.
   */
  protected async getAllFilteredActivitiesForDate(forceRefresh: boolean = false): Promise<ActivityWithMembership[]> {
    return this.filteredActivitiesForDateSvc.getAllFilteredActivitiesForDate(
      buildFilteredActivitiesForDateHost(this),
      forceRefresh
    );
  }


}
