// @ts-nocheck
/** Breakdown-tab UI helpers for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { type ChartData } from 'chart.js';
import { environment } from '../../../environments/environment';
import { ActivityCountRow } from '../../services/activity-breakdown.service';
import {
  buildBreakdownCategoryOptions,
  chartCategoryForSelectedTiles,
  selectBreakdownChartItems,
  tileLabelsForChartCategory,
} from '../../utils/breakdown-chart';
import { buildBreakdownChartDataFromItems, sumBreakdownCardTimeSeconds } from '../../utils/breakdown-chart-data';
import { getBreakdownProfileTotalTimeSeconds as getBreakdownProfileTotalTimeSecondsUtil } from '../../utils/breakdown-profile-time';
import { getBreakdownMembershipIds as getBreakdownMembershipIdsUtil } from '../../utils/breakdown-membership-ids';
import { getBreakdownSelectedGames as getBreakdownSelectedGamesUtil } from '../../utils/breakdown-selected-games';
import { sumBreakdownGroupTotals } from '../../utils/breakdown-group-totals';
import {
  BreakdownGroup,
  breakdownRowFromEvent,
  breakdownRowKey,
  cardLabelFromEvent,
} from '../../utils/breakdown-view';
import { scheduleBreakdownRefresh } from '../../utils/breakdown-refresh-debounce';
import { formatRelativeElapsedSince } from '../../utils/relative-elapsed';
import { toggleInSet } from '../../utils/selection-set';
import { showBreakdownGameDropdown as showBreakdownGameDropdownUtil } from '../../utils/show-breakdown-game-dropdown';
import { PlayerSearchFirstsMixin } from './player-search-firsts-mixin';

export abstract class PlayerSearchBreakdownMixin extends PlayerSearchFirstsMixin {

  /** True when user has selected one or more account cards on the Breakdown tab. */
  get hasBreakdownAccountFilter(): boolean {
    return this.selectedAccountKeysForBreakdown.size > 0;
  }
  /** Whether the Breakdown game dropdown should be shown (hidden when selection is single-game only). */
  get showBreakdownGameDropdown(): boolean {
    return showBreakdownGameDropdownUtil(this.getBreakdownSelectedGames());
  }
  get breakdownChartCategoryOptions(): { value: string; label: string }[] {
    const groups = this.activityBreakdownGroups || [];
    if (this.categoryOptionsCache?.groups === groups) {
      return this.categoryOptionsCache.options;
    }
    const options = buildBreakdownCategoryOptions(groups, this.categoryDisplayNames);
    this.categoryOptionsCache = { groups, options };
    return options;
  }

  /** Chart data input for the template – returns cached value. */
  get breakdownChartData(): ChartData<'pie' | 'bar'> {
    return this.breakdownChartDataState;
  }

  /** Recompute chart data based on current breakdown groups, filters, and chart type. */
  protected recomputeBreakdownChartData(): void {
    const sel = selectBreakdownChartItems(this.filteredActivityBreakdownGroups, {
      tilesSelected: this.selectedBreakdownCardLabels.size > 0,
      category: this.breakdownChartCategory,
      game: this.breakdownChartGame as 'all' | 'D1' | 'D2',
    });
    if (!sel.items.length) {
      this.breakdownChartDataState = { labels: [], datasets: [] };
      return;
    }
    this.breakdownChartDataState = buildBreakdownChartDataFromItems(
      sel.items,
      this.breakdownChartType
    );
  }
  get filteredActivityBreakdownSummaryCards() {
    if (this.selectedBreakdownCardLabels.size === 0) {
      return this.activityBreakdownSummaryCards;
    }
    return this.activityBreakdownSummaryCards.filter(card => 
      this.selectedBreakdownCardLabels.has(card.label)
    );
  }

  /** Toggle chart type and trigger change detection */
  setBreakdownChartType(type: 'pie' | 'bar') {
    this.breakdownChartType = type;
    this.recomputeBreakdownChartData();
    this.cdr.markForCheck();
  }

  /** Set chart category and select the matching tiles. All clears the tile selection. */
  setBreakdownChartCategory(value: string) {
    this.breakdownChartCategory = value;
    const labels = (this.activityBreakdownSummaryCards || []).map(card => card.label);
    this.selectedBreakdownCardLabels = new Set(tileLabelsForChartCategory(labels, value));
    this.recomputeBreakdownChartData();
    this.cdr.markForCheck();
  }

  /** Set chart game filter and trigger change detection */
  setBreakdownChartGame(value: 'all' | 'D1' | 'D2') {
    this.breakdownChartGame = value;
    this.recomputeBreakdownChartData();
    this.cdr.markForCheck();
  }

  /**
   * Total time in seconds for the Activity Breakdown header.
   *
   * - When tiles are selected, this is the sum of the selected cards (so the
   *   number matches exactly what the user filtered to).
   * - When no tiles are selected, this is the sum of all cards – i.e. the
   *   total time for the activities we are showing in the Breakdown grid.
   */
  get activityBreakdownTotalTimeSeconds(): number {
    return sumBreakdownCardTimeSeconds(
      this.activityBreakdownSummaryCards,
      this.selectedBreakdownCardLabels
    );
  }

  /** Total playtime in seconds for the current Breakdown view, from activity stats. */
  protected getBreakdownProfileTotalTimeSeconds(): number {
    return getBreakdownProfileTotalTimeSecondsUtil({
      perPlatformStats: this.perPlatformStats,
      hasBreakdownAccountFilter: this.hasBreakdownAccountFilter,
      selectedAccountKeysForBreakdown: this.selectedAccountKeysForBreakdown,
      accountStats: this.accountStats,
    });
  }

  /** Debug helper: log where Breakdown total time is coming from. */
  protected logBreakdownDebug(context: string): void {
    if (!environment.debug) return;
    try {
      console.log('[BreakdownDebug]', {
        context,
        headerSeconds: this.activityBreakdownTotalTimeSeconds,
        profileSeconds: this.getBreakdownProfileTotalTimeSeconds(),
        accountStatsTotalSeconds:
          this.accountStats?.totalActivityTime ?? this.accountStats?.totalTime ?? 0,
      });
    } catch {
      /* ignore */
    }
  }
  toggleBreakdownLastPlayedSort(): void {
    if (this.breakdownLastPlayedSort === null) {
      this.breakdownLastPlayedSort = 'desc';
    } else if (this.breakdownLastPlayedSort === 'desc') {
      this.breakdownLastPlayedSort = 'asc';
    } else {
      this.breakdownLastPlayedSort = null;
    }
    this.cdr.markForCheck();
  }
  formatBreakdownLastPlayedDate(iso?: string): string {
    if (!iso) return '—';
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '—';
      return this.formatDateTime(iso);
    } catch {
      return '—';
    }
  }
  formatBreakdownElapsedSince(iso?: string): string {
    return formatRelativeElapsedSince(iso, this.locale.intlLocale);
  }

  /** @deprecated Use formatBreakdownLastPlayedDate or formatBreakdownElapsedSince */
  formatBreakdownLastPlayed(iso?: string): string {
    return this.formatBreakdownElapsedSince(iso);
  }
  openBreakdownPgcr(row: ActivityCountRow, event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (!row.lastPlayedInstanceId) return;
    const label = row.variantName ? `${row.baseName}: ${row.variantName}` : row.baseName;
    this.pgcrModalService.openPgcrLite({
      instanceId: row.lastPlayedInstanceId,
      isD1: row.game === 'D1',
      activityLabel: label,
      period: row.lastPlayed,
    });
  }

  /** Toggle selection of an activity breakdown card for filtering */
  toggleBreakdownCardSelection(label: string): void {
    this.selectedBreakdownCardLabels = toggleInSet(this.selectedBreakdownCardLabels, label);
    this.breakdownChartCategory = chartCategoryForSelectedTiles([...this.selectedBreakdownCardLabels]);
    this.recomputeBreakdownChartData();
    this.cdr.markForCheck();
  }

  /** Whether a breakdown card is selected */
  isBreakdownCardSelected(label: string): boolean {
    return this.selectedBreakdownCardLabels.has(label);
  }

  /** Filtered groups for display: when cards are selected, only those; otherwise all */
  get filteredActivityBreakdownGroups(): BreakdownGroup[] {
    this.breakdownView.sync(
      this.activityBreakdownGroups || [],
      this.selectedBreakdownCardLabels,
      this.breakdownLastPlayedSort,
      this.breakdownRetainExpansion
    );
    this.breakdownRetainExpansion = false;
    return this.breakdownView.groups;
  }

  /** Unique platform names across selected players for Breakdown tab (All vs per-account). */
  get breakdownPlatformTabs(): string[] {
    if (!this.selectedPlayers?.length) return [];
    const platforms = this.selectedPlayers.map(p => this.getPlatformName(p.membershipType));
    return Array.from(new Set(platforms));
  }

  /** Membership IDs to load for the current Breakdown view: when account cards are selected, only those; otherwise all. */
  getBreakdownMembershipIds(): string[] {
    return getBreakdownMembershipIdsUtil(
      this.selectedPlayers,
      this.selectedAccountKeysForBreakdown,
      (p) => this.getAccountKeyForPlayer(p)
    );
  }

  /** Toggle account card selection for Breakdown tab; reloads breakdown data. */
  async onBreakdownAccountCardToggle(accountKey: string): Promise<void> {
    this.selectedAccountKeysForBreakdown = toggleInSet(
      this.selectedAccountKeysForBreakdown,
      accountKey
    );

    const selectedGames = this.getBreakdownSelectedGames();
    this.breakdownChartGame =
      selectedGames.length === 1 ? selectedGames[0] : 'all';

    this.cdr.markForCheck();
    if (this.selectedPlayers.length > 0) {
      await this.loadActivityBreakdown();
    }
  }

  /** Games represented by the currently selected Breakdown account cards. Empty = both games allowed. */
  protected getBreakdownSelectedGames(): ('D1' | 'D2')[] {
    return getBreakdownSelectedGamesUtil(
      this.perPlatformStats,
      this.selectedAccountKeysForBreakdown
    );
  }

  /** Summary cards for Activity Breakdown: aggregated stats per category */
  get activityBreakdownSummaryCards() {
    this.breakdownView.sync(
      this.activityBreakdownGroups || [],
      this.selectedBreakdownCardLabels,
      this.breakdownLastPlayedSort,
      this.breakdownRetainExpansion
    );
    this.breakdownRetainExpansion = false;
    return this.breakdownView.cards;
  }
  toggleBreakdownGroup(group: BreakdownGroup): void {
    this.breakdownView.toggle(group);
    this.cdr.markForCheck();
  }
  showMoreBreakdownRows(group: BreakdownGroup): void {
    this.breakdownView.showMore(group);
    this.cdr.markForCheck();
  }
  expandAllBreakdownGroups(): void {
    this.filteredActivityBreakdownGroups;
    this.breakdownView.expandAll();
    this.cdr.detectChanges();
  }
  collapseAllBreakdownGroups(): void {
    this.filteredActivityBreakdownGroups;
    this.breakdownView.collapseAll();
    this.cdr.detectChanges();
  }
  visibleBreakdownRows(group: BreakdownGroup): ActivityCountRow[] {
    return this.breakdownView.visibleRows(group);
  }
  breakdownGroupTotals(group: BreakdownGroup): { runs: number; clears: number; timeSeconds: number } {
    return sumBreakdownGroupTotals(group.rows);
  }
  onBreakdownTilesClick(event: Event): void {
    const label = cardLabelFromEvent(event);
    if (!label) return;
    this.toggleBreakdownCardSelection(label);
  }
  onBreakdownTilesKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const label = cardLabelFromEvent(event);
    if (!label) return;
    event.preventDefault();
    this.toggleBreakdownCardSelection(label);
  }
  onBreakdownRowsClick(group: BreakdownGroup, event: MouseEvent): void {
    const row = breakdownRowFromEvent(event, group.rows);
    if (!row) return;
    this.openBreakdownPgcr(row, event);
  }
  trackBreakdownGroup(_index: number, group: BreakdownGroup): string {
    return `${group.game || ''}|${group.label}`;
  }
  trackBreakdownRow(_index: number, row: ActivityCountRow): string {
    return breakdownRowKey(row);
  }
  trackBreakdownCard(_index: number, card: { label: string }): string {
    return card.label;
  }

  /** History pages can finish after Breakdown is open. Refresh the totals without blanking the tab. */
  protected noteActivitiesStored(): void {
    scheduleBreakdownRefresh({
      getActiveTab: () => this.activeTab,
      selectedPlayersLength: this.selectedPlayers.length,
      currentTimer: this.breakdownRefreshTimer,
      delayMs: this.BATCH_UPDATE_DELAY,
      setDirty: () => {
        this.breakdownDirty = true;
      },
      setTimer: (id) => {
        this.breakdownRefreshTimer = id;
      },
      reload: () => {
        void this.loadActivityBreakdown({ preserveView: true });
      },
    });
  }
}
