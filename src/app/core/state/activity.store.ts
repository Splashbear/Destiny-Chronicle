import { Injectable, computed, signal } from '@angular/core';

/** Per-account row for profile cards (structurally matches AccountCardPlatformStats). */
export interface ActivityPlatformStat {
  accountKey: string;
  platform: string;
  totalTime: number;
  totalActivities: number;
  totalSeals: number;
  game: 'D1' | 'D2';
  emblemBackground?: string;
  emblemIcon?: string;
  displayName?: string;
  className?: string;
  lightLevel?: number;
}

export interface ActivityAggregates {
  /** Count of loaded activities (IDB summaries). */
  totalActivities: number;
  /** Sum of activity durations — excludes orbit / Tower / social. */
  timeInLoadedActivities: number;
  /** Bungie character minutesPlayed (seconds) — includes orbit. */
  timeFromBungie: number;
  totalSeals: number;
  perType: { [type: string]: { count: number; time: number } };
}

export interface ActivityStatsSnapshot {
  totalTime: number;
  totalActivityTime: number;
  bungieTotalTime: number;
  totalActivityCount: number;
  totalSeals: number;
  perType: { [type: string]: { count: number; time: number } };
}

const EMPTY_AGGREGATES: ActivityAggregates = {
  totalActivities: 0,
  timeInLoadedActivities: 0,
  timeFromBungie: 0,
  totalSeals: 0,
  perType: {}
};

/**
 * CODE_CLEANUP_SPEC Step 3 — single source for Account Summary / profile card / Breakdown
 * activity count and time displays.
 */
@Injectable({ providedIn: 'root' })
export class ActivityStore {
  private readonly _aggregates = signal<ActivityAggregates>({ ...EMPTY_AGGREGATES });
  private readonly _perPlatform = signal<ActivityPlatformStat[]>([]);
  private readonly _loadingStats = signal(false);
  private readonly _profileLoadInProgress = signal(false);
  private readonly _selectedPlayerCount = signal(0);

  readonly aggregates = this._aggregates.asReadonly();
  readonly perPlatformStats = this._perPlatform.asReadonly();
  readonly loadingStats = this._loadingStats.asReadonly();
  readonly profileLoadInProgress = this._profileLoadInProgress.asReadonly();
  readonly selectedPlayerCount = this._selectedPlayerCount.asReadonly();

  readonly totalActivities = computed(() => this._aggregates().totalActivities);
  readonly timeInLoadedActivities = computed(() => this._aggregates().timeInLoadedActivities);
  readonly timeFromBungie = computed(() => this._aggregates().timeFromBungie);
  readonly totalSeals = computed(() => this._aggregates().totalSeals);

  /**
   * While true, UI must show `—` for count/time — never a misleading 0.
   * Matches former PlayerSearchComponent.accountStatsPending.
   */
  readonly statsPending = computed(() => {
    if (this._loadingStats()) return true;
    if (this._selectedPlayerCount() === 0) return false;
    return this._profileLoadInProgress() && this._aggregates().totalActivities === 0;
  });

  /** null while pending — templates render as `—`. */
  readonly totalActivitiesDisplay = computed(() =>
    this.statsPending() ? null : this._aggregates().totalActivities
  );

  /** null while pending — templates render as `—`. */
  readonly timeInLoadedActivitiesDisplay = computed(() =>
    this.statsPending() ? null : this._aggregates().timeInLoadedActivities
  );

  /** Shape consumed by Account Summary / regression snapshot helpers. */
  readonly accountStatsSnapshot = computed((): ActivityStatsSnapshot => {
    const a = this._aggregates();
    return {
      totalTime: a.timeInLoadedActivities,
      totalActivityTime: a.timeInLoadedActivities,
      bungieTotalTime: a.timeFromBungie,
      totalActivityCount: a.totalActivities,
      totalSeals: a.totalSeals,
      perType: a.perType
    };
  });

  setSelectedPlayerCount(n: number): void {
    this._selectedPlayerCount.set(Math.max(0, n));
  }

  setProfileLoadInProgress(v: boolean): void {
    this._profileLoadInProgress.set(!!v);
  }

  setLoadingStats(v: boolean): void {
    this._loadingStats.set(!!v);
  }

  setAggregates(partial: Partial<ActivityAggregates>): void {
    this._aggregates.update((prev) => ({
      ...prev,
      ...partial,
      perType: partial.perType ? { ...partial.perType } : prev.perType
    }));
  }

  setPerPlatformStats(rows: ActivityPlatformStat[]): void {
    this._perPlatform.set(rows ? [...rows] : []);
  }

  /**
   * Push a full Account Summary payload (same fields player-search historically assigned).
   */
  setFromAccountStats(
    stats: {
      totalTime?: number;
      totalActivityTime?: number;
      bungieTotalTime?: number;
      totalActivityCount?: number;
      totalSeals?: number;
      perType?: { [type: string]: { count: number; time: number } };
    },
    perPlatform: ActivityPlatformStat[] = []
  ): void {
    const timeInLoaded = stats.totalActivityTime ?? stats.totalTime ?? 0;
    this._aggregates.set({
      totalActivities: stats.totalActivityCount ?? 0,
      timeInLoadedActivities: timeInLoaded,
      timeFromBungie: stats.bungieTotalTime ?? 0,
      totalSeals: stats.totalSeals ?? 0,
      perType: stats.perType ? { ...stats.perType } : {}
    });
    this.setPerPlatformStats(perPlatform);
  }

  /** Clear totals (new search / clear all). Leaves selection count to the caller. */
  resetAggregates(): void {
    this._aggregates.set({ ...EMPTY_AGGREGATES, perType: {} });
    this._perPlatform.set([]);
  }

  reset(): void {
    this.resetAggregates();
    this._loadingStats.set(false);
    this._profileLoadInProgress.set(false);
    this._selectedPlayerCount.set(0);
  }
}
