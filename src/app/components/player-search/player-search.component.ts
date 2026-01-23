/* The following is the full contents of src/app/components/player-search/player-search.component.ts
   with the minimal full-string fallback changes applied:
   - Added helper fullStringFallbackLooksLikeSingleUser(...)
   - Replaced the bulk-split branch in addPlayer() to try the full-string fallback first
   Copy & paste this entire file to replace the existing file in your working copy.
*/

import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, TrackByFunction, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { BungieApiService, PlayerSearchResult } from '../../services/bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { DestinyManifestService } from '../../services/destiny-manifest.service';
import { ActivityCacheService } from '../../services/activity-cache.service';
import { PGCRCacheService } from '../../services/pgcr-cache.service';
import { environment } from '../../../environments/environment';

import { ActivityHistory, Character } from '../../models/activity-history.model';
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption, ActivityMode, ACTIVITY_MODE_MAP } from '../../models/activity-types';
import { ActivityDbService, StoredActivity, FavoriteAccount } from '../../services/activity-db.service';
import { FirstActivityService } from '../../services/first-activity.service';
import { BehaviorSubject, Observable, of, Subject, debounceTime, from } from 'rxjs';
import { map, shareReplay, switchMap, catchError, distinctUntilChanged, exhaustMap } from 'rxjs/operators';
import { TimezoneService } from '../../services/timezone.service';
import { ActivityIconService } from '../../services/activity-icon.service';
import { ActivityFirstCompletion, GuardianFirsts, RAID_NAMES } from '../../models/guardian-firsts.model';
import { DatePickerComponent } from '../date-picker/date-picker.component';
// Removed new summary/list components to revert to previous display
import { StatsService, AccountStats, ActivityGroup as StatsActivityGroup } from '../../services/stats.service';
import type { ActivityIconType } from '../../services/activity-icon.service';
import { SafeHtml } from '@angular/platform-browser';
import { isPvP } from '../../utils/activity-utils';
import { getActivityName } from '../../utils/activity-utils';
import { DungeonSoloFirst } from '../../models/dungeon-solo-first.model';
import { WastedOnDestinyService } from '../../services/wasted-on-destiny.service';
import { PlaytimeService } from '../../services/playtime.service';
import { TitleService } from '../../services/title.service';
import { SelectedAccountsService } from '../../services/selected-accounts.service';
import { PlatformAccount } from '../../models/platform-account.model';
import { DungeonSoloFirstsComponent } from '../dungeon-solo-firsts/dungeon-solo-firsts.component';
import { ExportService, ExportRequest } from '../../services/export.service';
import { ExportOptionsDialogComponent } from '../export-options-dialog.component';
import { LoadingProgress } from '../../models/loading-progress.model';
import { ShareService } from '../../services/share.service';
import { AccountStatsComponent } from '../account-stats/account-stats.component';
// import { AnalyticsComponent } from '../analytics/analytics.component';

interface ActivityEntry {
  game: string;
  platform: string;
  player: PlayerSearchResult;
  activities: ActivityHistory[];
}

interface ActivityWithMembership extends ActivityHistory {
  membershipId: string;
  membershipType: number; // NEW: platform id to support icon rendering
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  iconPath?: string;
}

interface TypeGroup {
  name: string; // display name (e.g., "Wrath of the Machine")
  type: string; // activity type (e.g., "raid")
  icon: SafeHtml | null;
  activities: ActivityWithMembership[];
  image?: SafeHtml | null;
  isD1: boolean;
  /** Track PGCR instanceIds already included to prevent cross-platform duplicates */
  seenInstanceIds?: Set<string>;
}

interface YearGroup {
  year: string;
  // For template rendering we keep arrays, not Maps
  typeGroups: TypeGroup[];
}

interface GameGroup {
  game: 'D1' | 'D2';
  // For template rendering we keep arrays, not Maps
  yearGroups: YearGroup[];
}

interface ActivityGroup {
  type: number;
  game: 'D1' | 'D2';
  activities: any[];
}

// Representative activity referenceIds for each type (D2 hashes)
const ACTIVITY_TYPE_REFERENCE_IDS: { [type: string]: number } = {
  raid: 2122313384,      // Last Wish
  strike: 1437935813,    // Lake of Shadows
  crucible: 3881495763,  // Control
  dungeon: 2032534090,   // Prophecy
  nightfall: 2964135793, // The Corrupted (Nightfall)
  gambit: 2693136600,    // Gambit Prime
  other: 1375089621      // The Whisper (as a fallback)
};

// Add extended type for display
interface PlayerSearchDisplay extends PlayerSearchResult {
  game: 'D1' | 'D2';
  platform: string;
  isPrimary?: boolean;
  crossSaveOverride?: number;
}

// PvP mode name lookup
export const PVP_MODE_NAMES: { [mode: number]: string } = {
  5: 'Crucible',
  10: 'Control',
  12: 'Clash',
  15: 'Iron Banner',
  19: 'Trials of Osiris',
  24: 'Rumble',
  25: 'All PvP',
  28: 'Supremacy',
  37: 'Survival',
  38: 'Countdown',
  39: 'Trials of the Nine',
  40: 'Breakthrough',
  41: 'Doubles',
  42: 'Private Match',
  43: 'Scorched',
  44: 'Scorched Team',
  45: 'Gambit',
  48: 'Showdown',
  49: 'Lockdown',
  50: 'Momentum Control',
  51: 'Countdown Classic',
  52: 'Elimination',
  53: 'Rift',
};

// Update the type where we need the game property
interface LoadingStatus {
  accountKey: string;
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  membershipType: number;
  status: 'fetching-profile' | 'loading-characters' | 'fetching-activities' | 'organizing-pgcrs' | 'displaying-activities' | 'complete' | 'error';
  progress?: number;
  message: string;
  timestamp: Date;
}

type CharacterWithGame = Character & { 
  game?: 'D1' | 'D2';
  mode?: number;
  membershipType: number;
  membershipId: string;
};

// Add cache interface
interface ActivityCache {
  activities: ActivityHistory[];
  timestamp: number;
  type: string;
  game: string;
}

// Add VerificationResult interface
interface VerificationResult {
  profileName: string;
  characterId: string;
  characterClass: string;
  apiCount: number;
  dbCount: number;
  synced: boolean;
  missingIds: string[];
}

// Add interface for PGCR entry at the top with other interfaces
interface PGCREntry {
  player?: {
    destinyUserInfo?: {
      membershipId: string;
      membershipType: number;
      displayName?: string;
    };
    characterClass?: string;
    lightLevel?: number;
  };
  characterId: string;
}

interface TitleObjective {
  complete: boolean;
  progress?: number;
  completionValue?: number;
  objectiveHash?: number;
  visible?: boolean;
}

interface TitleRecord {
  completed: boolean;
  objectives?: TitleObjective[];
  state: number;
  completedCount?: number;
}

interface ProfileRecordsResponse {
  data?: {
    records?: { [key: string]: TitleRecord };
    privacy?: number;
  };
  error?: string;
}

// Mapping of title names (lowercase) to standardized gilded seal image paths
const GILDED_SEAL_IMAGE_MAP: { [title: string]: string } = {
  'conqueror': 'assets/gilded-seals/Conqueror-Gilded.png',
  'flawless': 'assets/gilded-seals/Flawless-Gilded.png',
  'heavymetal': 'assets/gilded-seals/Heavy-Metal-Gilded.png',
  'dredgen': 'assets/gilded-seals/Dredgen-Gilded.png',
  'deadeye': 'assets/gilded-seals/Deadeye-Gilded.png',
  'champ': 'assets/gilded-seals/Champ-Gilded.png',
  'ghostwriter': 'assets/gilded-seals/Ghost-Writer-Gilded.png',
  'glorious': 'assets/gilded-seals/Glorious-Gilded.png',
  'flamekeeper': 'assets/gilded-seals/Flamekeeper-Gilded.png',
  'ironlord': 'assets/gilded-seals/Iron-Lord-Gilded.png',
  'reveler': 'assets/gilded-seals/Reveler-Gilded.png',
  'starbaker': 'assets/gilded-seals/Star-Baker-Gilded.png',
  'unbroken': 'assets/gilded-seals/Unbroken-Gilded.png'
};

// Utility to normalize title names for mapping
function normalizeTitleName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Utility function to extract characterId for both D1 and D2 character objects
// D1: character.characterBase.characterId
// D2: character.characterId
// Use this everywhere you need a characterId to avoid regressions and ensure accuracy.
function getCharacterId(char: any): string | undefined {
  return char.characterId || char.characterBase?.characterId;
}

// Special handling for legacy and current Conqueror/Flawless titles
const SPECIAL_TITLES: { [hash: number]: { name: string; gildingTrackingRecordHash?: number } } = {
  1376640684: { name: 'Conqueror (Season of the Worthy)' },
  581214566: { name: 'Conqueror (Season of the Hunt)' },
  3212358005: { name: 'Conqueror (Season of Arrivals)' },
  1276693937: { name: 'Flawless (Season of the Hunt)' },
  3251218484: { name: 'Flawless (Season of Arrivals)' },
  2086100423: { name: 'Flawless (Season of the Worthy)' },
  3776992251: { name: 'Conqueror', gildingTrackingRecordHash: 1715149073 }, // Current
  1733555826: { name: 'Flawless', gildingTrackingRecordHash: 2506618338 },   // Current
};

// Explicit release order mapping (higher = newer)
const RELEASE_ORDER: { [normalized: string]: number } = {
  'cursebreaker': 1,
  'dredgen': 1,
  'wayfarer': 1,
  'mmxix mot': 4,
  'chronicler': 1,
  'undying': 6,
  'blacksmith': 2,
  'savior': 7,
  'almighty': 8,
  'enlightened': 5,
  'reckoner': 3,
  'shadow': 3,
  'mmxx mot': 9,
  'harbinger': 6,
  'forerunner': 10,
  'descendant': 12,
  'warden': 11,
  'splintered': 11,
  'chosen': 13,
  'rivensbane': 1,
  'splicer': 14,
  'conqueror': 8,
  'deadeye': 15,
  'realmw alker': 15,
  'fatebreaker': 16,
  'mmxxi mot': 17,
  'vidmaster': 17,
  'risen': 18,
  'gumshoe': 18,
  'iron lord': 19,
  'reaper': 19,
  'flamekeeper': 20,
  'ghost writer': 22,
  'scallywag': 21,
  'star baker': 22,
  'mmxxii mot': 23,
  'seraph': 23,
  'virtual fighter': 24,
  'glorious': 23,
  'queensguard': 24,
  'reveler': 20,
  'champ': 25,
  'discerptor': 19,
  'aquanaut': 25,
  'wanted': 23,
  'haruspex': 26,
  'disciple-slayer': 18,
  'wishbearer': 27,
  'mmxxiii mot': 28,
  'dream warrior': 24,
  'ghoul': 24,
  'brave': 29,
  'godslayer': 29,
  'kingslayer': 21,
  'swordbearer': 26,
  'transcendent': 30,
  'legend': 31,
  'intrepid': 30,
  'slayer baron': 33,
  'wrathbearer': 27,
  'iconoclast': 30,
  'unleashed': 34,
  'heretic': 35,
  'delver': 35,
  'mmxxiv mot': 32,
  'eternal': 36,
  'heavy metal': 36,
  'fated weapon': 37,
  'atemporal': 37,
  'sharpshooter': 38,
  'avant garde': 39,
  'undertaker': 40,
  'renegade': 41,
  'praxic': 42,

};

// Aggregated statistics per platform (e.g., Xbox, PlayStation, Steam)
interface PlatformStats {
  platform: string;
  totalTime: number;
  totalActivities: number;
  totalSeals: number;
  game: 'D1' | 'D2';
  emblemBackground?: string; // Bungie relative path (e.g. /common/.../emblem.jpg)
  emblemIcon?: string;       // Small square emblem icon path
  displayName?: string;      // Representative guardian name (first account found)
  className?: string;        // Hunter / Titan / Warlock
  lightLevel?: number;
}

// Phase 4: UI Rendering Optimization
@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AccountStatsComponent,
    // AnalyticsComponent, // temporarily disabled
    ExportOptionsDialogComponent,
    DatePickerComponent
  ],
  templateUrl: './player-search.component.html',
  styleUrls: ['./player-search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush // Optimize change detection
})
export class PlayerSearchComponent implements OnInit, OnDestroy {
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
  selectedCharacterIds: { [key: string]: string | undefined } = {};
  characters: { [key: string]: any[] } = {};
  activities: { [key: string]: ActivityHistory[] } = {};
  loading: { [key: string]: boolean } = {};
  error: { [key: string]: string } = {};
  selectedActivityType: ActivityTypeOption = ACTIVITY_TYPE_OPTIONS[0];
  searchUsername = '';
  // Removed selectedPlatform - no longer needed without game picker
  // Removed selectedGame - now searches both D1 and D2 automatically
  errorMessage = '';
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
  private processedActivities: any[] = [];
  loadingProgress: LoadingProgress | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private activityCache: Map<string, ActivityCache> = new Map();
  private filteredActivitiesCache: Map<string, { list: ActivityWithMembership[]; dirty: boolean }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  private filteredActivities$ = new BehaviorSubject<ActivityHistory[]>([]);
  private searchTerm$ = new Subject<string>();
  /** Emits when account stats need to be recomputed; debounced in constructor */
  private statsDebounce$ = new Subject<void>();
  loadingAccountStats = false;
  accountStats: {
    totalTime: number;
    totalActivityTime: number;
    totalActivityCount: number;
    totalSeals?: number;
    perType: { [type: string]: { count: number, time: number } };
  } = {
    totalTime: 0,
    totalActivityTime: 0,
    totalActivityCount: 0,
    totalSeals: 0,
    perType: {}
  };
  
  // New computed stats using StatsService
  computedAccountStats: AccountStats | null = null;
  filteredActivitiesForDate: ActivityWithMembership[] = [];
  private currentLoadToken = 0;
  /** Incrementing token for stats calculations to avoid stale calls resetting the spinner late. */
  private statsCalcToken = 0;
  private readonly PGCR_BATCH_SIZE = 30;
  private readonly VALIDATION_DELAY = 50;

  // Progressive loading properties
  private updateBatchTimer: any = null;
  private pendingActivityUpdates = false;
  private readonly BATCH_UPDATE_DELAY = 500; // 500ms batching
  
  // Smart caching for performance
  private lastProcessedActivitiesHash = '';
  private lastGroupedActivities: any[] = [];

  showBackgroundProcessingIndicator = false;

  onDatePickerChange(dateInfo: {month: number, day: number}) {
    this.selectedMonth = dateInfo.month;
    this.selectedDay = dateInfo.day;
    // Don't trigger search immediately - wait for Search button click
  }

  /**
   * Computes account stats using the StatsService
   */
  private computeAccountStatsWithService(): void {
    if (this.selectedPlayers.length === 0 || this.filteredActivitiesForDate.length === 0) {
      this.computedAccountStats = null;
      return;
    }

    // Create activities map for the StatsService
    const activitiesMap = new Map<string, ActivityHistory[]>();
    
    for (const player of this.selectedPlayers) {
      const playerKey = `${player.game}|${player.membershipId}`;
      const playerActivities = this.filteredActivitiesForDate.filter(activity => 
        activity.membershipId === player.membershipId && activity.game === player.game
      );
      activitiesMap.set(playerKey, playerActivities);
    }

    // Compute stats using the service
    this.computedAccountStats = this.statsService.calculateAccountStats(this.selectedPlayers, activitiesMap);
  }

  /**
   * Gets grouped activities for the ActivityListComponent
   */
  getGroupedActivitiesForDisplay(): any[] {
    if (this.filteredActivitiesForDate.length === 0) {
      return [];
    }

    // Convert ActivityWithMembership to ActivityHistory for the StatsService
    const activities: ActivityHistory[] = this.filteredActivitiesForDate.map(activity => ({
      period: activity.period || '',
      activityDetails: activity.activityDetails || { referenceId: '0', instanceId: '0', mode: 0 },
      values: activity.values || {}
    }));

    const statsGroups = this.statsService.groupActivitiesByBaseName(activities);
    return statsGroups;
  }
  guardianFirsts: ActivityFirstCompletion[] = [];
  loadingGuardianFirsts = false;
  readonly guardianGames: ('D1' | 'D2')[] = ['D1', 'D2'];
  favoriteAccounts: FavoriteAccount[] = [];
  apiAvailable: boolean = true;
  dbReady: boolean = false;
  activeTab: 'activities' | 'firsts' | 'titles' = 'activities';
  activeFirstsTab: string = 'all';
  platformTabs: string[] = [];
  playerTitles: { [key: string]: any } = {};
  loadingTitles: { [key: string]: boolean } = {};
  /** Combined list of titles across all selected players (built after fetching). */
  aggregatedTitles: any[] = [];
  /** Per-platform aggregated stats (time, activities, seals) for account summary cards. */
  perPlatformStats: PlatformStats[] = [];
  activityTypeIcons: { [key: string]: SafeHtml } = {};
  public GILDED_SEAL_IMAGE_MAP = GILDED_SEAL_IMAGE_MAP;
  public normalizeTitleName = normalizeTitleName;
  private activitiesCache: Map<string, StoredActivity[]> = new Map();
  // Debug filter for record hashes
  recordHashFilter: string = '';
  // Map to store presentation node completion status for titles
  private presentationNodeCompletion: { [hash: string]: boolean } = {};
  // Add property at the top of the class
  firstEverActivity: ActivityHistory | undefined;
  motDebug: { [membershipId: string]: any } = {};
  dungeonSoloFirsts: { [membershipId: string]: DungeonSoloFirst[] } = {};
  loadingDungeonSoloFirsts: { [membershipId: string]: boolean } = {};
  /** Stores firsts per membershipId */
  guardianFirstsMap: { [membershipId: string]: ActivityFirstCompletion[] } = {};
  /** Aggregated (all-platform) firsts across selected players */
  aggregateGuardianFirsts: ActivityFirstCompletion[] = [];
  // Removed includeLinkedAccounts - users explicitly select accounts from search modal
  addMode: boolean = false; // NEW: Track whether we're adding profiles or replacing them
  /** Play-time + seal counts fetched from WastedOnDestiny keyed by "game|membershipId" */
  private wastedTimes: { [playerKey: string]: number } = {};
  private wastedSeals: { [playerKey: string]: number } = {};
  /** Pending player data from URL parameters to load after favorites */
  private pendingPlayerData: any[] | null = null;
  /** First-ever activity cache keyed by playerKey so D1 and D2 don't collide. */
  private firstEverActivities: { [playerKey: string]: ActivityHistory | undefined } = {};
  /** Running count of how many activities have been processed in the current load session */
  private overallActivitiesProcessed: number = 0;
  /** Indicates whether the UI has already rendered at least one slice of activities for the selected date. */
  private initialDisplayShown: boolean = false;
  // UI state for title view
  titleSort: 'alpha' | 'release' = 'release';
  titleFilter: 'all' | 'current' | 'legacy' = 'all';
  loadingTitlesOverall = false;
  // -----------------------------------------------

  // -----------------------------------------------
  private firstFullSyncDone = false;   // new – becomes true once every selected account finished first crawl
  private syncedPlayers: Set<string> = new Set();
  
  // Missing properties
  accountLoadingStatus: Map<string, LoadingStatus> = new Map();
  accountLoadingStatuses: LoadingStatus[] = [];
  showFavoritesModal: boolean = false;
  showExportDialog: boolean = false;
  showShareDropdown: boolean = false;
  showLoadingModal: boolean = false;
  isLoadingComplete: boolean = false;
  activeFirstsGame: string = 'all';

  // Phase 4: UI Rendering Optimization - TrackBy Functions
  /**
   * TrackBy function for activities to optimize ngFor performance
   */
  trackByActivity: TrackByFunction<ActivityWithMembership | ActivityHistory> = (index: number, activity: any): string => {
    return activity.activityDetails?.instanceId || activity.period || index.toString();
  };

  /** Safely extract display name for activity rows without template type errors */
  getActivityDisplayName(activity: any): string {
    try {
      const name = (activity as any)?.displayName;
      return typeof name === 'string' && name.trim().length > 0 ? name : 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

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
    return `${first.type}_${first.game}_${first.instanceId || first.referenceId || index}`;
  };

  // ------------------------------------------------------------------
  // Concurrency-limited queue for per-account sync (Pattern 2)
  // ------------------------------------------------------------------
  private readonly MAX_PARALLEL_PLAYER_SYNCS = 2; // Reduced from 4 to 2 to stay under rate limits
  private activePlayerSyncs = 0;
  private playerSyncQueue: Array<() => void> = [];

  /**
   * Runs the given async task while enforcing the global
   * MAX_PARALLEL_PLAYER_SYNCS limit.  Additional tasks are queued and
   * executed FIFO as slots become available.
   */
  private runWithPlayerSyncLimit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const exec = () => {
        this.activePlayerSyncs++;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activePlayerSyncs--;
            const next = this.playerSyncQueue.shift();
            if (next) {
              next();
            }
          });
      };

      if (this.activePlayerSyncs < this.MAX_PARALLEL_PLAYER_SYNCS) {
        exec();
      } else {
        this.playerSyncQueue.push(exec);
      }
    });
  }

  /**
   * Returns the list of titles ready for display based on the current filter / sort.
   * Requirements (All-view):
   *   • show unlocked titles first, locked at the bottom
   *   • within each bucket sort by release date (newest first)
   *   • legacy titles are still included but rendered grey (handled in template)
   */
  get displayTitles(): any[] {
    let list = this.aggregatedTitles;

    // Filter by legacy/current when not in "all" view
    if (this.titleFilter !== 'all') {
      const wantLegacy = this.titleFilter === 'legacy';
      list = list.filter((t: any) => t.legacy === wantLegacy);

      // Respect user-selected sort order for filtered lists
      if (this.titleSort === 'alpha') {
        return [...list].sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
      // Default or "release" – newest first
      return [...list].sort((a: any, b: any) => (b.releaseRank ?? 0) - (a.releaseRank ?? 0));
    }

    // ---  All view ---
    const unlocked = list.filter((t: any) => !t.locked);
    const locked   = list.filter((t: any) =>  t.locked);

    const sortAlpha    = (a: any, b: any) => a.name.localeCompare(b.name);
    const sortRelease  = (a: any, b: any) => (b.releaseRank ?? 0) - (a.releaseRank ?? 0);
    const sortFn = this.titleSort === 'alpha' ? sortAlpha : sortRelease;

    unlocked.sort(sortFn);
    locked.sort(sortFn);

    return [...unlocked, ...locked];
  }

  /**
   * Returns titles filtered by locked state, respecting current filter/sort options.
   */
  private getTitlesByLock(locked: boolean): any[] {
    let list = this.aggregatedTitles.filter((t: any) => t.locked === locked);

    // Apply legacy/current filters when set
    if (this.titleFilter !== 'all') {
      const wantLegacy = this.titleFilter === 'legacy';
      list = list.filter((t: any) => t.legacy === wantLegacy);
    }

    const sortAlpha   = (a: any, b: any) => a.name.localeCompare(b.name);
    const sortRelease = (a: any, b: any) => (b.releaseRank ?? 0) - (a.releaseRank ?? 0);
    const sortFn = this.titleSort === 'alpha' ? sortAlpha : sortRelease;
    return [...list].sort(sortFn);
  }

  /** Earned titles (unlocked). */
  get unlockedTitlesDisplay(): any[] {
    return this.getTitlesByLock(false);
  }

  /** Locked titles. */
  get lockedTitlesDisplay(): any[] {
    return this.getTitlesByLock(true);
  }

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef,
    private activityCacheService: ActivityCacheService,
    private pgcrCacheService: PGCRCacheService,
    private activityDb: ActivityDbService,
    private timezoneService: TimezoneService,
    private activityIconService: ActivityIconService,
    private statsService: StatsService,
    private wastedService: WastedOnDestinyService,
    private playtimeService: PlaytimeService,
    private titleService: TitleService,
    private selectedAccounts: SelectedAccountsService,
    private exportService: ExportService,
    private shareService: ShareService,
    private firstActivityService: FirstActivityService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location
  ) {
    (window as any).activityDbService = this.activityDb;
    this.updatePlatformTabs();

    // Debounce username input changes (300 ms). No API hit yet; prepares for future live suggestions.
    this.searchTerm$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((term: string) => {
        this.searchUsername = term;
      });

    // Debounce heavy account-stats calculation; ignore new triggers while one is running
    this.statsDebounce$
      .pipe(
        debounceTime(1000),
        exhaustMap(() => from(this.calculateAccountStats()))
      )
      .subscribe();
  }

  private updatePlatformTabs() {
    // Limit the platform list to those that belong to the selected game tab so that
    // Destiny 1 & Destiny 2 never mix within the same sub-view.
    this.platformTabs = this.getPlatforms(this.activeFirstsGame);
    if (!this.platformTabs.includes(this.activeFirstsTab) && this.activeFirstsTab !== 'all') {
      this.activeFirstsTab = 'all';
    }
  }

  async ngOnInit() {
    console.log('[INIT] Component initializing');

    // Set default date to today (use YYYY-MM-DD format)
    const today = new Date();
    this.selectedMonth = today.getMonth() + 1;
    this.selectedDay = today.getDate();
    this.selectedYear = today.getFullYear();
    this.selectedDate = `${this.selectedYear}-${this.selectedMonth.toString().padStart(2, '0')}-${this.selectedDay.toString().padStart(2, '0')}`;
    
    // Handle URL parameters for permalinks - process synchronously
    const params = this.route.snapshot.params;
    const queryParams = this.route.snapshot.queryParams;
    
    // Try manual URL parsing as fallback
    const pathname = window.location.pathname;
    const dateMatch = pathname.match(/\/date\/(\d{4}-\d{2}-\d{2})/);
    const playersMatch = pathname.match(/\/players\/(.+)$/);
    
    // Check both route params and query params for date
    const dateParam = params['date'] || queryParams['date'] || dateMatch?.[1];
    if (dateParam) {
      // Validate date format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        const [year, month, day] = dateParam.split('-').map(Number);
        if (year >= 2014 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          this.selectedYear = year;
          this.selectedMonth = month;
          this.selectedDay = day;
          this.selectedDate = dateParam;
        }
      }
    }
    
    // Check both route params and query params for players
    const playersParam = params['players'] || queryParams['players'] || playersMatch?.[1];
    if (playersParam) {
      const decodedPlayers = decodeURIComponent(playersParam);
      try {
        const playerData = JSON.parse(decodedPlayers);
        if (Array.isArray(playerData)) {
          // Store player data to load after favorites are loaded
          this.pendingPlayerData = playerData;
        }
      } catch (e) {
        console.warn('Invalid player data in URL:', e);
      }
    } else {
      // Clean page load (no players in URL) - clear any leftover data from previous sessions
      console.log('[INIT] Clean page load detected, clearing leftover database entries');
      await this.activityDb.clearAllActivities();
      const remainingCount = await this.activityDb.activities.count();
      if (remainingCount > 0) {
        console.error(`[INIT] CRITICAL: ${remainingCount} activities still in database after initial clear!`);
      } else {
        console.log('[INIT] Database cleared on initial load - verified 0 activities remaining');
      }
    }
    
    // Also subscribe to future route changes
    this.route.params.subscribe(params => {
      if (params['date']) {
        const dateParam = params['date'];
        // Validate date format (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
          const [year, month, day] = dateParam.split('-').map(Number);
          if (year >= 2014 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            this.selectedYear = year;
            this.selectedMonth = month;
            this.selectedDay = day;
            this.selectedDate = dateParam;
          }
        }
      }
      
      if (params['players']) {
        const playersParam = decodeURIComponent(params['players']);
        try {
          const playerData = JSON.parse(playersParam);
          if (Array.isArray(playerData)) {
            // Store player data to load after favorites are loaded
            this.pendingPlayerData = playerData;
          }
        } catch (e) {
          console.warn('Invalid player data in URL:', e);
        }
      }
    });
    
    // Clear firstEverActivities cache to ensure new filtering logic takes effect
    this.firstEverActivities = {};
    // Clear the FirstActivityService cache to ensure new filtering logic takes effect
    if (this.firstActivityService) {
      this.firstActivityService.clearCache();
    }
    
    // PERFORMANCE OPTIMIZATION: Preload favorites cache in background
    // This ensures instant display for returning users
    this.activityDb.preloadFavoritesCache().catch(error => {
      console.warn('Favorites cache preload failed:', error);
    });
    
    // Load pending players from URL if any (prioritize URL over favorites)
    if (this.pendingPlayerData) {
      await this.loadPlayersFromUrlData(this.pendingPlayerData);
      this.pendingPlayerData = null;
    } else {
      // Only load favorites if no URL players to load
      await this.loadAndDisplayFavorites();
    }
    
    this.dbReady = true;
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    // Clean up any subscriptions or timers
    this.statsDebounce$.complete();
    this.filteredActivities$.complete();
  }

  /**
   * Close modal when clicking on backdrop (outside the modal content)
   */
  closeModalOnBackdrop(event: Event): void {
    // Only close if the click was on the modal backdrop itself, not its children
    if (event.target === event.currentTarget) {
      this.showPlatformPicker = false;
      this.showFavoritesModal = false;
      this.showShareDropdown = false;
    }
  }

  /**
   * Handle ESC key press to close modals and other keyboard shortcuts
   */
  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.handleEscapeKey();
        break;
      case 'Enter':
        this.handleEnterKey(event);
        break;
      case 'Tab':
        this.handleTabKey(event);
        break;
    }
  }

  /**
   * Handle ESC key - close any open modals
   */
  private handleEscapeKey(): void {
    if (this.showPlatformPicker) {
      this.showPlatformPicker = false;
      this.clearModalFocus();
      this.cdr.detectChanges();
    } else if (this.showFavoritesModal) {
      this.showFavoritesModal = false;
      this.clearModalFocus();
      this.cdr.detectChanges();
    } else if (this.showExportDialog) {
      this.showExportDialog = false;
      this.clearModalFocus();
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle Enter key in specific contexts
   */
  private handleEnterKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    
    // If focused on search input, trigger search
    if (target.tagName === 'INPUT' && target.getAttribute('placeholder')?.includes('username')) {
      if (this.searchUsername.trim()) {
        this.addPlayer();
      }
    }
    
    // If focused on modal button, prevent default form submission
    if (target.tagName === 'BUTTON' && (this.showPlatformPicker || this.showFavoritesModal)) {
      // Let the button handle its own click
      return;
    }
  }

  /**
   * Handle Tab key for improved keyboard navigation
   */
  private handleTabKey(event: KeyboardEvent): void {
    // If we're in a modal, implement focus trapping
    if (this.showPlatformPicker || this.showFavoritesModal) {
      this.trapFocusInModal(event);
    }
  }

  /**
   * Trap focus within modal dialogs for accessibility
   */
  private trapFocusInModal(event: KeyboardEvent): void {
    const modal = document.querySelector('.modal.show');
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (!event.shiftKey && document.activeElement === lastElement) {
      // Tab from last element -> focus first element
      event.preventDefault();
      firstElement?.focus();
    } else if (event.shiftKey && document.activeElement === firstElement) {
      // Shift+Tab from first element -> focus last element
      event.preventDefault();
      lastElement?.focus();
    }
  }

  /**
   * Set focus to the first focusable element in a modal
   */
  private focusFirstElementInModal(modalSelector: string): void {
    setTimeout(() => {
      const modal = document.querySelector(modalSelector);
      if (modal) {
        const firstFocusable = modal.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as HTMLElement;
        firstFocusable?.focus();
      }
    }, 100); // Small delay to ensure modal is rendered
  }

  /**
   * Clear modal focus and return to trigger element
   */
  private clearModalFocus(): void {
    // Return focus to search input or last focused element
    const searchInput = document.querySelector('input[placeholder*="username"]') as HTMLElement;
    searchInput?.focus();
  }

  /**
   * Open favorites modal with proper focus management
   */
  openFavoritesModal(): void {
    this.showFavoritesModal = true;
    this.focusFirstElementInModal('.modal.show');
  }

  /**
   * Confirm before clearing cached data
   */
  confirmClearData(): void {
    const confirmed = confirm(
      'Are you sure you want to clear all cached data?\n\n' +
      'This will remove:\n' +
      '• All stored activity history\n' +
      '• All cached character data\n' +
      '• All favorite accounts\n' +
      '• All Guardian Firsts data\n' +
      '• All Titles data\n\n' +
      'You will need to re-download all data on your next visit.'
    );
    
    if (confirmed) {
      this.clearAllActivitiesFromDb();
    }
  }

  /**
   * Updates the loading status for a specific account
   */
  private updateAccountLoadingStatus(
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    status: LoadingStatus['status'],
    message: string,
    progress?: number
  ) {
    const loadingStatus: LoadingStatus = {
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      status,
      message,
      progress,
      timestamp: new Date()
    };

    this.accountLoadingStatus.set(accountKey, loadingStatus);
    this.accountLoadingStatuses = Array.from(this.accountLoadingStatus.values());
    
    // Show modal when first status is added
    if (this.accountLoadingStatuses.length === 1) {
      this.showLoadingModal = true;
      this.isLoadingComplete = false;
    }
    
    // Check if all accounts are complete
    const allComplete = this.accountLoadingStatuses.every(s => s.status === 'complete');
    if (allComplete && this.accountLoadingStatuses.length > 0) {
      this.isLoadingComplete = true;
      // Auto-hide modal after 3 seconds
      setTimeout(() => {
        if (this.isLoadingComplete) {
          this.closeLoadingModal();
        }
      }, 3000);
    }
    
    this.cdr.detectChanges();
  }

  /**
   * Removes the loading status for a completed account
   */
  private removeAccountLoadingStatus(accountKey: string) {
    this.accountLoadingStatus.delete(accountKey);
    this.accountLoadingStatuses = Array.from(this.accountLoadingStatus.values());
    
    // Hide modal if no more statuses
    if (this.accountLoadingStatuses.length === 0) {
      this.showLoadingModal = false;
      this.isLoadingComplete = false;
    }
    
    this.cdr.detectChanges();
  }

  /**
   * Gets a user-friendly status message
   */
  private getStatusMessage(status: LoadingStatus['status'], game: 'D1' | 'D2'): string {
    switch (status) {
      case 'fetching-profile':
        return `Fetching ${game} profile...`;
      case 'loading-characters':
        return `Loading ${game} characters...`;
      case 'fetching-activities':
        return `Fetching ${game} activities...`;
      case 'organizing-pgcrs':
        return `Organizing ${game} data...`;
      case 'displaying-activities':
        return `Displaying ${game} activities...`;
      case 'complete':
        return `${game} data loaded successfully`;
      case 'error':
        return `Error loading ${game} data`;
      default:
        return `Processing ${game} data...`;
    }
  }

  /**
   * Formats status for display in the UI
   */
  public formatStatusDisplay(status: string): string {
    return status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
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

  public continueInBackground(): void {
    // Deprecated: replaced by passive notice. Keep no-op for safety.
    this.showLoadingModal = true;
  }

  /**
   * Batched UI update to prevent excessive re-renders during progressive loading
   */
  private scheduleBatchedUpdate(): void {
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

  private performBatchedUpdate(): void {
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

  /**
   * Generate a hash for activities to detect changes and avoid unnecessary processing
   */
  private generateActivitiesHash(activities: ActivityWithMembership[]): string {
    if (!activities || activities.length === 0) {
      return 'empty';
    }
    
    // Create a simple hash based on activity IDs and timestamps
    const hashData = activities
      .map(activity => `${activity.activityDetails?.instanceId || ''}-${activity.period}`)
      .sort()
      .join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashData.length; i++) {
      const char = hashData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString();
  }

  async loadFavorites() {
    this.favoriteAccounts = await this.activityDb.getFavorites();
    this.cdr.detectChanges();
  }

  /**
   * Automatically load and display favorite profiles on app startup
   * Optimized for instant display with background updates
   */
  async loadAndDisplayFavorites() {
    await this.loadFavorites();
    
    // If we have favorites and no currently selected players, load them automatically
    if (this.favoriteAccounts.length > 0 && this.selectedPlayers.length === 0) {
      // Use optimized instant loading for favorites
      await this.loadMultipleFavoritesInstant(this.favoriteAccounts);
    }
  }
  /**
   * Optimized loading for favorite accounts with instant cached display
   * and background refresh for returning users
   */
  async loadMultipleFavoritesInstant(favorites: FavoriteAccount[]) {
    if (favorites.length === 0) return;

    // Convert favorites to PlayerSearchDisplay format
    const favoritePlayers: PlayerSearchDisplay[] = favorites.map(fav => ({
      membershipType: fav.membershipType,
      membershipId: fav.membershipId,
      displayName: fav.displayName,
      game: fav.game,
      platform: fav.platform
    }));

    // Phase 1: Show cached data instantly for ALL favorites
    const cachedDataPromises = favoritePlayers.map(async (player) => {
      const playerKey = this.getPlayerKey(player);
      const hasCachedData = await this.showCachedDataInstantly(player, playerKey);
      return { player, playerKey, hasCached: hasCachedData };
    });

    const cachedResults = await Promise.all(cachedDataPromises);
    
    // Add players to selected list immediately if they have cached data
    const playersWithCache = cachedResults.filter(r => r.hasCached);
    if (playersWithCache.length > 0) {
      // Show cached data immediately
      this.selectedPlayers = playersWithCache.map(r => r.player);
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
      
      console.log(`Instantly displayed ${playersWithCache.length} favorite accounts with cached data`);
    }

    // Phase 2: Background refresh for stale data or load fresh data for cache misses
    const refreshPromises = cachedResults.map(async ({ player, playerKey, hasCached }) => {
      if (hasCached) {
        // Background refresh for cached accounts
        const needsUpdate = await this.activityDb.needsDataUpdate(player.membershipId, 6); // 6 hour threshold for favorites
        if (needsUpdate) {
          console.log(`Background refresh starting for ${player.displayName}`);
          await this.startSilentBackgroundRefresh(player, playerKey);
        }
      } else {
        // Fresh load for accounts without cache
        console.log(`Fresh load starting for ${player.displayName}`);
        await this.loadCharacterHistory(player);
        this.loadingActivities[this.selectedDate] = false;
        this.cdr.detectChanges();
      }
    });

    // Execute background operations without blocking UI
    Promise.allSettled(refreshPromises).then(() => {
      console.log('All favorite accounts fully synchronized');
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
    });
  }
  /**
   * Show cached data instantly if available
   * Returns true if cached data was displayed, false if no cache
   */
  async showCachedDataInstantly(player: PlayerSearchDisplay, playerKey: string): Promise<boolean> {
    try {
      const cachedActivities = await this.activityDb.getAllActivitiesForMembershipOptimized(player.membershipId);
      
      if (cachedActivities.length === 0) {
        return false; // No cached data
      }

      // Convert cached activities to display format
      const activitiesWithMembership: ActivityWithMembership[] = cachedActivities.map(activity => ({
        ...activity,
        membershipId: player.membershipId,
        membershipType: player.membershipType,
        displayName: player.displayName,
        platform: player.platform,
        characterClass: activity.characterClass || 'Unknown',
        game: activity.game || player.game // Ensure game is defined
      }));

      // Store in component state for immediate display
      this.activities[playerKey] = activitiesWithMembership;
      
      // Trigger immediate UI update
      await this.loadAllFilteredActivities(true);
      
      console.log(`Instantly displayed ${cachedActivities.length} cached activities for ${player.displayName}`);
      return true;
      
    } catch (error) {
      console.error(`Error showing cached data for ${player.displayName}:`, error);
      return false;
    }
  }

  /**
   * Silent background refresh that doesn't show loading indicators
   * Updates data in background while user sees cached content
   */
  async startSilentBackgroundRefresh(player: PlayerSearchDisplay, playerKey: string): Promise<void> {
    try {
      // Load fresh data without showing loading UI
      const originalLoadingState = this.loadingActivities[this.selectedDate];
      
      await this.loadCharacterHistory(player);
      
      // Refresh the filtered activities with new data
      await this.loadAllFilteredActivities(true);
      
      // Restore original loading state (don't show as "loading" to user)
      this.loadingActivities[this.selectedDate] = originalLoadingState;
      
      console.log(`Silent background refresh completed for ${player.displayName}`);
      
    } catch (error) {
      console.error(`Silent background refresh failed for ${player.displayName}:`, error);
    }
  }

  /**
   * Load multiple favorite profiles at once
   */
  async loadMultipleFavorites(favorites: FavoriteAccount[]) {
    if (favorites.length === 0) return;

    // Check profile limit
    if (favorites.length > 10) {
      this.errorMessage = `Too many favorites (${favorites.length}). Only the first 10 will be loaded.`;
      favorites = favorites.slice(0, 10);
    }

    // Show immediate feedback - non-blocking progress UI
    this.showLoadingModal = true;
    this.accountLoadingStatuses = [];

    // Clear any existing players
    this.selectedPlayers = [];
    this.selectedCharacterIds = {};
    this.characters = {};
    this.activities = {};
    this.loading = {};
    this.error = {};
    this.groupedActivitiesByAccount = [];
    this.clearCache();

    // Convert favorites to PlayerSearchDisplay format
    const playersToLoad: PlayerSearchDisplay[] = favorites.map(fav => ({
      displayName: fav.displayName,
      membershipId: fav.membershipId,
      membershipType: fav.membershipType,
      game: fav.game,
      platform: fav.platform,
      isPrimary: false
    } as PlayerSearchDisplay));

    // Add all players to selectedPlayers
    this.selectedPlayers.push(...playersToLoad);
    
    // Set up character IDs
    for (const player of playersToLoad) {
      this.selectedCharacterIds[player.membershipId] = undefined;
    }

    // Ensure a date is selected (use full YYYY-MM-DD format for better date handling)
    if (!this.selectedDate) {
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      const year = today.getFullYear();
      this.selectedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // Set loading state
    this.loadingActivities[this.selectedDate] = true;
    this.cdr.detectChanges();

    try {
      // Load all players in parallel with concurrency limit
      const loadPromises: Promise<void>[] = [];
      for (const player of playersToLoad) {
        loadPromises.push(
          this.runWithPlayerSyncLimit(async () => {
            try {
              await this.loadCharacterHistory(player);
              await this.loadGuardianFirsts(player);
              await this.loadDungeonSoloFirsts(player);
            } catch (err) {
              console.warn('[LoadFavorites] Skipped due to error for', player.membershipId, err);
            }
          })
        );
        
        // Wasted time can load in parallel
        loadPromises.push(
          this.loadWastedTime(player).catch(err => {
            console.warn('[LoadFavorites] WastedTime skipped for', player.membershipId, err);
          })
        );
      }

      await Promise.all(loadPromises);
      
      // Load activities for the selected date
      if (this.selectedDate) {
        await this.loadAllFilteredActivities(true);
      }
      
      this.statsDebounce$.next();
    } catch (error) {
      console.error('[LoadFavorites] Error loading favorites:', error);
    } finally {
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
      // Ensure account summary recomputes once character history sync finishes
      this.statsDebounce$.next();
    }
  }

  isFavorite(player: PlayerSearchDisplay): boolean {
    return this.favoriteAccounts.some(f => 
      f.membershipId === player.membershipId && 
      f.game === player.game && 
      f.membershipType === player.membershipType
    );
  }

  /**
   * Load players from URL parameter data (for permalinks)
   */
  async loadPlayersFromUrlData(playerData: any[]) {
    if (playerData.length === 0) return;

    // Check profile limit
    if (playerData.length > 10) {
      this.errorMessage = `Too many players in URL (${playerData.length}). Only the first 10 will be loaded.`;
      playerData = playerData.slice(0, 10);
    }

    // Clear any existing players
    this.selectedPlayers = [];
    this.selectedCharacterIds = {};
    this.characters = {};
    this.activities = {};
    this.loading = {};
    this.error = {};
    this.groupedActivitiesByAccount = [];
    this.clearCache();

    // Convert URL data to PlayerSearchDisplay format
    const playersToLoad: PlayerSearchDisplay[] = playerData.map(data => ({
      displayName: data.displayName || 'Unknown Player',
      membershipId: data.membershipId,
      membershipType: data.membershipType || 1, // Default to Xbox
      game: data.game || 'D2',
      platform: data.platform || 'Unknown',
      isPrimary: false
    } as PlayerSearchDisplay));

    // Add all players to selectedPlayers
    this.selectedPlayers.push(...playersToLoad);
    
    // Set up character IDs
    for (const player of playersToLoad) {
      this.selectedCharacterIds[player.membershipId] = undefined;
    }

    // Set loading state
    this.loadingActivities[this.selectedDate] = true;
    this.cdr.detectChanges();

    try {
      // Show loading status for permalink players
      for (const player of playersToLoad) {
        const accountKey = this.getPlayerKey(player);
        const isD1 = this.isD1Player(player);
        const game = isD1 ? 'D1' : 'D2';
        const platform = this.getPlatformName(player.membershipType);
        
        this.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'fetching-profile',
          `Loading ${game} profile for ${player.displayName} from permalink...`
        );
      }

      // Load all players in parallel with concurrency limit
      const loadPromises: Promise<void>[] = [];
      for (const player of playersToLoad) {
        loadPromises.push(
          this.runWithPlayerSyncLimit(async () => {
            try {
              await this.loadCharacterHistory(player);
              await this.loadGuardianFirsts(player);
              await this.loadDungeonSoloFirsts(player);
            } catch (err) {
              console.warn('[LoadURLPlayers] Skipped due to error for', player.membershipId, err);
              // Update status to error
              const accountKey = this.getPlayerKey(player);
              const existingStatus = this.accountLoadingStatus.get(accountKey);
              if (existingStatus) {
                this.updateAccountLoadingStatus(
                  accountKey,
                  existingStatus.displayName,
                  existingStatus.platform,
                  existingStatus.game,
                  existingStatus.membershipType,
                  'error',
                  `Failed to load ${existingStatus.game} data for ${existingStatus.displayName}`
                );
              }
            }
          })
        );
        
        // Wasted time can load in parallel
        loadPromises.push(
          this.loadWastedTime(player).catch(err => {
            console.warn('[LoadURLPlayers] WastedTime skipped for', player.membershipId, err);
          })
        );
      }

      await Promise.all(loadPromises);
      
      // Load activities for the selected date
      if (this.selectedDate) {
        await this.loadAllFilteredActivities(true);
      }
      
      this.statsDebounce$.next();
      
      // Show success message for permalink loading
      if (playersToLoad.length > 0) {
        this.showSuccessMessage(`Successfully loaded ${playersToLoad.length} player(s) from permalink`);
      }
    } catch (error) {
      console.error('[LoadURLPlayers] Error loading players from URL:', error);
    } finally {
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
    }
  }

  async toggleFavorite(player: PlayerSearchDisplay) {
    if (this.isFavorite(player)) {
      await this.removeFavorite(player.membershipId, player.game);
    } else {
      await this.addFavorite(player);
    }
  }

  getFavoriteKey(account: { membershipId: string; game: 'D1' | 'D2'; membershipType: number }): string {
    return `${account.membershipId}|${account.game}|${account.membershipType}`;
  }

  async addFavorite(player: PlayerSearchDisplay) {
    const favorite: FavoriteAccount = {
      membershipId: player.membershipId,
      membershipType: player.membershipType,
      displayName: player.displayName,
      game: player.game,
      platform: player.platform,
      lastUpdated: new Date().toISOString(),
      compositeKey: this.getFavoriteKey({
        membershipId: player.membershipId,
        game: player.game,
        membershipType: player.membershipType
      })
    };
    await this.activityDb.addFavorite(favorite);
    await this.loadFavorites();
  }

  async removeFavorite(membershipId: string, game: 'D1' | 'D2', membershipType?: number) {
    await this.activityDb.removeFavorite(membershipId, game, membershipType);
    await this.loadFavorites();
  }

  // On API error, set apiAvailable = false and show cached favorites
  async handleApiError(error: any) {
    if (error.status === 503 || error.status === 0) {
      this.apiAvailable = false;
      await this.loadFavorites();
    }
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
    // 1. Prefer perPlatformStats – already filtered to platforms with ≥1 activity.
    if (this.perPlatformStats && this.perPlatformStats.length) {
      const list = this.perPlatformStats
        .filter(s => s.game === game && ((s.totalActivities ?? 0) > 0 || (s.totalTime ?? 0) > 0))
        .map(s => s.platform);
      if (list.length) {
        // Deduplicate while preserving order
        return Array.from(new Set(list));
      }
    }

    // 2. Fallback: derive from selectedPlayers (include all selected players regardless of activity status)
    const platforms = new Set<string>();
    this.selectedPlayers.forEach(player => {
      const isGameMatch = (game === 'D1' && this.isD1Player(player)) ||
                          (game === 'D2' && !this.isD1Player(player));
      if (!isGameMatch) return;

      // Include all selected players for the game, even if they don't have activities yet
      // This ensures D1 accounts show up immediately when selected
      platforms.add(this.getPlatformName(player.membershipType));
    });
    return Array.from(platforms);
  }

  getPlayersByGameAndPlatform(game: string, platform: string): PlayerSearchResult[] {
    return this.selectedPlayers.filter(player => {
      const isGameMatch = (game === 'D1' && this.isD1Player(player)) || 
                         (game === 'D2' && !this.isD1Player(player));
      const isPlatformMatch = this.getPlatformName(player.membershipType) === platform;
      return isGameMatch && isPlatformMatch;
    });
  }

  async searchD1Player(searchTerm: string, membershipType: number) {
    console.log('searchD1Player called', { searchTerm, membershipType });
    if (!searchTerm) {
      this.errorMessage = 'Please enter a username';
      return;
    }

    const key = `d1-${membershipType}-${searchTerm}`;
    this.loading[key] = true;
    this.error[key] = '';
    this.d1SearchResults = []; // Clear previous results
    this.errorMessage = '';

    try {
      const results = await firstValueFrom(this.bungieService.searchD1Player(searchTerm, membershipType));
      if (!results || results.length === 0) {
        this.errorMessage = 'No Destiny 1 player found with that username.';
        return;
      }

      // Map results to PlayerSearchDisplay type
      this.d1SearchResults = results.map(player => ({
        ...player,
        game: 'D1',
        platform: this.getPlatformName(player.membershipType)
      }));
      
      // Show platform picker if we have results
      if (this.d1SearchResults.length > 0) {
        this.showPlatformPicker = true;
      }
    } catch (error: any) {
      console.error('Error searching D1 player:', error);
      if (error.status === 503) {
        this.errorMessage = 'Bungie API is temporarily unavailable. Please try again in a few minutes.';
      } else {
        this.errorMessage = 'Error searching for Destiny 1 player.';
      }
    } finally {
      this.loading[key] = false;
      this.cdr.detectChanges();
    }
  }

  async searchD2Player(searchTerm: string) {
    console.log('searchD2Player called', { searchTerm });
    if (!searchTerm) {
      this.errorMessage = 'Please enter a username';
      return;
    }

    const key = `d2-${searchTerm}`;
    this.loading[key] = true;
    this.error[key] = '';
    this.d2SearchResults = [];
    this.showPlatformPicker = false;
    this.crossSavePlayer = null;
    this.errorMessage = '';

    try {
      // Exact Bungie Name (e.g. Player#1234) – use fast single endpoint
      if (searchTerm.includes('#')) {
        const response = await firstValueFrom(this.bungieService.searchD2Player(searchTerm));
        await this.processExactD2SearchResponse(response);
        return;
      }

      /* ----------------------------------------------
         Prefix search (POST /User/Search/GlobalName/0/)
         1. Retrieve Bungie-net users whose global display name starts with the text.
         2. Each result already contains `destinyMemberships`, so we can flatten
            directly without additional API calls.
      ---------------------------------------------- */

      const prefixResp = await firstValueFrom(this.bungieService.searchUsersPrefix(searchTerm));
      const results = prefixResp?.Response?.searchResults as any[] | undefined;
      if (!prefixResp || prefixResp.ErrorCode !== 1 || !results || results.length === 0) {
        this.errorMessage = 'No Bungie account found with that name.';
        return;
      }

      const players: PlayerSearchDisplay[] = [];
      // Process at most 25 (API default) — still safe for UI
      for (const user of results) {
        const bungieName = `${user.bungieGlobalDisplayName}#${user.bungieGlobalDisplayNameCode}`;
        const memberships = user.destinyMemberships as any[];
        for (const m of memberships) {
          const effectiveType = (m.membershipType === 254 && m.crossSaveOverride && m.crossSaveOverride > 0)
            ? m.crossSaveOverride
            : m.membershipType;

          players.push({
            displayName: bungieName,
            membershipId: m.membershipId,
            membershipType: effectiveType,
            game: 'D2',
            platform: this.getPlatformName(effectiveType),
            isCrossSavePrimary: m.isCrossSavePrimary,
            crossSaveOverride: m.crossSaveOverride
          } as PlayerSearchDisplay);
        }
      }

      if (players.length === 0) {
        this.errorMessage = 'No Destiny memberships found for that name.';
        return;
      }

      // Deduplicate by (game, membershipId) so a Destiny 1 and Destiny 2 account with the same ID are both kept
      const unique = players.filter((p, idx, arr) => {
        const key = `${p.game || 'D2'}|${p.membershipId}`;
        return arr.findIndex(x => `${x.game || 'D2'}|${x.membershipId}` === key) === idx;
      });

      // Identify cross-save primary (if any)
      this.crossSavePlayer = unique.find(p => p.isCrossSavePrimary) || null;

      // Decide whether to show the picker
      if (unique.length > 1 || this.crossSavePlayer) {
        this.showPlatformPicker = true;
      } else if (unique.length === 1) {
        await this.selectPlayer(unique[0]);
      }

    } catch (error: any) {
      console.error('Error searching D2 player (prefix):', error);
      if (error.status === 503) {
        this.errorMessage = 'Bungie API is temporarily unavailable. Please try again later.';
      } else {
        this.errorMessage = 'Error searching for Destiny 2 player.';
      }
    } finally {
      this.loading[key] = false;
      this.cdr.detectChanges();
    }
  }

  // Helper methods
  getPlayerKey(player: PlayerSearchResult | PlayerSearchDisplay): string {
    const game = (player as any).game || 'D2';
    return `${game}|${player.membershipId}`;
  }

  isD1Player(player: PlayerSearchResult | PlayerSearchDisplay): boolean {
    return (player as any).game === 'D1';
  }

  getPlatformName(membershipType: number): string {
    const platformMap: { [key: number]: string } = {
      1: 'Xbox',
      2: 'PlayStation',
      3: 'Steam',
      254: 'Bungie'
    };
    return platformMap[membershipType] || 'Unknown';
  }

  getPlatformId(platform: string): number {
    const platformMap: { [key: string]: number } = {
      'Xbox': 1,
      'PlayStation': 2,
      'Steam': 3,
      'Bungie': 254
    };
    return platformMap[platform] || 1;
  }

  getPlatformIconUrl(platformId: number): string {
    const iconMap: { [key: number]: string } = {
      1: 'assets/icons/platforms/xbox.png',
      2: 'assets/icons/platforms/playstation.png',
      3: 'assets/icons/platforms/steam.png',
      254: 'assets/icons/platforms/bungie.png'
    };
    return iconMap[platformId] || 'assets/icons/platforms/xbox.png';
  }

  async processExactD2SearchResponse(response: any): Promise<void> {
    if (!response || !response.Response || response.Response.length === 0) {
      this.errorMessage = 'No Destiny 2 player found with that username.';
      return;
    }

    const players: PlayerSearchDisplay[] = response.Response.map((user: any) => {
      const memberships = user.destinyMemberships || [];
      return memberships.map((m: any) => ({
        displayName: `${user.bungieGlobalDisplayName}#${user.bungieGlobalDisplayNameCode}`,
        membershipId: m.membershipId,
        membershipType: m.membershipType === 254 && m.crossSaveOverride ? m.crossSaveOverride : m.membershipType,
        game: 'D2',
        platform: this.getPlatformName(m.membershipType === 254 && m.crossSaveOverride ? m.crossSaveOverride : m.membershipType),
        isCrossSavePrimary: m.isCrossSavePrimary,
        crossSaveOverride: m.crossSaveOverride
      } as PlayerSearchDisplay));
    }).flat();

    if (players.length === 0) {
      this.errorMessage = 'No Destiny memberships found for that name.';
      return;
    }

    // Deduplicate
    const unique = players.filter((p, idx, arr) => {
      const key = `${p.game}|${p.membershipId}`;
      return arr.findIndex(x => `${x.game}|${x.membershipId}` === key) === idx;
    });

    this.crossSavePlayer = unique.find(p => p.isCrossSavePrimary) || null;

    if (unique.length > 1 || this.crossSavePlayer) {
      this.d2SearchResults = unique;
      this.showPlatformPicker = true;
    } else if (unique.length === 1) {
      await this.selectPlayer(unique[0]);
    }
  }

  interleavePlayersForConcurrency(d1Players: PlayerSearchDisplay[], d2Players: PlayerSearchDisplay[]): PlayerSearchDisplay[] {
    const result: PlayerSearchDisplay[] = [];
    const maxLength = Math.max(d1Players.length, d2Players.length);
    for (let i = 0; i < maxLength; i++) {
      if (i < d1Players.length) result.push(d1Players[i]);
      if (i < d2Players.length) result.push(d2Players[i]);
    }
    return result;
  }

  updateUrlForPermalink(): void {
    if (this.selectedPlayers.length === 0) return;
    
    const playerData = this.selectedPlayers.map(p => ({
      displayName: p.displayName,
      membershipId: p.membershipId,
      membershipType: p.membershipType,
      game: p.game,
      platform: p.platform
    }));

    const encoded = encodeURIComponent(JSON.stringify(playerData));
    const dateStr = this.selectedDate || `${this.selectedYear}-${this.selectedMonth.toString().padStart(2, '0')}-${this.selectedDay.toString().padStart(2, '0')}`;
    
    this.router.navigate(['/date', dateStr, 'players', encoded], { replaceUrl: true });
  }

  // Parse comma/newline-separated usernames
  parseUsernames(input: string): string[] {
    return input
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);
  }

  // Check if full string matches a single user (fallback for names with commas)
  async fullStringFallbackLooksLikeSingleUser(raw: string): Promise<boolean> {
    try {
      // Try D2 search first (most common)
      const d2Response = await firstValueFrom(this.bungieService.searchD2Player(raw)).catch(() => null);
      if (d2Response && d2Response.Response && d2Response.Response.length > 0) {
        return true;
      }

      // Try D1 searches for Xbox and PlayStation
      const d1Xbox = await firstValueFrom(this.bungieService.searchD1Player(raw, 1)).catch(() => null);
      if (d1Xbox && d1Xbox.length > 0) {
        return true;
      }

      const d1Psn = await firstValueFrom(this.bungieService.searchD1Player(raw, 2)).catch(() => null);
      if (d1Psn && d1Psn.length > 0) {
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[fullStringFallback] Error checking full string:', error);
      return false;
    }
  }

  // Add player by name (used for bulk operations)
  async addPlayerByName(name: string, options?: { accumulate?: boolean }): Promise<void> {
    const accumulate = options?.accumulate ?? false;

    if (!accumulate) {
      this.d1SearchResults = [];
      this.d2SearchResults = [];
      this.crossSavePlayer = null;
    }

    // Search D2
    try {
      if (name.includes('#')) {
        const response = await firstValueFrom(this.bungieService.searchD2Player(name));
        await this.processExactD2SearchResponse(response);
      } else {
        const prefixResp = await firstValueFrom(this.bungieService.searchUsersPrefix(name));
        const results = prefixResp?.Response?.searchResults as any[] | undefined;
        if (prefixResp && prefixResp.ErrorCode === 1 && results && results.length > 0) {
          for (const user of results) {
            const bungieName = `${user.bungieGlobalDisplayName}#${user.bungieGlobalDisplayNameCode}`;
            const memberships = user.destinyMemberships as any[];
            for (const m of memberships) {
              const effectiveType = (m.membershipType === 254 && m.crossSaveOverride && m.crossSaveOverride > 0)
                ? m.crossSaveOverride
                : m.membershipType;

              const player: PlayerSearchDisplay = {
                displayName: bungieName,
                membershipId: m.membershipId,
                membershipType: effectiveType,
                game: 'D2',
                platform: this.getPlatformName(effectiveType),
                isCrossSavePrimary: m.isCrossSavePrimary,
                crossSaveOverride: m.crossSaveOverride
              } as PlayerSearchDisplay;

              if (accumulate) {
                this.d2SearchResults.push(player);
              } else {
                this.d2SearchResults = [player];
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[addPlayerByName] D2 search failed for "${name}":`, error);
    }

    // Search D1 (Xbox and PlayStation)
    for (const membershipType of [1, 2]) {
      try {
        const results = await firstValueFrom(this.bungieService.searchD1Player(name, membershipType));
        if (results && results.length > 0) {
          const players = results.map(player => ({
            ...player,
            game: 'D1',
            platform: this.getPlatformName(player.membershipType)
          } as PlayerSearchDisplay));

          if (accumulate) {
            this.d1SearchResults.push(...players);
          } else {
            this.d1SearchResults = players;
          }
        }
      } catch (error) {
        console.warn(`[addPlayerByName] D1 search failed for "${name}" (platform ${membershipType}):`, error);
      }
    }
  }

  // Main addPlayer method with full-string fallback
  async addPlayer() {
    console.log('addPlayer called with searchUsername:', this.searchUsername);
    
    if (!this.searchUsername) {
      this.errorMessage = 'Please enter a username.';
      return;
    }

    // Bulk add: allow comma/newline-separated usernames for BOTH add mode and initial (replace) search
    if (this.searchUsername.includes(',') || this.searchUsername.includes('\n')) {
      const raw = this.searchUsername.trim();

      // First try full-string fallback: if Bungie returns matches for the entire raw input,
      // treat it as a single username (covers unquoted names that contain commas).
      if (await this.fullStringFallbackLooksLikeSingleUser(raw)) {
        // Leave this.searchUsername as the single raw value and fall through to the single-name search flow
        this.searchUsername = raw;
      } else {
        // No full-string match: fall back to splitting into multiple names (legacy behavior)
        const names = this.parseUsernames(this.searchUsername);
        if (names.length > 1) {
          // If not in add mode, run a one-time clear just like a normal replace search
          if (!this.addMode) {
            console.log('[CLEAR] Bulk initial search clearing all data for replace mode');
            await this.activityDb.clearAllActivities();
            const remainingCount = await this.activityDb.activities.count();
            if (remainingCount > 0) {
              console.error(`[CLEAR] CRITICAL: ${remainingCount} activities still in database after clearing!`);
            } else {
              console.log('[CLEAR] Database completely cleared - verified 0 activities remaining');
            }
            this.clearAllPlayers();
            this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
          }

          // Accumulate results across all names so the modal shows everything at once
          this.d1SearchResults = [];
          this.d2SearchResults = [];
          this.crossSavePlayer = null;
          this.showPlatformPicker = false;

          for (const name of names) {
            await this.addPlayerByName(name, { accumulate: true });
          }

          // Deduplicate merged arrays (existing logic)
          const dedupe = (arr: PlayerSearchDisplay[]) => {
            const seen = new Set<string>();
            const out: PlayerSearchDisplay[] = [];
            for (const p of arr) {
              const key = `${(p as any).game || 'D2'}|${p.membershipId}`;
              if (!seen.has(key)) {
                seen.add(key);
                out.push(p);
              }
            }
            return out;
          };
          this.d1SearchResults = dedupe(this.d1SearchResults);
          this.d2SearchResults = dedupe(this.d2SearchResults);
          this.crossSavePlayer = this.d2SearchResults.find(p => p.isCrossSavePrimary) || null;

          const total = this.d1SearchResults.length + this.d2SearchResults.length + (this.crossSavePlayer ? 1 : 0);
          if (total === 0) {
            this.errorMessage = 'No Destiny accounts found for the provided names.';
          } else if (total === 1) {
            const player = this.crossSavePlayer || this.d2SearchResults[0] || this.d1SearchResults[0];
            await this.selectPlayer(player);
          } else {
            this.showPlatformPicker = true;
            this.focusFirstElementInModal('.modal.show');
          }

          this.searchUsername = '';
          return;
        }
      }
    }

    // Single username search (or full-string fallback matched)
    this.errorMessage = '';
    this.d1SearchResults = [];
    this.d2SearchResults = [];
    this.crossSavePlayer = null;
    this.showPlatformPicker = false;

    const searchTerm = this.searchUsername.trim();

    // If not in add mode, clear existing data
    if (!this.addMode && this.selectedPlayers.length > 0) {
      console.log('[CLEAR] Single search clearing all data for replace mode');
      await this.activityDb.clearAllActivities();
      const remainingCount = await this.activityDb.activities.count();
      if (remainingCount > 0) {
        console.error(`[CLEAR] CRITICAL: ${remainingCount} activities still in database after clearing!`);
      } else {
        console.log('[CLEAR] Database completely cleared - verified 0 activities remaining');
      }
      this.clearAllPlayers();
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }

    // Search both D1 and D2
    await this.addPlayerByName(searchTerm, { accumulate: true });

    // Deduplicate
    const dedupe = (arr: PlayerSearchDisplay[]) => {
      const seen = new Set<string>();
      const out: PlayerSearchDisplay[] = [];
      for (const p of arr) {
        const key = `${(p as any).game || 'D2'}|${p.membershipId}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(p);
        }
      }
      return out;
    };
    this.d1SearchResults = dedupe(this.d1SearchResults);
    this.d2SearchResults = dedupe(this.d2SearchResults);
    this.crossSavePlayer = this.d2SearchResults.find(p => p.isCrossSavePrimary) || null;

    const total = this.d1SearchResults.length + this.d2SearchResults.length + (this.crossSavePlayer ? 1 : 0);
    if (total === 0) {
      this.errorMessage = 'No Destiny accounts found with that username.';
    } else if (total === 1) {
      const player = this.crossSavePlayer || this.d2SearchResults[0] || this.d1SearchResults[0];
      await this.selectPlayer(player);
    } else {
      this.showPlatformPicker = true;
      this.focusFirstElementInModal('.modal.show');
    }

    this.searchUsername = '';
  }

  // UI helper methods
  onSearchInput(value: string): void {
    this.searchUsername = value;
    this.errorMessage = '';
  }

  toggleAddMode(): void {
    this.addMode = !this.addMode;
    this.cdr.detectChanges();
  }

  clearAllPlayers(): void {
    this.selectedPlayers = [];
    this.selectedCharacterIds = {};
    this.characters = {};
    this.activities = {};
    this.loading = {};
    this.error = {};
    this.groupedActivitiesByAccount = [];
    this.filteredActivitiesForDate = [];
    this.accountStats = {
      totalTime: 0,
      totalActivityTime: 0,
      totalActivityCount: 0,
      totalSeals: 0,
      perType: {}
    };
    this.guardianFirsts = [];
    this.playerTitles = {};
    this.firstFullSyncDone = false;
    this.syncedPlayers.clear();
    this.accountLoadingStatus.clear();
    this.accountLoadingStatuses = [];
    this.clearCache();
    this.updateUrlForPermalink();
    this.cdr.detectChanges();
  }

  removePlayer(index: number): void {
    if (index >= 0 && index < this.selectedPlayers.length) {
      const player = this.selectedPlayers[index];
      delete this.selectedCharacterIds[player.membershipId];
      delete this.characters[this.getPlayerKey(player)];
      delete this.activities[this.getPlayerKey(player)];
      this.selectedPlayers.splice(index, 1);
      this.updateUrlForPermalink();
      this.cdr.detectChanges();
    }
  }

  selectAllPlayersInModal(): void {
    // Select all players in the platform picker modal
    // This would need to be implemented based on your modal structure
    console.log('selectAllPlayersInModal called');
  }

  clearModalSelection(): void {
    // Clear selection in modal
    console.log('clearModalSelection called');
  }

  addSelectedToFavorites(): void {
    // Add selected players to favorites
    console.log('addSelectedToFavorites called');
  }

  getSelectedCount(): number {
    // Return count of selected players in modal
    return 0;
  }

  getTotalCount(): number {
    // Return total count of players in modal
    return this.d1SearchResults.length + this.d2SearchResults.length;
  }

  clearCache(): void {
    this.activityCache.clear();
    this.filteredActivitiesCache.clear();
    this.activitiesCache.clear();
  }

  showSuccessMessage(message: string): void {
    // Simple implementation - you might want to use a toast service
    console.log(message);
    this.errorMessage = '';
  }

  selectPlatformPlayer(player: PlayerSearchDisplay) {
    this.showPlatformPicker = false;

    this.selectPlayer(player);
  }

  async selectPlayer(player: PlayerSearchResult) {
    // Check profile limit
    if (this.selectedPlayers.length >= 10) {
      this.errorMessage = 'Maximum of 10 profiles allowed. Please remove some profiles before adding more.';
      return;
    }

    // If we're in add mode or already have selected players, append the new
    // account instead of wiping the whole state. This lets users build
    // a multi-account view incrementally.

    if (this.addMode || this.selectedPlayers.length > 0) {
      await this.appendPlayer(player as any);
      return;
    }

    // Hide the platform picker
    this.showPlatformPicker = false;

    // Check if the exact (game, membershipId) combo is already selected
    const incomingGame = (player as any).game || 'D2'; // Default to D2 if not specified
    if (this.selectedPlayers.some(p => p.membershipId === player.membershipId && p.game === incomingGame)) {
      return;
    }

    // Clear previous activity data
    this.activities = {};
    this.characters = {};
    this.selectedCharacterIds = {};
    this.groupedActivitiesByAccount = [];
    this.processedActivities = [];
    this.filteredActivities$.next([]);
    this.filteredActivitiesForDate = [];
    this.accountStats = {
      totalTime: 0,
      totalActivityTime: 0,
      totalActivityCount: 0,
      totalSeals: 0,
      perType: {}
    };
    this.guardianFirsts = [];
    this.playerTitles = {};
    // Reset initial-sync tracking
    this.firstFullSyncDone = false;
    this.syncedPlayers.clear();

    // Clear all loading statuses when selecting a new player
    this.accountLoadingStatus.clear();
    this.accountLoadingStatuses = [];

    // Use the game property from the player object (should be set by search methods)
    const displayPlayer: PlayerSearchDisplay = {
      ...player,
      game: (player as any).game || 'D2', // Default to D2 if not specified
      platform: this.getPlatformName(player.membershipType),
      isPrimary: true
    };
    this.selectedPlayers = [displayPlayer];
    this.selectedCharacterIds[player.membershipId] = undefined;

    // Add to selected accounts service for Analytics component
    const acc: PlatformAccount = {
      platformType: player.membershipType,
      membershipId: player.membershipId,
      displayName: player.displayName,
      platformGroups: [],
    };
    this.selectedAccounts.add(acc);



    // Ensure a date is selected (use full YYYY-MM-DD format for better date handling)
    if (!this.selectedDate) {
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      const year = today.getFullYear();
      this.selectedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    // Set loading state for the selected date
    this.loadingActivities[this.selectedDate] = true;
    this.cdr.detectChanges();

    try {
      // Reset running counter for progress UI
      this.overallActivitiesProcessed = 0;

      // Optimized concurrent loading: Separate D1 and D2 players for better parallelization
      const d1Players = this.selectedPlayers.filter(p => this.isD1Player(p));
      const d2Players = this.selectedPlayers.filter(p => !this.isD1Player(p));
      
      // Load D1 and D2 players concurrently with equal priority
      const loadPromises: Promise<void>[] = [];
      
      // Process D1 and D2 players in parallel with interleaving for optimal concurrency
      // This ensures D1 players don't wait for D2 players to finish
      const allPlayers = this.interleavePlayersForConcurrency(d1Players, d2Players);
      
      for (const pl of allPlayers) {
        // Use the concurrency-limited runner so only N accounts are being
        // crawled at the same time.  Each player sync includes character
        // history + guardian firsts + dungeon solo firsts serially.
        loadPromises.push(
          this.runWithPlayerSyncLimit(async () => {
            try {
              await this.loadCharacterHistory(pl);
              await this.loadGuardianFirsts(pl);
              await this.loadDungeonSoloFirsts(pl);
              
              // Debug: Check what activities are actually in the database for this player
              await this.activityDb.debugPlayerActivities(pl.membershipId);
            } catch (err) {
              console.warn('[LoadCharacterHistory/Firsts] Skipped due to error for', pl.membershipId, err);
            }
          })
        );
        // Wasted time can load in parallel
        loadPromises.push(
          this.loadWastedTime(pl).catch(err => {
            console.warn('[LoadWastedTime] Skipped due to error for', pl.membershipId, err);
          })
        );
      }
      await Promise.all(loadPromises);
      // After loading character history, trigger activity loading if we have a date selected
      if (this.selectedDate) {
        await this.loadAllFilteredActivities(true);
      }
      this.statsDebounce$.next();

      // Mark all accounts as complete
      // Note: Accounts will be marked as complete after rendering is finished in loadAllFilteredActivities
    } catch (error) {
      this.selectedPlayers = [];
      delete this.selectedCharacterIds[player.membershipId];
      throw error;
    } finally {
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Appends a player to the current dashboard without clearing any existing
   * state.  Internally mirrors the logic used for the "rest" accounts in
   * selectAllPlayersInModal().
   */
  private async appendPlayer(player: PlayerSearchDisplay) {
    // Close the search modal immediately so the user sees the existing
    // dashboard while the newly-queued account syncs in the background.
    this.showPlatformPicker = false;

    const incomingGame = (player as any).game || 'D2'; // Default to D2 if not specified

    // Deduplicate: no-op if this (game,id) combo is already present.
    if (this.selectedPlayers.some(p => p.membershipId === player.membershipId && p.game === incomingGame)) {
      return;
    }

    const displayPlayer: PlayerSearchDisplay = {
      ...player,
      game: incomingGame,
      platform: this.getPlatformName(player.membershipType),
      isPrimary: false
    } as any;

    this.selectedPlayers.push(displayPlayer);
    this.selectedCharacterIds[displayPlayer.membershipId] = undefined;

    // Update URL for permalink sharing
    this.updateUrlForPermalink();

    // Ensure UI reflects the newly added chip immediately.
    this.updatePlatformTabs();
    this.cdr.detectChanges();
    
    // Clear loading statuses for all accounts when appending a new player
    this.accountLoadingStatus.clear();
    this.accountLoadingStatuses = [];

    try {
      // Clear date-scoped aggregates to avoid mixing prior users' rows
      this.filteredActivitiesForDate = [];
      this.filteredActivities$.next([]);
      this.groupedActivitiesByAccount = [];

      await this.runWithPlayerSyncLimit(async () => {
        await this.loadCharacterHistory(displayPlayer);
        await this.loadGuardianFirsts(displayPlayer);
        await this.loadDungeonSoloFirsts(displayPlayer);
      });

      // Wasted-on-Destiny can run in parallel and isn't bound to the
      // concurrency semaphore because it hits a different host.
      this.loadWastedTime(displayPlayer).catch(err => console.warn('[appendPlayer] WastedTime skipped', err));

      // Refresh per-day activity list & stats.
      if (this.selectedDate) {
        await this.loadAllFilteredActivities(true);
      }
      // Recompute account summary promptly when a new account is appended
      this.statsDebounce$.next();

    } catch (err) {
      console.warn('[appendPlayer] Failed to load new player', err);
    }

    // Mark as synced so selectAll/initial gate logic remains correct.
    this.syncedPlayers.add(this.getPlayerKey(displayPlayer));

    if (this.firstFullSyncDone && this.selectedDate) {
      // Refresh activities once more so aggregates include the new player
      await this.loadAllFilteredActivities(true);
    }

    // Also push into global SelectedAccountsService so other components can react.
    const acc: PlatformAccount = {
      platformType: player.membershipType,
      membershipId: player.membershipId,
      displayName: player.displayName,
      platformGroups: [],
    };
    this.selectedAccounts.add(acc);

    // Clear memoised getters and trigger change-detection so Activities & Firsts
    // immediately include the newly added account.
    this.refreshComputedViews();
  }
  /** Clears memoisation caches and marks the view for check. */
  private refreshComputedViews(): void {
    this.invalidateMemoCaches();
    this.cdr.markForCheck();
  }

  /**
   * Cancel any ongoing background operations to prevent interference with new searches
   */
  private cancelBackgroundOperations(): void {
    console.log('[CLEAR] Cancelling background operations');
    
    // Cancel any pending timers
    if (this.updateBatchTimer) {
      clearTimeout(this.updateBatchTimer);
      this.updateBatchTimer = null;
    }
    
    // Cancel any ongoing background processing by incrementing load token
    // This will cause any ongoing loads to abort when they check the token
    this.currentLoadToken++;
    
    // Reset background processing flags
    this.pendingActivityUpdates = false;
    this.showBackgroundProcessingIndicator = false;
    
    // Clear any pending activity updates
    this.pendingActivityUpdates = false;
    
    console.log('[CLEAR] Background operations cancelled, new load token:', this.currentLoadToken);
  }

  /**
   * Clear player-specific caches to prevent leftover data
   */
  private clearPlayerSpecificCaches(): void {
    console.log('[CLEAR] Clearing player-specific caches');
    
    // Clear activity cache entries for all current players
    for (const player of this.selectedPlayers) {
      const playerKey = this.getPlayerKey(player);
      this.activityCache.delete(playerKey);
    }
    
    // Clear any cached character data
    Object.keys(this.characters).forEach(key => {
      delete this.characters[key];
    });
    
    // Clear any cached activities data
    Object.keys(this.activities).forEach(key => {
      delete this.activities[key];
    });
    
    console.log('[CLEAR] Player-specific caches cleared');
  }

  /** Wipe all memoised getters so newly added players appear immediately. */
  private invalidateMemoCaches(): void {
    // Clear any cached computed values
    // This method is kept for future memoization implementation
    // Currently no memoization is in use, so this is a no-op
  }
  async loadCharacterHistory(player: PlayerSearchResult | PlayerSearchDisplay) {
    console.log('loadCharacterHistory called', { player });
    const key = `characters-${this.getPlayerKey(player)}`;
    this.loading[key] = true;
    this.error[key] = '';
    
    const accountKey = this.getPlayerKey(player);
      const isD1 = this.isD1Player(player);
    const game = isD1 ? 'D1' : 'D2';
    const platform = this.getPlatformName(player.membershipType);
    
    try {
      // Update status: fetching profile
      this.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        game,
        player.membershipType,
        'fetching-profile',
        `Fetching ${game} profile for ${player.displayName}...`
      );

      if (isD1) {
        // D1: characterId is under characterBase.characterId
        const profile = await firstValueFrom(this.bungieService.getD1Profile(player.membershipType, player.membershipId));
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }
        
        // Update status: loading characters
        this.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'loading-characters',
          `Loading ${game} characters for ${player.displayName}...`
        );
        
        this.characters[this.getPlayerKey(player)] = profile.Response.data?.characters || [];
        // Set the first character as selected if we have characters
        if (this.characters[this.getPlayerKey(player)].length > 0) {
          // D1: characterBase.characterId
          this.selectedCharacterIds[player.membershipId] = getCharacterId(this.characters[this.getPlayerKey(player)][0]) || '';
        }
        
        // Update status: fetching activities
        this.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'fetching-activities',
          `Fetching ${game} activities for ${player.displayName}...`
        );
        
        // Load D1 activities concurrently for all characters
        const characterLoadPromises = this.characters[this.getPlayerKey(player)].map(async (char) => {
          const charId = getCharacterId(char);
          if (!charId) return; // Defensive: skip if no valid ID
          return this.loadActivityHistoryForCharacter({
            characterId: charId,
            membershipType: player.membershipType,
            membershipId: player.membershipId,
            game: 'D1'
          });
        });
        
        // Wait for all D1 character activities to load concurrently
        await Promise.all(characterLoadPromises.filter(Boolean));
      } else {
        // D2: characterId is top-level
        const profile = await firstValueFrom(this.bungieService.getProfile(player.membershipType, player.membershipId));
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }
        
        // Update status: loading characters
        this.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'loading-characters',
          `Loading ${game} characters for ${player.displayName}...`
        );
        
        const characters = Object.values(profile.Response.characters?.data || {}) as Array<{ characterId: string }>;
        this.characters[this.getPlayerKey(player)] = characters;
        // Set the first character as selected if we have characters
        if (characters.length > 0) {
          this.selectedCharacterIds[player.membershipId] = getCharacterId(characters[0]) || '';
        }
        
        // Update status: fetching activities
        this.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'fetching-activities',
          `Fetching ${game} activities for ${player.displayName}...`
        );
        
        // Load D2 activities concurrently for all characters
        const characterLoadPromises = characters.map(async (char) => {
          const charId = getCharacterId(char);
          if (!charId) return; // Defensive: skip if no valid ID
          return this.loadActivityHistoryForCharacter({
            characterId: charId,
            membershipType: player.membershipType,
            membershipId: player.membershipId,
            game: 'D2'
          });
        });
        
        // Wait for all D2 character activities to load concurrently
        await Promise.all(characterLoadPromises.filter(Boolean));
      }
      
      // Update status: organizing data
      this.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        game,
        player.membershipType,
        'organizing-pgcrs',
        `Organizing ${game} data for ${player.displayName}...`
      );
      
    } catch (error: any) {
      console.error('Error loading character history:', error);
      
      // Update status: error
      this.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        game,
        player.membershipType,
        'error',
        `Error loading ${game} data for ${player.displayName}`
      );
      
      if (error.status === 503) {
        this.error[key] = 'Bungie API is temporarily unavailable. Please try again in a few minutes.';
      } else {
        this.error[key] = 'Error loading character history';
      }
      // Swallow 5xx errors so linked accounts that are disabled don't break flow
      if (error.status && error.status >= 500) {
        console.warn('[loadCharacterHistory] Ignoring server error for', player.membershipId);
        return;
      }
      throw error;
    } finally {
      this.loading[key] = false;
    }
  }

  private async validatePGCRBatch(
    activities: ActivityHistory[],
    character: CharacterWithGame,
    startIdx: number
  ): Promise<ActivityHistory[]> {
    const batch = activities.slice(startIdx, startIdx + this.PGCR_BATCH_SIZE);
    const validatedActivities: ActivityHistory[] = [];
    
    // Log the character we're looking for with full details
    if (environment.debug) {
    console.log(`[DEBUG] Looking for character in PGCRs:`, {
      membershipId: character.membershipId,
      characterId: character.characterId,
      game: character.game,
      membershipType: character.membershipType,
      platform: this.getPlatformName(character.membershipType)
    });
    }
    
    // Create array of PGCR fetch promises with metadata
    const pgcrPromises = batch.map(activity => {
      const instanceId = activity.activityDetails?.instanceId;
      if (!instanceId) {
        if (environment.debug) {
        console.warn('[DEBUG] Activity missing instanceId:', activity);
        }
        return null;
      }
      
      // First attempt to retrieve a cached, pruned PGCR. If not found we hit
      // Bungie's API, then store the result for future look-ups.
      return {
        promise: (async () => {
          const cached = character.game === 'D1'
            ? await this.pgcrCacheService.getD1PGCR(instanceId)
            : await this.pgcrCacheService.getD2PGCR(instanceId);

          if (cached) {
            return cached as any;
          }

          // Not cached – fetch from Bungie and persist.
          const fetched = await firstValueFrom(
            this.bungieService.getPGCR(instanceId, character.game === 'D1')
          );

          if (character.game === 'D1') {
            await this.pgcrCacheService.cacheD1PGCR(instanceId, fetched);
          } else {
            await this.pgcrCacheService.cacheD2PGCR(instanceId, fetched);
          }

          return fetched;
        })(),
        activity,
        instanceId
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    // Use Promise.allSettled for more robust error handling
    const results = await Promise.allSettled(pgcrPromises.map(p => p.promise));

    // Process results and match with activities
    results.forEach((result, index) => {
      const { activity, instanceId } = pgcrPromises[index];
      
      if (result.status === 'fulfilled' && result.value) {
        const pgcr = result.value;
        
        // Enhanced debug logging for PGCR entries
        if (!pgcr.entries || !Array.isArray(pgcr.entries) || pgcr.entries.length === 0) {
          if (environment.debug) {
          console.warn(`[DEBUG] PGCR ${instanceId} has no entries (undefined or empty). Marking as unavailable.`);
          }
          validatedActivities.push({
            ...activity,
            pgcrUnavailable: true
          });
          return;
        }
        if (environment.debug) {
        console.log(`[DEBUG] Processing PGCR ${instanceId}:`, {
          entries: pgcr.entries.map((e: any) => ({
            membershipId: e.player?.destinyUserInfo?.membershipId,
            characterId: e.characterId,
            displayName: e.player?.destinyUserInfo?.displayName,
            membershipType: e.player?.destinyUserInfo?.membershipType,
            platform: this.getPlatformName(e.player?.destinyUserInfo?.membershipType)
          }))
        });
        }