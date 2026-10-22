// @ts-nocheck
/** Field state for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { type ChartConfiguration, type ChartData, type ChartType } from 'chart.js';
import { TextViewService } from '../../services/text-view.service';
import { environment } from '../../../environments/environment';
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption } from '../../models/activity-types';
import { ActivityHistory } from '../../models/activity-history.model';
import { ActivityWithMembership } from '../../models/activity-with-membership.model';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';
import { ActivityFirstCompletion } from '../../models/guardian-firsts.model';
import { FavoriteAccount } from '../../services/activity-db.service';
import { LoadingProgress } from '../../models/loading-progress.model';
import { AccountStats } from '../../services/stats.service';
import { ActivityCountRow } from '../../services/activity-breakdown.service';
import { AnniversaryFirst } from '../anniversary-celebration-banner/anniversary-celebration-banner.component';
import { PlayedWithAccountChoice } from '../../utils/played-with-accounts';
import { HeatmapCharacterLookup } from '../../utils/heatmap-filters';
import {
  type ActivitiesViewMode,
  type ActivitiesChronologicalSort,
} from '../../utils/activities-view-prefs';
import { BREAKDOWN_CATEGORY_DISPLAY_NAMES, buildBreakdownPieChartOptions, buildBreakdownBarChartOptions } from '../../utils/breakdown-chart';
import { AccountLoadingStatus } from '../../models/account-loading-status.model';
import { BreakdownView } from '../../utils/breakdown-view';
import { createConcurrencyLimiter } from '../../utils/concurrency-limit';
import {
  getPlayerKey as getPlayerKeyUtil,
  getFavoriteKey as getFavoriteKeyUtil,
} from '../../utils/player-keys';

interface ActivityCache {
  activities: ActivityHistory[];
  timestamp: number;
  type: string;
  game: string;
}

/**
 * Owns search-page instance fields so the component class stays orchestration-focused.
 */
export abstract class PlayerSearchState {
  d1XboxSearchTerm: string = '';
  d1PsnSearchTerm: string = '';
  d2SearchTerm: string = '';
  selectedMonth: number = new Date().getMonth() + 1;
  selectedDay: number = new Date().getDate();
  selectedYear?: number;
  selectedDate: string = '';
  currentMonth: number = new Date().getMonth() + 1;
  currentDay: number = new Date().getDate();
  selectedPlayers: PlayerSearchDisplay[] = [];
  protected heatmapIdCacheKey = '';
  protected heatmapIdCache: string[] = [];
  protected playedWithAccountCacheKey = '';
  protected playedWithAccountCache: PlayedWithAccountChoice[] = [];
  protected heatmapClassCacheKey = '';
  protected heatmapClassCache: Record<string, HeatmapCharacterLookup> = {};
  selectedCharacterIds: { [key: string]: string | undefined } = {};
  characters: { [key: string]: any[] } = {};
  activities: { [key: string]: ActivityHistory[] } = {};
  loading: { [key: string]: boolean } = {};
  error: { [key: string]: string } = {};
  selectedActivityType: ActivityTypeOption = ACTIVITY_TYPE_OPTIONS[0];
  searchUsername = '';
  searchChips: string[] = [];
  errorMessage = '';
  bungieUnavailable = false;
  platforms = [
    { label: 'Xbox', value: 'Xbox' },
    { label: 'PlayStation', value: 'PlayStation' },
    { label: 'Steam', value: 'Steam' },
    { label: 'Cross Save', value: 'Cross Save' },
  ];
  activityTypeOptions = ACTIVITY_TYPE_OPTIONS;
  d2SearchResults: PlayerSearchDisplay[] = [];
  d1SearchResults: PlayerSearchDisplay[] = [];
  showPlatformPicker: boolean = false;
  crossSavePlayer: PlayerSearchDisplay | null = null;
  loadingActivities: { [key: string]: boolean } = {};
  groupedActivitiesByAccount: any[] = [];
  protected displayedAccountGroups = new Map<'D1' | 'D2', { source: any[]; preset: string; accounts: string; groups: any[] }>();
  protected processedActivities: any[] = [];
  loadingProgress: LoadingProgress | null = null;
  /** True when user returns to tab after it was hidden during loading; show explanatory message. */
  showBackgroundLoadingTip = false;
  /** Page Visibility: we were loading when the tab went hidden (so we can show tip on return). */
  protected wasLoadingWhileTabHidden = false;
  protected visibilityChangeHandler = () => this.onVisibilityChange();
  /** Running total of activity reports fetched per account (accountKey -> count). Updated as API returns pages; "Done!" when account fetch completes. */
  protected activityCountByAccount = new Map<string, number>();
  protected readonly BATCH_SIZE = 50;
  protected activityCache: Map<string, ActivityCache> = new Map();
  protected filteredActivitiesCache: Map<string, { list: ActivityWithMembership[]; dirty: boolean }> = new Map();
  protected readonly CACHE_DURATION = 5 * 60 * 1000;
  protected filteredActivities$ = new BehaviorSubject<ActivityHistory[]>([]);
  protected searchTerm$ = new Subject<string>();
  /** Emits when account stats need to be recomputed; debounced in constructor */
  protected statsDebounce$ = new Subject<void>();
  loadingAccountStats = false;
  accountStats: {
    /** Primary display: sum of activity durations (excludes orbit/social). */
    totalTime: number;
    totalActivityTime: number;
    /** Bungie character minutesPlayed (includes orbit/Tower/social). */
    bungieTotalTime: number;
    totalActivityCount: number;
    totalSeals?: number;
    perType: { [type: string]: { count: number, time: number } };
  } = {
    totalTime: 0,
    totalActivityTime: 0,
    bungieTotalTime: 0,
    totalActivityCount: 0,
    totalSeals: 0,
    perType: {}
  };
  
  // New computed stats using StatsService
  computedAccountStats: AccountStats | null = null;
  filteredActivitiesForDate: ActivityWithMembership[] = [];
  protected currentLoadToken = 0;
  /** Incrementing token for stats calculations to avoid stale calls resetting the spinner late. */
  protected statsCalcToken = 0;
  protected readonly PGCR_BATCH_SIZE = 30;
  protected readonly VALIDATION_DELAY = 50;

  // Progressive loading properties
  protected updateBatchTimer: any = null;
  protected pendingActivityUpdates = false;
  protected readonly BATCH_UPDATE_DELAY = 500; // 500ms batching
  
  // Smart caching for performance
  protected lastProcessedActivitiesHash = '';
  protected lastGroupedActivities: any[] = [];
  showBackgroundProcessingIndicator = false;

  /** Offline archive export/import UI */
  archiveExporting = false;
  archiveProgressMessage = '';
  archiveProgressPercent = 0;
  showArchiveBackupOptions = false;
  showOfflineDeviceReady = false;
  dismissOfflineDeviceReady = false;
  guardianFirsts: ActivityFirstCompletion[] = [];
  loadingGuardianFirsts = false;
  readonly guardianGames: ('D1' | 'D2')[] = ['D1', 'D2'];
  favoriteAccounts: FavoriteAccount[] = [];
  apiAvailable: boolean = true;
  /** User-visible notice when Destiny 1 Bungie endpoints are down or disabled. */
  d1ApiIssue: string | null = null;
  /** User-visible notice when Destiny 2 Bungie endpoints are down or disabled. */
  d2ApiIssue: string | null = null;
  /**
   * Shown only when Chronicle archive API was attempted and hard-failed,
   * so the session falls back to slower live Bungie history calls.
   * Not set for expected archive misses (404 / no rows) or intentional delta-fill.
   */
  dcApiFallbackNotice: string | null = null;
  /**
   * Worst coverage level across accounts loaded so far.
   * `through` and `instanceId` come from the archive watermark once, not from each account's newest row.
   */
  archiveCoverage: { level: 'full' | 'partial' | 'absent'; through: string; instanceId: string } | null = null;
  protected archiveWatermarkRequested = false;
  readonly textView = inject(TextViewService);
  /** Offer to load saved favorites without blocking a fresh search. */
  showFavoritesLoadPrompt = false;
  /** True while favorites (or any multi-profile sync) is still running. */
  profileLoadInProgress = false;
  dbReady: boolean = false;
  activeTab: 'activities' | 'firsts' | 'titles' | 'accomplishments' | 'breakdown' | 'heatmap' | 'playedWith' = 'activities';
  readonly enablePlayedWith = environment.enablePlayedWith;
  
  // Anniversary celebration banner state
  anniversaryFirsts: AnniversaryFirst[] = [];
  showAnniversaryBanner: boolean = false;
  shareMemoryOpen = false;
  shareMemoryItem: AnniversaryFirst | null = null;
  shareMemoryFlavor = '';
  protected dismissedAnniversaries = new Set<string>();
  activeFirstsTab: string = 'all';
  /** Activity filter preset for Activities tab */
  activityFilterPreset: 'all' | 'clears' | 'fails' | 'raids-dungeons' = 'all';
  readonly activityFilterOptions: { id: 'all' | 'clears' | 'fails' | 'raids-dungeons'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'clears', label: 'Clears only' },
    { id: 'fails', label: 'Fails only' },
    { id: 'raids-dungeons', label: 'Raids & Dungeons' },
  ];
  /** Whether to hide the "How to get started" banner (persisted in localStorage) */
  hideGetStartedBanner = false;
  /**
   * When profiles are loaded, the search card collapses to a compact chip strip.
   * Tap "Edit search" to expand again.
   */
  searchPanelExpanded = true;
  /** Activity breakdown: counts per specific activity (e.g. per raid, per playlist). */
  activityBreakdownRows: ActivityCountRow[] | null = null;
  loadingActivityBreakdown = false;
  activityBreakdownGroups: { type: string; label: string; game?: 'D1' | 'D2'; rows: ActivityCountRow[] }[] = [];
  /** Selected activity card labels for filtering; empty = show all */
  selectedBreakdownCardLabels = new Set<string>();
  /** Whether the tile selection area is collapsed */
  breakdownTilesCollapsed = false;
  /** Whether the chart section is collapsed */
  breakdownChartCollapsed = false;
  /** Collapsed Destiny game panels on Activities tab (D1 / D2). */
  collapsedActivityGames = new Set<'D1' | 'D2'>();
  /** Collapsed year sections: keys like "D2-2024". */
  collapsedActivityYears = new Set<string>();
  /** Activities tab: grouped cards vs flat chronological list per year. */
  activitiesViewMode: ActivitiesViewMode = 'cards';
  /** Sort order for chronological view within each year section. */
  activitiesChronologicalSort: ActivitiesChronologicalSort = 'oldest';
  /** Activity Breakdown: sort direction for Last played column. */
  breakdownLastPlayedSort: 'asc' | 'desc' | null = null;
  /** 'all' = aggregated across all accounts; otherwise platform name (e.g. 'Xbox') for per-account view */
  activeBreakdownTab = 'all';
  /** Chart category: 'all' = by activity type, or category name (e.g. 'Raid', 'Dungeon') for drill-down by activity name */
  breakdownChartCategory = 'all';
  /** Chart game filter: 'all' = D1+D2, 'D1' or 'D2' to limit */
  breakdownChartGame = 'all';

  // Chart configuration for Activity Breakdown
  breakdownChartType: ChartType = 'pie';
  /** Cached chart data to avoid recomputing on every change-detection tick. */
  protected breakdownChartDataState: ChartData<'pie' | 'bar'> = { labels: [], datasets: [] };
  breakdownChartOptions: ChartConfiguration['options'] = buildBreakdownPieChartOptions();
  breakdownBarChartOptions: ChartConfiguration['options'] = buildBreakdownBarChartOptions();

  /** Display names for chart category dropdown (combines service groupings: Gambit, Nightfall, PvP, Seasonal Arenas, etc.) */
  protected readonly categoryDisplayNames: Record<string, string> =
    BREAKDOWN_CATEGORY_DISPLAY_NAMES;
  /** Category options: All, or each unique category (Raid, Dungeon, Strike, etc.).
   *  Built from ALL groups (not tile-filtered) so selecting a tile does not shrink the list. */
  protected categoryOptionsCache: { groups: unknown; options: { value: string; label: string }[] } | null = null;

  /** Game filter options */
  readonly breakdownChartGameOptions: { value: 'all' | 'D1' | 'D2'; label: string }[] = [
    { value: 'all', label: 'All (D1 + D2)' },
    { value: 'D1', label: 'Destiny 1' },
    { value: 'D2', label: 'Destiny 2' }
  ];
  platformTabs: string[] = [];
  playerTitles: { [key: string]: any } = {};
  loadingTitles: { [key: string]: boolean } = {};
  /** Combined list of titles across all selected players (built after fetching). */
  aggregatedTitles: any[] = [];
  /** Per-platform aggregated stats (time, activities, seals) for account summary cards. */
  perPlatformStats: PlatformStats[] = [];
  /** When non-empty, Activities tab shows only activities for these account keys (game-platform-membershipId). Toggle via Per-Platform cards. */
  selectedAccountKeysForActivities: Set<string> = new Set();
  /** When non-empty, Activity Breakdown shows only these accounts. Toggle via account cards on Breakdown tab. */
  selectedAccountKeysForBreakdown: Set<string> = new Set();
  /** When non-empty, Guardian Firsts shows only these accounts. Toggle via account cards on Firsts tab. */
  selectedAccountKeysForFirsts: Set<string> = new Set();
  /** Account card filter for Accomplishments tab (same semantics as Firsts). */
  selectedAccountKeysForAccomplishments: Set<string> = new Set();
  activeAccomplishmentsGame: 'D1' | 'D2' = 'D2';
  activityTypeIcons: { [key: string]: SafeHtml } = {};
  protected activitiesCache: Map<string, StoredActivity[]> = new Map();
  // Debug filter for record hashes
  recordHashFilter: string = '';
  // Map to store presentation node completion status for titles
  protected presentationNodeCompletion: { [hash: string]: boolean } = {};
  // Add property at the top of the class
  firstEverActivity: ActivityHistory | undefined;
  motDebug: { [membershipId: string]: any } = {};
  dungeonSoloFirsts: { [membershipId: string]: DungeonSoloFirst[] } = {};
  loadingDungeonSoloFirsts: { [membershipId: string]: boolean } = {};
  /** Stores firsts per membershipId */
  guardianFirstsMap: { [membershipId: string]: ActivityFirstCompletion[] } = {};
  /** Aggregated (all-platform) firsts across selected players */
  aggregateGuardianFirsts: ActivityFirstCompletion[] = [];
  addMode: boolean = false; // NEW: Track whether we're adding profiles or replacing them
  /** Pending player data from URL parameters to load after favorites */
  protected pendingPlayerData: any[] | null = null;
  /** First-ever activity cache keyed by playerKey so D1 and D2 don't collide. */
  protected firstEverActivities: { [playerKey: string]: ActivityHistory | undefined } = {};
  /** Running count of how many activities have been processed in the current load session */
  protected overallActivitiesProcessed: number = 0;
  /** Indicates whether the UI has already rendered at least one slice of activities for the selected date. */
  protected initialDisplayShown: boolean = false;
  // UI state for title view
  titleSort: 'alpha' | 'release' | 'category' | 'gilded' = 'release';
  titleFilter: 'all' | 'current' | 'legacy' = 'all';
  loadingTitlesOverall = false;

  // -----------------------------------------------
  protected firstFullSyncDone = false;   // new – becomes true once every selected account finished first crawl
  protected syncedPlayers: Set<string> = new Set();
  /**
   * TrackBy function for activities to optimize ngFor performance
   */
  trackByActivity: TrackByFunction<ActivityWithMembership | ActivityHistory> = (index: number, activity: any): string => {
    return activity.activityDetails?.instanceId || activity.period || index.toString();
  };
  /**
   * TrackBy function for players to optimize ngFor performance
   */
  trackByPlayer: TrackByFunction<PlayerSearchDisplay> = (index: number, player: PlayerSearchDisplay): string => {
    return `${player.membershipId}_${player.membershipType}`;
  };
  /**
   * TrackBy function for type groups to optimize ngFor performance
   */
  trackByTypeGroup: TrackByFunction<TypeGroup> = (index: number, group: TypeGroup): string => {
    return `${group.type}_${group.name}_${group.isD1}`;
  };
  /**
   * TrackBy function for year groups to optimize ngFor performance
   */
  trackByYearGroup: TrackByFunction<YearGroup> = (index: number, group: YearGroup): string => {
    return group.year;
  };
  /**
   * TrackBy function for account groups to optimize ngFor performance
   */
  trackByAccountGroup: TrackByFunction<GameGroup> = (index: number, group: GameGroup): string => {
    return `${group.game}_${index}`;
  };
  /**
   * TrackBy function for guardian firsts to optimize ngFor performance
   */
  trackByGuardianFirst: TrackByFunction<ActivityFirstCompletion> = (index: number, first: ActivityFirstCompletion): string => {
    if (first.type === 'story' && first.storyReleaseId) {
      return `story_${first.game}_${first.storyReleaseId}_${first.instanceId || first.referenceId || index}`;
    }
    return `${first.type}_${first.game}_${first.instanceId || first.referenceId || index}`;
  };
  trackByStoryMilestone: TrackByFunction<ActivityFirstCompletion> = (index: number, s: ActivityFirstCompletion): string =>
    `${s.storyReleaseId || 'unknown'}_${s.referenceId}_${s.completionDate}_${index}`;
  /** Cap parallel account syncs to stay under Bungie rate limits. */
  protected readonly playerSyncLimiter = createConcurrencyLimiter(2);

  // Currently viewed game within the Guardian Firsts view
  activeFirstsGame: 'D1' | 'D2' = 'D2';
  firstsSectionFilter: 'all' | 'first-ever' | 'story' | 'pantheon-events' | 'raids' | 'dungeons' = 'all';
  readonly breakdownView = new BreakdownView();
  showExportDialog = false;
  showFavoritesModal = false;
  showShareDropdown = false;
  modalSelectedPlayers: Set<string> = new Set();
  protected breakdownRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  protected breakdownLoadGen = 0;
  protected breakdownLoadInFlight = false;
  protected breakdownDirty = false;
  protected breakdownRetainExpansion = false;
  protected accountLoadingStatus = new Map<string, AccountLoadingStatus>();
  public accountLoadingStatuses: AccountLoadingStatus[] = [];
  public showLoadingModal = false;
  loadingPanelExpanded = false;
  public isLoadingComplete = false;
  protected lookupStartedAtMs: number | null = null;
  protected lookupDataSources = new Set<'archive' | 'bungie'>();
  protected lookupAnalyticsSent = false;
  protected chronoRowsCache = new WeakMap<object, { sort: string; rows: any[] }>();
  protected versionGroupsCache = new WeakMap<object, Array<{ version: string; activities: any[] }>>();
  protected perCharacterExpanded: { [key: string]: boolean } = {};

  /** Unique key for a player independent of case. */
  getPlayerKey(p: { membershipId: string; game?: 'D1' | 'D2' }): string {
    return getPlayerKeyUtil(p);
  }

  protected getFavoriteKey(account: {
    membershipId: string;
    game: 'D1' | 'D2';
    membershipType: number;
  }): string {
    return getFavoriteKeyUtil(account);
  }
}
