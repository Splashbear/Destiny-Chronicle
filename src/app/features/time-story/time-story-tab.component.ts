import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
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
  TIME_STORY_GROUP_COLORS,
  TIME_STORY_GROUP_IDS,
  TIME_STORY_GROUP_LABELS,
  type TimeStoryGroupId,
} from '../../utils/time-story-groups';

export interface TimeStoryAccountChip {
  platform: string;
  game: 'D1' | 'D2';
}

interface TimeStoryTooltip {
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
export class TimeStoryTabComponent implements OnChanges, OnDestroy {
  @Input() scopes: BreakdownMembershipScope[] = [];
  @Input() identityByMembership: Record<string, string> = {};
  @Input() accounts: TimeStoryAccountChip[] = [];
  @Input() effectiveGame: 'D1' | 'D2' | 'Both' = 'Both';
  @Input() hasSelectedPlayers = false;
  /** Changes when more activities land in IndexedDB so the chart can refresh mid-load. */
  @Input() dataRevision: string | number = '';
  @Input() syncInProgress = false;
  @Output() openGroup = new EventEmitter<{ group: TimeStoryGroupId; year: number }>();

  loading = false;
  result: TimeStoryByYearResult | null = null;
  tooltip: TimeStoryTooltip | null = null;
  readonly groupIds = TIME_STORY_GROUP_IDS;
  readonly labels = TIME_STORY_GROUP_LABELS;
  readonly colors = TIME_STORY_GROUP_COLORS;
  readonly formatTime = formatSecondsToHoursMinutes;
  readonly share = groupSharePercent;

  private loadGen = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;


  constructor(
    private timeStory: TimeStoryService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (
      changes['scopes'] ||
      changes['identityByMembership'] ||
      changes['effectiveGame'] ||
      changes['dataRevision']
    ) {
      await this.reload();
    }
    this.syncPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
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

  showTip(bar: TimeStoryYearBar, group: TimeStoryGroupId, seconds: number, games: number): void {
    this.tooltip = {
      year: bar.year,
      group,
      seconds,
      games,
      percent: groupSharePercent(seconds, bar.seconds),
    };
    this.cdr.markForCheck();
  }

  hideTip(): void {
    this.tooltip = null;
    this.cdr.markForCheck();
  }

  onSegmentActivate(bar: TimeStoryYearBar, group: TimeStoryGroupId): void {
    this.openGroup.emit({ group, year: bar.year });
  }

  private syncPolling(): void {
    const shouldPoll = this.hasSelectedPlayers && (this.syncInProgress || !this.result?.years.length);
    if (shouldPoll && !this.pollTimer) {
      this.pollTimer = setInterval(() => {
        void this.reload();
      }, 3000);
    }
    if (!shouldPoll) this.stopPolling();
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async reload(): Promise<void> {
    const gen = ++this.loadGen;
    if (!this.hasSelectedPlayers || this.scopes.length === 0) {
      this.result = null;
      this.loading = false;
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
      this.syncPolling();
    } catch (err) {
      if (gen !== this.loadGen) return;
      console.error('Time story year bars failed', err);
      this.result = { years: [], totalSeconds: 0, totalGames: 0 };
    } finally {
      if (gen === this.loadGen) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
}
