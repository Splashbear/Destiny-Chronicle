import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { DestinyLoaderComponent } from '../../components/destiny-loader/destiny-loader.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { BreakdownMembershipScope } from '../../services/activity-breakdown.service';
import { TimeStoryService } from '../../services/time-story.service';
import { formatSecondsToHoursMinutes } from '../../utils/format-duration';
import { groupSharePercent, type TimeStoryByYearResult, type TimeStoryYearBar } from '../../utils/time-story-by-year';
import {
  TIME_STORY_RESULTS_PAGE_SIZE,
  formatTimeStoryResultDate,
  formatTimeStoryResultTime,
  pageTimeStoryYearGroupResults,
  type TimeStoryYearGroupPage,
  type TimeStoryYearGroupResults,
} from '../../utils/time-story-year-group-results';
import {
  TIME_STORY_GROUP_COLORS,
  TIME_STORY_GROUP_IDS,
  TIME_STORY_GROUP_LABELS,
  type TimeStoryGroupId,
} from '../../utils/time-story-groups';
import {
  TIME_STORY_CHART_ARIA_LABEL,
  TIME_STORY_DETAIL_PROMPT,
  TIME_STORY_LABEL,
  TIME_STORY_LABEL_TOOLTIP,
  TIME_STORY_MEASUREMENT_NOTE,
  TIME_STORY_TITLE,
  TIME_STORY_VIEW_ACTIVITIES,
  TIME_STORY_BACK_TO_HOURS,
  TIME_STORY_RESULTS_EMPTY,
} from '../../utils/time-story-copy';

export interface TimeStoryAccountChip {
  platform: string;
  game: 'D1' | 'D2';
}

interface TimeStorySelection {
  year: number;
  group: TimeStoryGroupId;
  seconds: number;
  games: number;
  percent: number;
}

@Component({
  selector: 'app-time-story-tab',
  standalone: true,
  imports: [CommonModule, DestinyLoaderComponent, EmptyStateComponent],
  templateUrl: './time-story-tab.component.html',
  styleUrls: [
    '../../components/player-search/player-search-tab-shared.scss',
    './time-story-tab.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeStoryTabComponent implements OnChanges {
  @Input() scopes: BreakdownMembershipScope[] = [];
  @Input() identityByMembership: Record<string, string> = {};
  @Input() accounts: TimeStoryAccountChip[] = [];
  @Input() effectiveGame: 'D1' | 'D2' | 'Both' = 'Both';
  @Input() hasSelectedPlayers = false;
  /** When true, history is still writing; wait and compute once after it finishes. */
  @Input() syncInProgress = false;
  @Output() openGroup = new EventEmitter<{ group: TimeStoryGroupId; year: number }>();

  loading = false;
  result: TimeStoryByYearResult | null = null;
  selection: TimeStorySelection | null = null;
  readonly groupIds = TIME_STORY_GROUP_IDS;
  readonly labels = TIME_STORY_GROUP_LABELS;
  readonly colors = TIME_STORY_GROUP_COLORS;
  readonly formatTime = formatSecondsToHoursMinutes;
  readonly share = groupSharePercent;
  readonly titleText = TIME_STORY_TITLE;
  readonly labelText = TIME_STORY_LABEL;
  readonly labelTooltip = TIME_STORY_LABEL_TOOLTIP;
  readonly measurementNote = TIME_STORY_MEASUREMENT_NOTE;
  readonly chartAriaLabel = TIME_STORY_CHART_ARIA_LABEL;
  readonly detailPrompt = TIME_STORY_DETAIL_PROMPT;
  readonly viewActivitiesLabel = TIME_STORY_VIEW_ACTIVITIES;
  readonly backToHoursLabel = TIME_STORY_BACK_TO_HOURS;
  readonly resultsEmptyText = TIME_STORY_RESULTS_EMPTY;
  readonly formatTimeStoryResultDate = formatTimeStoryResultDate;
  readonly formatTimeStoryResultTime = formatTimeStoryResultTime;
  readonly resultsPageSize = TIME_STORY_RESULTS_PAGE_SIZE;

  results: TimeStoryYearGroupResults | null = null;
  resultsPage: TimeStoryYearGroupPage | null = null;
  resultsLoading = false;
  private resultsLoadGen = 0;

  private loadGen = 0;
  private reloadInFlight = false;
  private lastScopeKey = '';
  private lastIdentityKey = '';
  private lastGame: 'D1' | 'D2' | 'Both' | '' = '';

  constructor(
    private timeStory: TimeStoryService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.hasSelectedPlayers || this.scopes.length === 0) {
      this.result = null;
      this.selection = null;
      this.clearResultsView();
      this.loading = false;
      this.lastScopeKey = '';
      this.lastIdentityKey = '';
      this.lastGame = '';
      this.cdr.markForCheck();
      return;
    }

    const scopeKey = this.scopes
      .map(s => `${s.game}:${s.membershipId}`)
      .sort()
      .join(',');
    const identityKey = Object.entries(this.identityByMembership || {})
      .map(([id, ident]) => `${id}=${ident}`)
      .sort()
      .join(',');
    const scopesChanged = scopeKey !== this.lastScopeKey;
    const identityChanged = identityKey !== this.lastIdentityKey;
    const gameChanged = this.effectiveGame !== this.lastGame;

    const syncJustFinished =
      !!changes['syncInProgress'] &&
      this.syncInProgress === false &&
      changes['syncInProgress'].previousValue === true;

    if (this.syncInProgress) {
      if (!this.result?.years.length) {
        this.loading = true;
        this.cdr.markForCheck();
      }
      return;
    }

    if (scopesChanged || identityChanged || gameChanged) {
      this.clearResultsView();
    }

    if (syncJustFinished || scopesChanged || identityChanged || gameChanged || !this.result) {
      this.lastScopeKey = scopeKey;
      this.lastIdentityKey = identityKey;
      this.lastGame = this.effectiveGame;
      // Same keys: do not stack another full year-bar pass while one is already running.
      if (this.reloadInFlight && !scopesChanged && !identityChanged && !gameChanged) {
        return;
      }
      await this.reload();
    }
  }

  get maxYearSeconds(): number {
    const years = this.result?.years || [];
    return years.reduce((max, bar) => Math.max(max, bar.seconds), 0) || 1;
  }

  get gameCaption(): string {
    if (this.effectiveGame === 'Both') return 'D1 and D2 combined';
    return this.effectiveGame;
  }

  barHeightPercent(bar: TimeStoryYearBar): number {
    return (bar.seconds / this.maxYearSeconds) * 100;
  }

  segmentLabel(bar: TimeStoryYearBar, group: TimeStoryGroupId, seconds: number, games: number): string {
    const hours = formatSecondsToHoursMinutes(seconds);
    const pct = groupSharePercent(seconds, bar.seconds).toFixed(1);
    return `${bar.year} ${TIME_STORY_GROUP_LABELS[group]}: ${hours}, ${pct}%, ${games} ${games === 1 ? 'game' : 'games'}`;
  }

  selectSegment(bar: TimeStoryYearBar, group: TimeStoryGroupId, seconds: number, games: number): void {
    this.selection = {
      year: bar.year,
      group,
      seconds,
      games,
      percent: groupSharePercent(seconds, bar.seconds),
    };
    this.cdr.markForCheck();
  }

  /** Hover/focus leave must not collapse the details panel or clear the selection. */
  onSegmentLeave(): void {
    // Intentionally keep selection so the reserved card does not shift layout.
  }

  isSelected(bar: TimeStoryYearBar, group: TimeStoryGroupId): boolean {
    return this.selection?.year === bar.year && this.selection?.group === group;
  }

  async viewSelectedActivities(): Promise<void> {
    if (!this.selection) return;
    // Parent clears leftover Activities-tab filters; results stay in Hours.
    this.openGroup.emit({ group: this.selection.group, year: this.selection.year });
    const gen = ++this.resultsLoadGen;
    this.resultsLoading = true;
    this.cdr.markForCheck();
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const results = await this.timeStory.getYearGroupResults(
        this.scopes,
        this.identityByMembership,
        this.selection.year,
        this.selection.group,
        timeZone,
        this.selection.games
      );
      if (gen !== this.resultsLoadGen) return;
      this.results = results;
      this.setResultsPage(1);
    } catch (err) {
      if (gen !== this.resultsLoadGen) return;
      console.error('Time story year-group results failed', err);
      this.results = null;
      this.resultsPage = null;
    } finally {
      if (gen === this.resultsLoadGen) {
        this.resultsLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  clearResultsView(): void {
    this.resultsLoadGen += 1;
    this.results = null;
    this.resultsPage = null;
    this.resultsLoading = false;
    this.cdr.markForCheck();
  }

  setResultsPage(page: number): void {
    if (!this.results) {
      this.resultsPage = null;
      return;
    }
    this.resultsPage = pageTimeStoryYearGroupResults(
      this.results.rows,
      page,
      this.resultsPageSize
    );
    this.cdr.markForCheck();
  }

  activityNameForRow(row: { game?: 'D1' | 'D2'; activityHash?: string | number }): string {
    return this.timeStory.activityNameForSource(row.game, row.activityHash);
  }

  resultsScopeCaption(): string {
    if (this.accounts.length) {
      return this.accounts.map(acct => `${acct.platform} · ${acct.game}`).join(', ');
    }
    return this.gameCaption;
  }

  resultsCountNote(): string | null {
    if (!this.results || this.results.countMatchesChart) return null;
    const list = this.results.totalGames;
    const chart = this.results.chartGames;
    return `This list has ${list.toLocaleString()} ${list === 1 ? 'game' : 'games'}. The chart showed ${chart?.toLocaleString()} for this selection.`;
  }

  private async reload(): Promise<void> {
    const gen = ++this.loadGen;
    this.reloadInFlight = true;
    if (!this.hasSelectedPlayers || this.scopes.length === 0) {
      this.result = null;
      this.selection = null;
      this.clearResultsView();
      this.loading = false;
      this.reloadInFlight = false;
      this.cdr.markForCheck();
      return;
    }
    const showSpinner = !this.result?.years.length;
    this.loading = showSpinner;
    this.cdr.markForCheck();
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await this.timeStory.getYearBars(this.scopes, this.identityByMembership, timeZone);
      if (gen !== this.loadGen) return;
      this.result = result;
      this.syncSelectionToResult(result);
    } catch (err) {
      if (gen !== this.loadGen) return;
      console.error('Time story year bars failed', err);
      this.result = { years: [], totalSeconds: 0, totalGames: 0 };
      this.selection = null;
    } finally {
      if (gen === this.loadGen) {
        this.loading = false;
        this.reloadInFlight = false;
        this.cdr.markForCheck();
      }
    }
  }

  private syncSelectionToResult(result: TimeStoryByYearResult): void {
    if (!result.years.length) {
      this.selection = null;
      return;
    }
    if (this.selection) {
      const year = result.years.find(bar => bar.year === this.selection!.year);
      const part = year?.groups.find(group => group.group === this.selection!.group);
      if (year && part) {
        this.selection = {
          year: year.year,
          group: part.group,
          seconds: part.seconds,
          games: part.games,
          percent: groupSharePercent(part.seconds, year.seconds),
        };
        return;
      }
    }
    this.selection = this.defaultSelection(result);
  }

  private defaultSelection(result: TimeStoryByYearResult): TimeStorySelection | null {
    const year = result.years[0];
    if (!year?.groups.length) return null;
    const part = year.groups.reduce((best, group) => (group.seconds > best.seconds ? group : best), year.groups[0]);
    return {
      year: year.year,
      group: part.group,
      seconds: part.seconds,
      games: part.games,
      percent: groupSharePercent(part.seconds, year.seconds),
    };
  }
}
