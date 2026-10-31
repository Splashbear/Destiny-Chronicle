// @ts-nocheck
/** Activities-tab display / collapse / account-filter helpers (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { buildChronologicalRowsForYear } from '../../utils/chronological-activity-rows';
import { getMappedActivityName as getMappedActivityNameUtil } from '../../utils/mapped-activity-name';
import { groupActivitiesByVersion } from '../../utils/activity-version-groups';
import { groupActivitiesByAccount } from '../../utils/activities-by-account';
import { isActivityCompleted as isActivityCompletedUtil } from '../../utils/activity-completed';
import { getOrBuildDisplayedAccountGroupsForGame } from '../../utils/displayed-account-groups-for-game';
import { buildDisplayedAccountGroups as filterDisplayedAccountGroups } from '../../utils/displayed-account-groups';
import { filterBySelectedAccountKeys, toggleInSet } from '../../utils/selection-set';
import { syncAccomplishmentsGameWithPlayers } from '../../utils/sync-accomplishments-game';
import { parseActivityReportClick } from '../../utils/activity-report-click';
import { findDisplayedActivity as findDisplayedActivityUtil } from '../../utils/find-displayed-activity';
import { buildAccountKey } from '../../utils/account-key';
import { resolveActivityPgcrImage } from '../../utils/activity-pgcr-image';
import { buildActivityRowStyle } from '../../utils/activity-row-style';
import {
  classIconUrl,
  platformIdFromName,
} from '../../utils/platform-display';
import {
  resolveCharacterClassForFirst as resolveCharacterClassForFirstUtil,
} from '../../utils/character-class-for-first';
import {
  loadActivityCollapseState as loadActivityCollapseStateFn,
  persistActivityCollapseStateFn,
  loadActivitiesViewPreferencesFn,
  persistActivitiesViewPreferencesFn,
  toggleActivityGameCollapsed as toggleActivityGameCollapsedFn,
  toggleActivityYearCollapsed as toggleActivityYearCollapsedFn,
  setActivitiesViewMode as setActivitiesViewModeFn,
  setActivitiesChronologicalSort as setActivitiesChronologicalSortFn,
  collapseAllActivityYears as collapseAllActivityYearsFn,
  expandAllActivityYears as expandAllActivityYearsFn,
} from './player-search-activities-view';
import { PlayerSearchBreakdownMixin } from './player-search-breakdown-mixin';

export abstract class PlayerSearchActivitiesMixin extends PlayerSearchBreakdownMixin {
  activityYearCollapseKey(game: 'D1' | 'D2', year: string): string {
    return `${game}-${year}`;
  }

  isActivityGameCollapsed(game: 'D1' | 'D2'): boolean {
    return this.collapsedActivityGames.has(game);
  }

  toggleActivityGameCollapsed(game: 'D1' | 'D2'): void {
    toggleActivityGameCollapsedFn(this, game);
  }

  isActivityYearCollapsed(game: 'D1' | 'D2', year: string): boolean {
    return this.collapsedActivityYears.has(this.activityYearCollapseKey(game, year));
  }

  toggleActivityYearCollapsed(game: 'D1' | 'D2', year: string): void {
    toggleActivityYearCollapsedFn(this, game, year);
  }

  protected loadActivityCollapseState(): void {
    loadActivityCollapseStateFn(this);
  }

  protected persistActivityCollapseState(): void {
    persistActivityCollapseStateFn(this);
  }

  protected loadActivitiesViewPreferences(): void {
    loadActivitiesViewPreferencesFn(this);
  }

  protected persistActivitiesViewPreferences(): void {
    persistActivitiesViewPreferencesFn(this);
  }

  setActivitiesViewMode(mode: any): void {
    setActivitiesViewModeFn(this, mode);
  }

  setActivitiesChronologicalSort(sort: any): void {
    setActivitiesChronologicalSortFn(this, sort);
  }

  /** OnPush parent + tab child components need an explicit detectChanges for toolbar toggles. */
  protected refreshActivitiesTabView(): void {
    this.cdr.detectChanges();
  }

  getChronologicalRowsForYear(yearGroup: any, game: 'D1' | 'D2'): any[] {
    const cached = this.chronoRowsCache.get(yearGroup);
    if (cached && cached.sort === this.activitiesChronologicalSort) {
      return cached.rows;
    }
    const rows = buildChronologicalRowsForYear(
      yearGroup.typeGroups ?? [],
      game,
      this.activitiesChronologicalSort,
      {
        getActivityName: (ref, isD1) => this.manifest.getActivityName(ref, isD1),
        getMappedActivityName: (ref) => this.getMappedActivityName(ref),
        getActivityVersion: (name) => this.getActivityVersion(name),
      }
    );
    this.chronoRowsCache.set(yearGroup, { sort: this.activitiesChronologicalSort, rows });
    return rows;
  }

  trackByChronologicalRow(_index: number, row: any): string {
    const inst = row.activity.activityDetails?.instanceId ?? '';
    return `${row.activity.membershipId}|${inst}|${row.activity.period}`;
  }

  protected collectActivityYearKeys(): string[] {
    const keys: string[] = [];
    for (const game of ['D1', 'D2'] as const) {
      for (const group of this.getDisplayedAccountGroupsForGame(game)) {
        for (const yg of group.yearGroups ?? []) {
          keys.push(this.activityYearCollapseKey(game, yg.year));
        }
      }
    }
    return keys;
  }

  collapseAllActivityYears(): void {
    collapseAllActivityYearsFn(this);
  }

  expandAllActivityYears(): void {
    expandAllActivityYearsFn(this);
  }

  protected getMappedActivityName(referenceId: string): string | null {
    return getMappedActivityNameUtil(referenceId);
  }

  getActivityIconUrl(referenceId: number | string, isD1: boolean): string | null {
    const path = this.manifest.getActivityIcon(referenceId, isD1);
    return path ? this.assetUrl.resolve(path) : null;
  }

  getActivityImage(activity: any, isD1: boolean): string | null {
    if (!activity) return null;
    return resolveActivityPgcrImage({
      referenceId: activity.activityDetails?.referenceId,
      isD1,
      getPgcrImage: (ref, d1) => this.manifest.getActivityPgcrImage(ref, d1),
      resolveAssetUrl: (path) => this.assetUrl.resolve(path),
    });
  }

  getActivityTypeAccent(type: string): string {
    return this.activityIconService.getActivityTypeAccent(type);
  }

  getActivityRowStyle(activity: any, isD1: boolean, activityType = 'other'): Record<string, string> {
    return buildActivityRowStyle(
      this.getActivityTypeAccent(activityType),
      this.getActivityImage(activity, isD1)
    );
  }

  getPlatformId(platform: string | undefined): number {
    return platformIdFromName(platform);
  }

  getClassIconUrl(className?: string): string | undefined {
    return classIconUrl(className);
  }

  resolveCharacterClassForFirst(first: any): string | undefined {
    return resolveCharacterClassForFirstUtil(first, {
      selectedPlayers: this.selectedPlayers,
      getPlayerKey: (p) => this.getPlayerKey(p),
      characters: this.characters,
    });
  }

  getClassIconForFirst(first: any): string | undefined {
    return this.getClassIconUrl(this.resolveCharacterClassForFirst(first));
  }

  onHeatmapDateNavigate(date: Date): void {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    this.selectedYear = year;
    this.activeTab = 'activities';
    this.onDateSelect(month.toString(), day.toString());
    this.cdr.detectChanges();
  }

  getAccountGroupsForGame(game: 'D1' | 'D2') {
    return this.groupedActivitiesByAccount.filter((g) => g.game === game);
  }

  getDisplayedAccountGroupsForGame(game: 'D1' | 'D2') {
    return getOrBuildDisplayedAccountGroupsForGame({
      game,
      cache: this.displayedAccountGroups,
      source: this.groupedActivitiesByAccount,
      preset: this.activityFilterPreset,
      selectedAccountKeys: this.selectedAccountKeysForActivities,
      buildGroups: () => this.buildDisplayedAccountGroups(game),
    });
  }

  protected buildDisplayedAccountGroups(game: 'D1' | 'D2') {
    return filterDisplayedAccountGroups(this.getAccountGroupsForGame(game), {
      preset: this.activityFilterPreset,
      accountFilter: this.selectedAccountKeysForActivities.size > 0,
      isAccountSelected: (a) =>
        this.selectedAccountKeysForActivities.has(this.getActivityAccountKey(a)),
      isCompleted: (a) => this.isActivityCompleted(a),
    });
  }

  isActivityCompleted(activity: any): boolean {
    return isActivityCompletedUtil(activity);
  }

  getSeasonForYear(game: 'D1' | 'D2', year: number | string): string | null {
    const y = typeof year === 'string' ? parseInt(year, 10) : year;
    if (Number.isNaN(y)) return null;
    return this.seasonService.getSeasonForDate(game, y, this.selectedMonth, this.selectedDay);
  }

  onAccountSummaryCardToggle(accountKey: string): void {
    this.onSiteAccountCardToggle(accountKey);
  }

  /** Header cards are the one account filter for every tab. */
  onSiteAccountCardToggle(accountKey: string): void {
    const next = toggleInSet(this.selectedAccountKeysForActivities, accountKey);
    this.selectedAccountKeysForActivities = next;
    this.selectedAccountKeysForFirsts = new Set(next);
    this.selectedAccountKeysForAccomplishments = new Set(next);
    this.selectedAccountKeysForBreakdown = new Set(next);

    const selectedGames = this.getBreakdownSelectedGames();
    this.breakdownChartGame =
      selectedGames.length === 1 ? selectedGames[0] : 'all';

    this.accountFilterEpoch += 1;
    this.cdr.markForCheck();
    if (this.selectedPlayers.length > 0 && this.activeTab === 'breakdown') {
      void this.loadActivityBreakdown();
    }
  }

  getActivityAccountKey(row: {
    game?: string;
    membershipId?: string;
    membershipType?: number;
  }): string {
    return this.getAccountKeyForPlayer(row);
  }

  getAccountKeyForPlayer(pl: {
    game?: string;
    membershipId?: string;
    membershipType?: number;
  }): string {
    return buildAccountKey({
      ...pl,
      getPlatformName: (mt) => this.getPlatformName(mt),
    });
  }

  get hasAccountFilterForActivities(): boolean {
    return this.selectedAccountKeysForActivities.size > 0;
  }

  onAccomplishmentsAccountCardToggle(accountKey: string): void {
    this.selectedAccountKeysForAccomplishments = toggleInSet(
      this.selectedAccountKeysForAccomplishments,
      accountKey
    );
    this.cdr.markForCheck();
  }

  getAccomplishmentsFilteredPlayers(): any[] {
    return filterBySelectedAccountKeys(
      this.selectedPlayers,
      this.selectedAccountKeysForAccomplishments,
      (p) => this.getAccountKeyForPlayer(p)
    );
  }

  setActiveAccomplishmentsGame(game: 'D1' | 'D2'): void {
    if (this.activeAccomplishmentsGame !== game) {
      this.activeAccomplishmentsGame = game;
      this.cdr.markForCheck();
    }
  }

  protected syncActiveAccomplishmentsGameWithPlayers(): void {
    const next = syncAccomplishmentsGameWithPlayers(
      (this.selectedPlayers || []).map((p) => ({ isD1: this.isD1Player(p) })),
      this.activeAccomplishmentsGame
    );
    if (next) this.activeAccomplishmentsGame = next;
  }

  onActivityReportClick(event: MouseEvent): void {
    const parsed = parseActivityReportClick(event);
    if (!parsed) return;
    const activity = this.findDisplayedActivity(parsed.instanceId, parsed.isD1);
    if (activity) {
      this.openExternalPGCR(activity, parsed.isD1, event);
    }
  }

  protected findDisplayedActivity(instanceId: string, isD1: boolean): any {
    return findDisplayedActivityUtil(
      this.groupedActivitiesByAccount,
      instanceId,
      isD1
    );
  }

  getVersionGroups(activities: any[]): Array<{ version: string; activities: any[] }> {
    const cached = this.versionGroupsCache.get(activities);
    if (cached) {
      return cached;
    }
    const groups = groupActivitiesByVersion(activities, {
      getActivityName: (ref, isD1) => this.manifest.getActivityName(ref, isD1),
      getMappedActivityName: (ref) => this.getMappedActivityName(ref),
      getActivityVersion: (name) => this.getActivityVersion(name),
    });
    this.versionGroupsCache.set(activities, groups);
    return groups;
  }

  getActivitiesGroupedByAccount(
    activities: any[]
  ): Array<{
    membershipId: string;
    membershipType: number;
    displayName: string;
    platform: string;
    activities: any[];
  }> {
    return groupActivitiesByAccount(activities, (mt) => this.getPlatformName(mt));
  }

  trackByVersionGroup(
    index: number,
    versionGroup: { version: string; activities: any[] }
  ): string {
    return versionGroup.version;
  }
}
