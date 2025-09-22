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
import { BackgroundProcessingService, ProcessingState } from '../../services/background-processing.service';
import { WorkerService, WorkerResponse } from '../../services/worker.service';

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
  typeGroups: Map<string, TypeGroup>;
}

interface AccountGroup {
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  yearGroups: Map<string, YearGroup>;
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
  'the edge of fate': 37,
  'sharpshooter': 37,
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
  lightLevel?: number;       // Character light / power
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

  // Background processing state
  backgroundProcessingState: ProcessingState = {
    isProcessing: false,
    isPaused: false,
    progress: 0,
    currentBatch: 0,
    totalBatches: 0,
    isBackground: false
  };
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
  
  // Web Worker related properties
  private workerProcessing = false;
  private workerQueue: Array<() => void> = [];
  private workerDisabled = false; // Disable workers if they cause issues

  // Phase 4: UI Rendering Optimization - TrackBy Functions
  /**
   * TrackBy function for activities to optimize ngFor performance
   */
  trackByActivity: TrackByFunction<ActivityHistory> = (index: number, activity: ActivityHistory): string => {
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
  trackByAccountGroup: TrackByFunction<AccountGroup> = (index: number, group: AccountGroup): string => {
    return `${group.displayName}_${group.platform}_${group.game}`;
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

  private initializeWorker(): void {
    if (this.workerService.isWorkerAvailable()) {
      this.workerService.messages$.subscribe((response: WorkerResponse | null) => {
        if (response) {
          this.handleWorkerResponse(response);
        }
      });
    }
  }

  private handleWorkerResponse(response: WorkerResponse): void {
    // Clear any pending timeout
    if ((this as any).workerTimeoutId) {
      clearTimeout((this as any).workerTimeoutId);
      (this as any).workerTimeoutId = null;
    }

    switch (response.type) {
      case 'ACTIVITIES_PROCESSED':
        this.handleProcessedActivities(response.data);
        break;
      case 'STATS_CALCULATED':
        this.handleCalculatedStats(response.data);
        break;
      case 'FIRSTS_PROCESSED':
        this.handleProcessedFirsts(response.data);
        break;
      case 'DISPLAY_DATA_PROCESSED':
        this.handleDisplayDataProcessed(response.data);
        break;
      case 'ERROR':
        console.error('[Worker] Error response:', response.data);
        this.workerProcessing = false;
        // Disable workers after error and fallback to main thread
        this.workerDisabled = true;
        console.warn('[Worker] Workers disabled due to error, using main thread processing');
        this.processInMainThread(this.filteredActivitiesForDate.length);
        break;
      default:
        console.warn('[Worker] Unknown response type:', response.type);
        this.workerProcessing = false;
    }
  }

  private handleProcessedActivities(data: any): void {
    // Handle processed activities from worker
    console.log('[Worker] Activities processed:', data.length);
    this.workerProcessing = false;
    this.processWorkerQueue();
  }

  private handleCalculatedStats(data: any): void {
    // Handle calculated stats from worker
    console.log('[Worker] Stats calculated:', data);
    this.workerProcessing = false;
    this.processWorkerQueue();
  }

  private handleProcessedFirsts(data: any): void {
    // Handle processed firsts from worker
    console.log('[Worker] Firsts processed:', data);
    this.workerProcessing = false;
    this.processWorkerQueue();
  }

  private handleDisplayDataProcessed(data: any): void {
    // Handle display data from worker
    console.log('[Worker] Display data processed:', data);
    this.groupedActivitiesByAccount = data.grouped;
    this.cdr.detectChanges();
    this.workerProcessing = false;
    this.processWorkerQueue();
  }

  private processWorkerQueue(): void {
    if (this.workerQueue.length > 0 && !this.workerProcessing) {
      const task = this.workerQueue.shift()!;
      task();
    }
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
    public backgroundProcessing: BackgroundProcessingService,
    private workerService: WorkerService,
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
    // Initialize Web Worker
    this.initializeWorker();
    
    // Subscribe to background processing state
    this.backgroundProcessing.getProcessingState().subscribe(state => {
      this.backgroundProcessingState = state;
      this.showBackgroundProcessingIndicator = state.isProcessing || state.isBackground;
      this.cdr.markForCheck();
    });

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
        console.log('[DEBUG] Loading filtered activities for newly added player:', displayPlayer.displayName, 'on date:', this.selectedDate);
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

        // Determine if the PGCR belongs to the player: membershipId match is sufficient
        const playerInPgcr = pgcr.entries.some((entry: PGCREntry) => {
          return entry.player?.destinyUserInfo?.membershipId === character.membershipId;
        });

        if (playerInPgcr) {
          console.log(`[DEBUG] Successfully validated activity ${instanceId} for player ${character.membershipId}`);
          validatedActivities.push({
            ...activity,
            validated: true,
            validatedAt: new Date().toISOString(),
            // Attach character class of the matching entry so the UI can render the icon
            characterClass: (pgcr.entries.find((entry: PGCREntry) => (
              (entry.player?.destinyUserInfo?.membershipId === character.membershipId && entry.characterId === character.characterId) ||
              (entry.player?.destinyUserInfo?.membershipId === character.membershipId) ||
              (entry.characterId === character.characterId) ||
              (entry.player?.destinyUserInfo?.membershipType === character.membershipType && entry.player?.destinyUserInfo?.membershipId === character.membershipId)
            ))?.player?.characterClass) || activity.characterClass
          });
        } else {
          console.warn(`[DEBUG] Player ${character.membershipId} not found in PGCR ${instanceId}`);
        }
      } else {
        const error = result.status === 'rejected' ? result.reason : 'Unknown error';
        console.warn(`[DEBUG] Failed to fetch PGCR ${instanceId}:`, error);
        
        // If it's a D1 activity and we got a 500 error, we might want to try the D2 endpoint
        if (character.game === 'D1' && error.status === 500) {
          console.log(`[DEBUG] Attempting to fetch D1 activity ${instanceId} using D2 endpoint`);
          // TODO: Implement fallback to D2 endpoint if needed
        }
      }
    });

    return validatedActivities;
  }

  private async fetchActivitiesWithRetry(
    character: CharacterWithGame,
    page: number,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<ActivityHistory[]> {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        if (character.game === 'D1') {
          const response = await firstValueFrom(
            this.bungieService.getD1ActivityHistory(
              character.membershipType,
              character.membershipId,
              character.characterId,
              character.mode || 0,
              page
            )
          );
          
          // Validate D1 response structure
          if (!response?.data?.activities) {
            console.warn('[DEBUG] Invalid D1 activity response structure:', response);
            return [];
          }

          // Filter out activities missing required fields
          const validStructureActivities = response.data.activities.filter((activity: ActivityHistory) => {
            const hasRequiredFields = Boolean(
              activity.period && 
              activity.activityDetails?.instanceId
            );
            
            if (!hasRequiredFields) {
              console.warn('[DEBUG] D1 activity missing required fields:', activity);
            }
            
            return hasRequiredFields;
          });

          // Get already validated activities from DB
          const dbActivities = await this.activityDb.getAllActivitiesForCharacter(
            character.membershipId,
            character.characterId
          );
          const dbInstanceIds = new Set(dbActivities.map(a => a.activityDetails?.instanceId));

          // Only validate activities not already in DB
          const toValidate = validStructureActivities.filter((a: ActivityHistory) => !dbInstanceIds.has(a.activityDetails?.instanceId));

          // Log raid activities
          const raidActivities = toValidate.filter((activity: ActivityHistory) => {
            const mode = activity.activityDetails?.mode;
            return mode === 3; // Raid mode
          });
          // console.log('[DEBUG] D1 Raid activities found:', {
          //   total: toValidate.length,
          //   raids: raidActivities.length,
          //   raidActivities: raidActivities.map((a: ActivityHistory) => ({
          //     period: a.period,
          //     mode: a.activityDetails?.mode,
          //     instanceId: a.activityDetails?.instanceId,
          //     completed: a.values?.completed?.basic?.value
          //   }))
          // });

          return toValidate;
        } else {
          const response = await firstValueFrom(
            // Correct parameter order: mode first, then page index
            this.bungieService.getActivityHistory(
              character.membershipType,
              character.membershipId,
              character.characterId,
              character.mode,   // mode parameter (optional)
              page              // page index for pagination
            )
          );

          // Validate D2 response structure
          if (!response?.Response?.activities) {
            // console.warn('[DEBUG] Invalid D2 activity response structure:', response);
            return [];
          }

          // For D2, we trust the API to return correct activities
          const validActivities = response.Response.activities.filter((activity: ActivityHistory) => {
            if (!activity.period || !activity.activityDetails?.instanceId) {
              console.warn('[DEBUG] D2 activity missing required fields:', activity);
              return false;
            }
            return true;
          });

          // Log raid activities
          const raidActivities = validActivities.filter((activity: ActivityHistory) => {
            const mode = activity.activityDetails?.mode;
            return mode === 4; // Raid mode
          });
          // console.log('[DEBUG] D2 Raid activities found:', {
          //   total: validActivities.length,
          //   raids: raidActivities.length,
          //   raidActivities: raidActivities.map((a: ActivityHistory) => ({
          //     period: a.period,
          //     mode: a.activityDetails?.mode,
          //     referenceId: a.activityDetails?.referenceId,
          //     instanceId: a.activityDetails?.instanceId,
          //     completed: a.values?.completed?.basic?.value
          //   }))
          // });

          return validActivities;
        }
      } catch (error) {
        console.error(`[DEBUG] Activity fetch error (attempt ${retries + 1}/${maxRetries}):`, error);
        retries++;
        if (retries === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * retries));
      }
    }
    return [];
  }

  private async processActivityBatch(activities: ActivityHistory[], character: CharacterWithGame): Promise<void> {
    const existingIds = new Set(
      (await this.activityDb.getAllActivitiesForCharacter(character.membershipId, character.characterId))
        .map(a => a.activityDetails?.instanceId)
    );

    const newActivities = activities.filter(activity => {
      const isNew = !existingIds.has(activity.activityDetails?.instanceId);
      if (isNew) {
        console.log('[DEBUG] New activity found:', {
          period: activity.period,
          mode: activity.activityDetails?.mode,
          referenceId: activity.activityDetails?.referenceId,
          instanceId: activity.activityDetails?.instanceId,
          completed: activity.values?.completed?.basic?.value,
          isRaid: activity.activityDetails?.mode === (character.game === 'D1' ? 3 : 4)
        });
      }
      return isNew;
    });

    if (newActivities.length > 0) {
      const storedActivities: StoredActivity[] = newActivities.map(activity => ({
        ...activity,
        membershipId: character.membershipId,
        characterId: character.characterId,
        instanceId: activity.activityDetails?.instanceId,
        mode: activity.activityDetails?.mode
      }));
      
      console.log('[DEBUG] Storing activities:', {
        total: storedActivities.length,
        raids: storedActivities.filter(a => a.activityDetails?.mode === (character.game === 'D1' ? 3 : 4)).length,
        sample: storedActivities.slice(0, 3).map(a => ({
          period: a.period,
          mode: a.activityDetails?.mode,
          referenceId: a.activityDetails?.referenceId,
          instanceId: a.activityDetails?.instanceId,
          completed: a.values?.completed?.basic?.value
        }))
      });
      
      await this.activityDb.addActivities(storedActivities);
      // Update totals in background (no await to avoid slowing batch loop)
      this.statsDebounce$.next();
      console.log(`[DEBUG] Stored ${storedActivities.length} new activities for character ${character.characterId} (${character.game})`);
      this.cdr.detectChanges();
    }
  }

  private validateDateRanges(activities: ActivityHistory[], character: CharacterWithGame): void {
    if (activities.length === 0) {
      console.log(`[DEBUG] No activities to validate for character ${character.characterId}`);
      return;
    }

    // Sort activities by date
    const sortedActivities = [...activities].sort((a, b) => 
      new Date(a.period).getTime() - new Date(b.period).getTime()
    );

    // Get date range
    const firstDate = new Date(sortedActivities[0].period);
    const lastDate = new Date(sortedActivities[sortedActivities.length - 1].period);
    
    console.log(`[DEBUG] Activity date range for character ${character.characterId}:`, {
      firstDate: firstDate.toISOString(),
      lastDate: lastDate.toISOString(),
      totalActivities: activities.length
    });

    // Check for gaps larger than 30 days
    const GAP_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const gaps: { start: Date; end: Date; duration: number }[] = [];

    for (let i = 0; i < sortedActivities.length - 1; i++) {
      const currentDate = new Date(sortedActivities[i].period);
      const nextDate = new Date(sortedActivities[i + 1].period);
      const gap = nextDate.getTime() - currentDate.getTime();

      if (gap > GAP_THRESHOLD) {
        gaps.push({
          start: currentDate,
          end: nextDate,
          duration: gap
        });
      }
    }

    if (gaps.length > 0) {
      console.log(`[DEBUG] Found ${gaps.length} gaps in activity history for character ${character.characterId}:`);
      gaps.forEach(gap => {
        console.log(`[DEBUG] Gap from ${gap.start.toISOString()} to ${gap.end.toISOString()} (${Math.round(gap.duration / (24 * 60 * 60 * 1000))} days)`);
      });
    } else {
      console.log(`[DEBUG] No significant gaps found in activity history for character ${character.characterId}`);
    }

    // Check for expected date range based on game
    const gameReleaseDate = character.game === 'D1' 
      ? new Date('2014-09-09T00:00:00Z') 
      : new Date('2017-09-06T00:00:00Z');
    
    if (firstDate.getTime() > gameReleaseDate.getTime()) {
      console.log(`[DEBUG] WARNING: First activity (${firstDate.toISOString()}) is after game release date (${gameReleaseDate.toISOString()})`);
    }
  }

  private async loadActivityHistoryForCharacter(character: CharacterWithGame): Promise<void> {
    const loadingKey = `${character.membershipId}-${character.characterId}`;
    this.loadingActivities[loadingKey] = true;
    
    // Update account loading status for this character
    if (character.game) {
      const accountKey = `${character.membershipId}-${character.game}`;
      const existingStatus = this.accountLoadingStatus.get(accountKey);
      if (existingStatus) {
        this.updateAccountLoadingStatus(
          accountKey,
          existingStatus.displayName,
          existingStatus.platform,
          character.game,
          character.membershipType,
          'fetching-activities',
          `Fetching ${character.game} activities for ${existingStatus.displayName}...`
        );
      }
    }
    
    try {
      const dbActivities = await this.activityDb.getAllActivitiesForCharacter(
        character.membershipId,
        character.characterId
      );

      let newActivities: StoredActivity[] = [];
      
      // Select mode list based on game to minimize unnecessary API calls.
      // Destiny 1 requires individual mode pagination, Destiny 2 can use
      // a single aggregated request (mode undefined) which Bungie returns
      // with all activities.
      const modes: (number | undefined)[] = character.game === 'D1'
        ? [6, 4]          // PvE and PvP cover all activity types
        : [undefined];     // D2: single request gets all modes

      // Process modes in parallel for faster loading
      const modePromises = modes.map(async (mode) => {
        const modeActivities: StoredActivity[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          const activities = await this.fetchActivitiesWithRetry(
            { ...character, mode },
            page
          );
          
          if (!activities || activities.length === 0) {
            hasMore = false;
            continue;
          }

          const storedActivities: StoredActivity[] = activities.map(activity => ({
            ...activity,
            membershipId: character.membershipId,
            characterId: character.characterId,
            instanceId: activity.activityDetails?.instanceId,
            mode: activity.activityDetails?.mode,
            game: character.game // ensure we persist which game this activity belongs to
          }));

          modeActivities.push(...storedActivities);

          // Count every activity we fetched toward the progress display, even if it was already cached
          this.overallActivitiesProcessed += storedActivities.length;

          // Emit progress before heavy processing so user sees immediate feedback
          const percent = ((page + 1) / (page + 2)) * 100;
          this.updateLoadingProgress(
            'fetch',
            percent,
            100,
            `Fetching activities (${percent.toFixed(0)}%)…`
          );
          
          hasMore = activities.length === 250; // Assume 250 is page size
          page++;
        }
        
        return modeActivities;
      });

      // Wait for all modes to complete
      const allModeActivities = await Promise.all(modePromises);
      const allActivities = allModeActivities.flat();

      // Filter for unique new activities
      const uniqueNewActivities = allActivities.filter(activity => 
        !dbActivities.some(existing => this.isDuplicateActivity(existing, activity))
      );

          // Persist any new, unique activities to IndexedDB
          if (uniqueNewActivities.length > 0) {
            await this.activityDb.addActivities(uniqueNewActivities);
            // keep local cache in sync to avoid duplicate inserts on subsequent pages/modes
            dbActivities.push(...uniqueNewActivities);

            // Invalidate the per-player cache so the next getPlayerActivities() re-reads from DB
            this.activitiesCache.delete(character.membershipId);

            // If any of the newly stored activities fall on the date currently being viewed,
            // clear the per-date filtered cache so subsequent refreshes (or the one we trigger
            // below) include the new rows.
            if (this.selectedDate && uniqueNewActivities.some(act => this.isActivityOnSelectedDate(act))) {
              const cacheKey = `filtered-${this.selectedDate}-${this.selectedActivityType.label}`;
              const entry = this.filteredActivitiesCache.get(cacheKey);
              if (entry) {
                entry.dirty = true;
              }
              // Fire-and-forget background refresh — guarded by currentLoadToken inside the call.
              this.loadAllFilteredActivities(true);
            }
          }

          // Phase-A fast path: as soon as we have at least one activity for the selected date
          // (month/day match) we trigger a lightweight refresh so the user sees results instantly.
          if (!this.initialDisplayShown) {
        const foundToday = allActivities.some(act => this.isActivityOnSelectedDate(act));
            if (foundToday) {
              this.initialDisplayShown = true;
              // Fire-and-forget – we don't await to avoid stalling further page fetches.
              this.loadAllFilteredActivities(true);
        }
      }

      this.processAndGroupActivities();
    } catch (error) {
      console.error('[DEBUG] Error loading activity history for character:', error);
      this.error[loadingKey] = 'Failed to load activity history';
    } finally {
      this.loadingActivities[loadingKey] = false;
    }
  }

  private updateLoadingProgress(
    phase: LoadingProgress['phase'],
    current: number,
    total: number,
    message: string
  ): void {
    if (this.loadingProgress) {
      Object.assign(this.loadingProgress, { phase, current, total, message });
    } else {
      this.loadingProgress = { phase, current, total, message };
    }
    this.cdr.detectChanges();
  }
  private async processAndGroupActivities(): Promise<void> {
    console.log('[DEBUG] processAndGroupActivities - filteredActivitiesForDate length:', this.filteredActivitiesForDate.length);
    console.log('[DEBUG] processAndGroupActivities - sample activities:', this.filteredActivitiesForDate.slice(0, 3));
    const totalToProcess = this.filteredActivitiesForDate.length;
    if (totalToProcess === 0) {
      // If we have no activities for the current refresh **but** the UI
      // already has data from earlier players, keep the existing view so
      // it doesn't flicker away while the new account finishes syncing.
      if (this.groupedActivitiesByAccount.length === 0) {
        this.groupedActivitiesByAccount = [];
        this.firstEverActivity = undefined;
        this.cdr.detectChanges();
      }
      await this.setFirstEverActivityFromDb();

      return;
    }

    // Use Web Worker for heavy processing if available and not disabled
    if (!this.workerDisabled && this.workerService.isWorkerAvailable()) {
      this.processWithWorker();
      return;
    }

    // Fallback to main thread processing
    this.processInMainThread(totalToProcess);
  }

  private processWithWorker(): void {
    if (this.workerProcessing) {
      // Queue the task if worker is busy
      this.workerQueue.push(() => this.processWithWorker());
      return;
    }

    this.workerProcessing = true;
    this.updateLoadingProgress('process', 0, this.filteredActivitiesForDate.length, 'Processing activities with worker…');

    // Add timeout protection
    const timeoutId = setTimeout(() => {
      console.warn('[Worker] Processing timeout, falling back to main thread');
      this.workerProcessing = false;
      this.processInMainThread(this.filteredActivitiesForDate.length);
    }, 10000); // 10 second timeout

    // Store timeout ID for cleanup
    (this as any).workerTimeoutId = timeoutId;

    // Send data to worker
    this.workerService.postMessage({
      type: 'PROCESS_ACTIVITIES_FOR_DISPLAY',
      data: {
        activities: this.filteredActivitiesForDate.slice(0, 1000) // Limit to 1000 activities to prevent memory issues
      }
    });
  }

  private async processInMainThread(totalToProcess: number): Promise<void> {
    // Initialise process-phase progress bar
    this.updateLoadingProgress('process', 0, totalToProcess, 'Processing activities…');
    let processedCount = 0;
    // Group by game first, then by year, consolidating all accounts
    const gameGroups = new Map<string, { game: 'D1' | 'D2'; yearGroups: Map<string, YearGroup> }>();
    
    for (const activity of this.filteredActivitiesForDate) {
      const game = activity.game;
      if (!gameGroups.has(game)) {
        gameGroups.set(game, {
          game,
          yearGroups: new Map<string, YearGroup>()
        });
      }
      const gameGroup = gameGroups.get(game)!;
      const year = new Date(activity.period).getFullYear().toString();
      if (!gameGroup.yearGroups.has(year)) {
        gameGroup.yearGroups.set(year, {
          year,
          typeGroups: new Map<string, TypeGroup>()
        });
      }
      const yearGroup = gameGroup.yearGroups.get(year)!;
      // Use manifest as primary source, custom mapping as backup
      const referenceId = activity.activityDetails?.referenceId;
      const isD1 = activity.game === 'D1';
      
      // Get activity name from manifest first, then fallback to custom mapping
      let activityName = this.manifest.getActivityName(referenceId, isD1);
      if (!activityName || activityName === 'Unknown Activity') {
        // Fallback to custom mapping if manifest doesn't have the name
        activityName = this.getMappedActivityName(String(referenceId)) || 'Unknown Activity';
      }
      

      
      const activityType = this.manifest.getActivityType(referenceId, activity.activityDetails?.mode);
      const normalizedType = (activityType || 'other').toLowerCase().replace(/\s+/g, '-');
      
      // Group by base activity name (remove version suffixes)
      const baseActivityName = this.getBaseActivityName(activityName);
      const groupKey = `${baseActivityName}`;
      
      if (!yearGroup.typeGroups.has(groupKey)) {
        let icon = this.activityIconService.getActivityIconPath(normalizedType, isD1);
        if (!icon) {
          icon = this.activityIconService.getActivityIconPath('other', isD1);
        }
        yearGroup.typeGroups.set(groupKey, {
          name: baseActivityName,      // for display (base name)
          type: activityType,          // for icon
          isD1,
          image: this.getActivityImage(activity, isD1),
          icon,
          activities: [],
          seenInstanceIds: new Set<string>()
        });
      }
      const typeGroup = yearGroup.typeGroups.get(groupKey)!;
      const instanceId = String(activity.activityDetails?.instanceId || '');
      // Deduplicate by PGCR instance across platforms/accounts
      if (instanceId) {
        if (typeGroup.seenInstanceIds!.has(instanceId)) {
          continue; // already included from another platform/account
        }
        typeGroup.seenInstanceIds!.add(instanceId);
      }
      typeGroup.activities.push(activity);

      // Increment progress periodically to keep UI responsive
      processedCount++;
      if (processedCount % 200 === 0) {
        this.updateLoadingProgress(
          'process',
          processedCount,
          totalToProcess,
          `Processing activities (${((processedCount / totalToProcess) * 100).toFixed(0)}%)…`
        );
        // Trigger partial change detection so the UI can start filling
        this.cdr.detectChanges();
      }
    }

    // Final update: processing complete
    this.updateLoadingProgress('process', totalToProcess, totalToProcess, 'Processing complete');

    // Sort activities within each group by time (descending)
    for (const gameGroup of gameGroups.values()) {
      for (const yearGroup of gameGroup.yearGroups.values()) {
        for (const typeGroup of yearGroup.typeGroups.values()) {
          typeGroup.activities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
        }
      }
    }

    // Convert to the expected format for the template
    this.groupedActivitiesByAccount = Array.from(gameGroups.values()).map(gameGroup => ({
      game: gameGroup.game,
      yearGroups: Array.from(gameGroup.yearGroups.values()).map(yearGroup => ({
        year: yearGroup.year,
        typeGroups: Array.from(yearGroup.typeGroups.values())
      }))
    }));
    this.cdr.detectChanges();
    await this.setFirstEverActivityFromDb();

    console.log('[DEBUG] GroupedAccounts: D1=', this.getAccountGroupsForGame('D1').length,
                'D2=', this.getAccountGroupsForGame('D2').length);
  }
  getActivityDurationSeconds(activity: ActivityHistory): number {
    const values = activity.values as any;
    const seconds = values && values['timePlayedSeconds']?.basic?.value;
    
    // More reasonable validation
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
      // console.warn('[DEBUG] Invalid activity duration:', seconds, activity);
      return 0;
    }
    
    // Allow for longer activities (up to 24 hours)
    if (seconds > 86400) {
      console.warn('[DEBUG] Suspiciously long activity duration:', seconds, activity);
      return 86400; // Cap at 24 hours
    }
    
    return seconds;
  }

  /**
   * Start background processing for activities
   */
  private startBackgroundProcessing(activities: any[], manifest: any) {
    if (activities.length === 0) return;

    // Only start background processing for large datasets
    if (activities.length < 100) return;

    // Start background processing
    this.backgroundProcessing.startProcessing(activities, manifest, 50);
    
    // Show notification that processing continues in background
    this.showBackgroundProcessingIndicator = true;
  }

  /**
   * Resume processing when user returns to tab
   */
  private resumeBackgroundProcessing() {
    if (this.backgroundProcessingState.isPaused) {
      this.backgroundProcessing.resumeProcessing();
    }
  }

  public async loadAllFilteredActivities(forceRefresh: boolean = false) {
    const loadToken = ++this.currentLoadToken;

    // Update status for all accounts to show activities are being displayed
    this.selectedPlayers.forEach(player => {
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
        'displaying-activities',
        `Displaying ${game} activities for ${player.displayName}...`
      );
    });

    // Kick off render-phase progress bar (will update inside slice loop)
    this.updateLoadingProgress('render', 0, 1, 'Preparing display…');

    try {
      const activities = await this.getAllFilteredActivitiesForDate(forceRefresh);
      // Ensure class icons can render by enriching activities with character class from PGCRs
      await this.enrichActivitiesWithCharacterClass(activities);
      if (loadToken !== this.currentLoadToken) return; // Abort if a newer load started

      // Ensure Destiny manifest has finished loading so that activity names/types resolve properly
      if (!this.manifest.isLoadedSync) {
        await this.manifest.isLoaded().toPromise();
      }

      // PROCESS phase handled separately—ensure groups are ready before rendering slices
      this.processAndGroupActivities();

      // Start background processing for heavy operations
      this.startBackgroundProcessing(activities, this.manifest);

      // ---------- RENDER PHASE ----------
      const sliceSize = 250;
      const totalSlices = Math.max(1, Math.ceil(this.filteredActivitiesForDate.length / sliceSize));
      for (let i = 0; i < totalSlices; i++) {
        if (loadToken !== this.currentLoadToken) return; // Abort if newer load started

        // Nothing special: activities already grouped; we just trigger change detection so list updates
        this.updateActivityDisplay();

        // Progress update
        this.updateLoadingProgress(
          'render',
          i + 1,
          totalSlices,
          `Rendering activities (${Math.round(((i + 1) / totalSlices) * 100)}%)…`
        );

        // Give the UI a chance to paint between large batches
        await new Promise(requestAnimationFrame);
      }

      // Fade out overlay after a short delay so user sees 100% state
      if (loadToken === this.currentLoadToken) {
        setTimeout(() => {
          this.loadingProgress = null;
          this.cdr.detectChanges();
        }, 300);
      }
    } catch (error) {
      // handle error
    } finally {
      if (loadToken === this.currentLoadToken) {
        this.loadingActivities[this.selectedDate] = false;
        
        // Mark all accounts as complete after rendering is finished
        this.selectedPlayers.forEach(player => {
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
            'complete',
            `${game} data loaded and displayed successfully for ${player.displayName}`
          );
        });
        
        this.cdr.detectChanges();
      }
    }
  }

  /**
   * Enrich the provided activities list with character class information using cached/fetched PGCRs.
   * This runs automatically so UI can show class icons without any user action.
   */
  private async enrichActivitiesWithCharacterClass(activities: ActivityHistory[]): Promise<void> {
    try {
      if (!activities || activities.length === 0) return;

      // Process per selected player so we know which membership/game context to match in PGCR
      const players = (this.selectedPlayers || []).filter(Boolean);
      for (const player of players) {
        const actsForPlayer = activities.filter(a => !a.characterClass && (a as any).membershipId === player.membershipId);
        if (actsForPlayer.length === 0) continue;

        const character: CharacterWithGame = {
          characterId: this.selectedCharacterIds[player.membershipId] || '',
          membershipType: player.membershipType,
          membershipId: player.membershipId,
          game: (player as any).game === 'D1' ? 'D1' : 'D2'
        };

        for (let idx = 0; idx < actsForPlayer.length; idx += this.PGCR_BATCH_SIZE) {
          const validated = await this.validatePGCRBatch(actsForPlayer, character, idx);
          if (!validated || validated.length === 0) continue;

          // Merge characterClass back into the activities array by instanceId
          const clsByInstance = new Map<string, string | undefined>();
          for (const v of validated) {
            const iid = v.activityDetails?.instanceId;
            if (iid && v.characterClass) {
              clsByInstance.set(iid, v.characterClass);
            }
          }
          if (clsByInstance.size === 0) continue;

          for (const a of activities) {
            const iid = a.activityDetails?.instanceId;
            if (iid && !a.characterClass && clsByInstance.has(iid)) {
              (a as any).characterClass = clsByInstance.get(iid);
            }
          }
        }
      }

      // Also reflect in the filtered list used by grouping/rendering
      for (const a of this.filteredActivitiesForDate) {
        if (!a.characterClass) {
          const match = activities.find(x => x.activityDetails?.instanceId === a.activityDetails?.instanceId);
          if (match?.characterClass) {
            (a as any).characterClass = match.characterClass;
          }
        }
      }
    } catch (_) {
      // Non-fatal: if PGCR fetch fails, we simply skip class icons
    }
  }

  private updateActivityDisplay(): void {
    // Force change detection to update the view
    this.cdr.detectChanges();
  }

  getPlatformName(membershipType: number | undefined): string {
    switch (membershipType) {
      case 1:
        return 'Xbox';
      case 2:
        return 'PlayStation';
      case 3:
        return 'Steam';
      case 4:
        return 'Blizzard';
      case 5:
        return 'Stadia';
      case 6:
        return 'Epic';
      default:
        return 'Unknown';
    }
  }

  isD1Player(player: PlayerSearchResult | PlayerSearchDisplay | undefined): boolean {
    if (!player) {
      // Defensive: player is undefined/null
      return false;
    }
    
    // If the game property is explicitly set, use it
    // This is the most reliable method since it's set based on the API used
    if ((player as any).game) {
      // D1/D2 distinction by explicit property
      return (player as any).game === 'D1';
    }
    
    // FALLBACK: Legacy detection logic (less reliable)
    // This should only be used if the game property is not set
    console.warn('[isD1Player] Game property not set, using fallback detection for player:', player.displayName);
    
    // Check if this is a D1 account by looking at the membership type and other indicators
    // D1 accounts are typically Xbox (1) or PlayStation (2) without cross-save indicators
    const isXboxOrPlayStation = player.membershipType === 1 || player.membershipType === 2;
    
    // If it's Xbox/PlayStation and doesn't have cross-save indicators, it's likely D1
    if (isXboxOrPlayStation) {
      const hasCrossSaveIndicators = (player as any).bungieGlobalDisplayName || 
                                   (player as any).isCrossSavePrimary ||
                                   (player as any).crossSaveOverride;
      
      // If no cross-save indicators, it's likely a D1 account
      if (!hasCrossSaveIndicators) {
        return true;
      }
      
      // If it has cross-save indicators, check if it's the original platform (not cross-save)
      // For cross-save accounts, the original platform is usually D1
      const crossSaveOverride = (player as any).crossSaveOverride;
      if (crossSaveOverride && crossSaveOverride !== player.membershipType) {
        // This is the cross-save override platform (D2), not the original (D1)
        return false;
      }
      
      // If it's the original platform in a cross-save setup, it's likely D1
      return true;
    }
    
    // For other platforms (Steam, Battle.net, etc.), they're typically D2
    return false;
  }

  getClassName(classType: number): string {
    switch (classType) {
      case 0: return 'Titan';
      case 1: return 'Hunter';
      case 2: return 'Warlock';
      default: return 'Unknown';
    }
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
   * Debug helper to summarize activity data
   */
  private logActivitySummary(player: PlayerSearchResult, activities: any[]) {
    if (activities.length === 0) {
      console.log(`No activities found for ${player.displayName}`);
      return;
    }

    // Get unique dates from activities
    const dates = new Set(activities.map(a => new Date(a.period).toISOString().split('T')[0]));
    
    console.log(`Activity Summary for ${player.displayName}:`);
    console.log(`Total activities: ${activities.length}`);
    console.log(`Date range: ${Array.from(dates).sort().join(', ')}`);
    
    // Sample a few activities
    const sampleSize = Math.min(3, activities.length);
    console.log('Sample activities:');
    activities.slice(0, sampleSize).forEach(activity => {
      console.log({
        date: new Date(activity.period).toISOString(),
        type: activity.activityDetails?.mode || 'Unknown',
        referenceId: activity.activityDetails?.referenceId
      });
    });
  }

  /**
   * Gets activities filtered by type and game version with caching.
   * @param activities Array of activities to filter
   * @param game Game version ('D1' or 'D2')
   * @returns Observable of filtered activities
   */
  getFilteredActivities(activities: ActivityHistory[], game: string): Observable<ActivityHistory[]> {
    if (!this.selectedActivityType || this.selectedActivityType.label === 'All') {
      return of(activities);
    }

    const cacheKey = `${game}-${this.selectedActivityType.label}-${this.selectedDate}`;
    const cached = this.activityCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return of(cached.activities);
    }

    const D1_RAID_HASHES = [
      // Vault of Glass (all variants)
      '3801607287', '708693006', '2659248071', '2659248068', '2659248069', 
      '856898338', '4038697181',
      // Crota's End (all variants)
      '898834093', '112157962', '3879860662', '1836893116', '1836893119',
      '2324706853', '4000873610',
      // King's Fall (all variants)
      '1733556769', '3534581229', '1016659723', '3978884648',
      // Wrath of the Machine (all variants)
      '2578867903', '4007500989', '1099433614', '1342567280', '260765522',
      '1387993552', '430160982', '3356249023'
    ];
    const filtered = activities.filter(activity => {
      const mode = activity.activityDetails?.mode;
      const referenceId = String(activity.activityDetails?.referenceId);
      if (this.selectedActivityType.label === 'Raid' && game === 'D1') {
        const isRaid = D1_RAID_HASHES.includes(referenceId);
        if (isRaid) {
          console.log('[DEBUG][Filter][D1Raid] Including activity:', {
            period: activity.period,
            referenceId,
            completed: activity.values?.completed?.basic?.value
          });
        } else {
          console.log('[DEBUG][Filter][D1Raid] Excluding activity:', {
            period: activity.period,
            referenceId,
            completed: activity.values?.completed?.basic?.value
          });
        }
        return isRaid;
      }
      if (!mode) return false;
      // Special case for Dungeons (D2 only) - use proper activity type detection
      if (this.selectedActivityType.label === 'Dungeon') {
        if (game !== 'D2') return false;
        // Use the manifest service to properly detect dungeons
        const activityType = this.manifest.getActivityType(referenceId, mode);
        return activityType === 'dungeon';
      }
      // Normal case - check mode against game version
      return (game === 'D1' && mode === this.selectedActivityType.d1Mode) ||
             (game === 'D2' && mode === this.selectedActivityType.d2Mode);
    });

    // Update cache
    this.activityCache.set(cacheKey, {
      activities: filtered,
      timestamp: Date.now(),
      type: this.selectedActivityType.label,
      game
    });

    return of(filtered);
  }

  getObjectKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  // Add cache clearing method
  private clearCache(): void {
    this.activityCache.clear();
    this.firstEverActivities = {};
    this.firstEverActivity = undefined;
  }

  /**
   * Safely gets the kills value from an activity
   */
  getKills(activity: ActivityHistory): number | undefined {
    return activity.values?.kills?.basic?.value;
  }

  /**
   * Safely gets the deaths value from an activity
   */
  getDeaths(activity: ActivityHistory): number | undefined {
    return activity.values?.deaths?.basic?.value;
  }

  /**
   * Safely calculates K/D ratio from an activity
   */
  getKDRatio(activity: ActivityHistory): string | undefined {
    const kills = this.getKills(activity);
    const deaths = this.getDeaths(activity);
    
    if (kills !== undefined && deaths !== undefined && deaths !== 0) {
      return (kills / deaths).toFixed(2);
    }
    return undefined;
  }

  /**
   * Safely gets the activity name from the manifest
   */
  getActivityName(activity: ActivityHistory, isD1: boolean): string {
    const referenceId = activity.activityDetails?.referenceId;
    if (!referenceId) return 'Unknown Activity';
    return this.manifest.getActivityName(referenceId, isD1) || 'Unknown Activity';
  }

  async calculateAccountStats() {
    const token = ++this.statsCalcToken; // capture token for this invocation
    this.loadingAccountStats = true;
    this.loadingGuardianFirsts = true;

    // Use Web Worker for stats calculation if available and not disabled
    if (!this.workerDisabled && this.workerService.isWorkerAvailable()) {
      this.calculateStatsWithWorker();
      return;
    }

    // Fallback to main thread calculation
    this.calculateStatsInMainThread();
  }

  private calculateStatsWithWorker(): void {
    if (this.workerProcessing) {
      // Queue the task if worker is busy
      this.workerQueue.push(() => this.calculateStatsWithWorker());
      return;
    }

    this.workerProcessing = true;

    // Collect all activities for all selected players
    const allActivities: any[] = [];
    const allCharacters: any[] = [];

    for (const player of this.selectedPlayers) {
      const playerKey = this.getPlayerKey(player);
      const playerActivities = this.activities[playerKey] || [];
      const playerCharacters = this.characters[playerKey] || [];
      
      allActivities.push(...playerActivities);
      allCharacters.push(...playerCharacters);
    }

    // Send data to worker
    this.workerService.postMessage({
      type: 'CALCULATE_STATS',
      data: {
        activities: allActivities,
        characters: allCharacters
      }
    });
  }

  private async calculateStatsInMainThread(): Promise<void> {
    const token = this.statsCalcToken; // capture token for this invocation
    let totalTime = 0;
    let totalActivityTime = 0;
    const perType: { [type: string]: { count: number, time: number } } = {};
    const allFirstCompletions: ActivityFirstCompletion[] = [];

    try {
      // <--- INSERT HERE
      const D1_RAID_HASHES = [
        // Vault of Glass (all variants)
        '3801607287', '708693006', '2659248071', '2659248068', '2659248069', 
        '856898338', '4038697181',
        // Crota's End (all variants)
        '898834093', '112157962', '3879860662', '1836893116', '1836893119',
        '2324706853', '4000873610',
        // King's Fall (all variants)
        '1733556769', '3534581229', '1016659723', '3978884648',
        // Wrath of the Machine (all variants)
        '2578867903', '4007500989', '1099433614', '1342567280', '260765522',
        '1387993552', '430160982', '3356249023'
      ];
      const allD1RaidActivities: any[] = [];
      for (const player of this.selectedPlayers) {
        // Inline getAllCharacterIdsForPlayer logic
        const charIds = (this.characters[this.getPlayerKey(player)] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);
        for (const characterId of charIds) {
          const activities = await this.activityDb.getAllActivitiesForCharacter(player.membershipId, characterId);
          const raidActivities = activities.filter(a => D1_RAID_HASHES.includes(String(a.activityDetails.referenceId)) && a.values?.completed?.basic?.value === 1);
          allD1RaidActivities.push(...raidActivities);
        }
      }
      allD1RaidActivities.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());
      // console.log('[DEBUG][D1Raids] All D1 raid activities:', allD1RaidActivities.map(a => ({
      //   period: a.period,
      //   referenceId: a.activityDetails.referenceId,
      //   name: this.manifest.getActivityName(a.activityDetails.referenceId, true),
      //   completed: a.values?.completed?.basic?.value,
      //   characterId: a.characterId
      // })));
      // <--- END INSERT
      
      // console.log('[GuardianFirsts][DEBUG] Starting calculateAccountStats with players:', this.selectedPlayers);
      
      for (const player of this.selectedPlayers) {
        // Inline getAllCharacterIdsForPlayer logic
        const charIds = (this.characters[this.getPlayerKey(player)] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);
        // console.log(`[GuardianFirsts][DEBUG] Found ${charIds.length} characters for player ${player.displayName}:`, charIds);
        
        const completionsByFamily: { [family: string]: ActivityFirstCompletion } = {};
        for (const characterId of charIds) {
          // console.log(`[GuardianFirsts][DEBUG] Processing character ${characterId} for player ${player.displayName}`);
          const firsts = await this.activityDb.getFirstCompletions(player.membershipId, characterId, player.game);
          // console.log(`[GuardianFirsts][DEBUG] Found ${firsts.firstCompletions.length} first completions for character ${characterId}`);
          for (const completion of firsts.firstCompletions) {
            if (completion.completed !== 1) continue; // Only consider completions!
            const family = completion.name;
            if (!completionsByFamily[family] || new Date(completion.completionDate) < new Date(completionsByFamily[family].completionDate)) {
              completionsByFamily[family] = {
                ...completion
              };
              // console.log(`[GuardianFirsts][DEBUG] Updated earliest completion for ${family} to ${completion.completionDate}`);
            }
          }
        }
        // console.log(`[GuardianFirsts][DEBUG] Final completions for player ${player.displayName}:`, Object.values(completionsByFamily));
        allFirstCompletions.push(...Object.values(completionsByFamily));
      }

      // Sort and assign the guardian firsts once
      this.guardianFirsts = allFirstCompletions.sort((a, b) => {
        if (a.game !== b.game) return a.game === 'D1' ? -1 : 1;
        return new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime();
      });
      
      // console.log('[GuardianFirsts][UI] Final guardianFirsts array:', this.guardianFirsts);
      // console.log('[GuardianFirsts][UI] Raids for D1:', this.getGuardianFirstRaidsForGame('D1'));
      // console.log('[GuardianFirsts][UI] Raids for D2:', this.getGuardianFirstRaidsForGame('D2'));
      // console.log('[GuardianFirsts][UI] Dungeons for D1:', this.getGuardianFirstDungeonsForGame('D1'));
      // console.log('[GuardianFirsts][UI] Dungeons for D2:', this.getGuardianFirstDungeonsForGame('D2'));
      
      this.cdr.detectChanges();

      // Build per-type stats from all stored activities
      for (const key of Object.keys(this.activities)) {
        const list = this.activities[key] || [];
        for (const act of list) {
          const typeName = this.manifest.getActivityType(act.activityDetails.referenceId, act.activityDetails.mode);
          const allowedTypes = ['raid','dungeon','strike','nightfall','crucible','gambit','other'];
          const safeType = allowedTypes.includes(typeName) ? typeName : 'other';
          if (!perType[safeType]) perType[safeType] = { count: 0, time: 0 };
          perType[safeType].count++;
          perType[safeType].time += this.getActivityDurationSeconds(act);
        }
      }

      // Pull total playtime (seconds) from cached wastedTimes
      for (const pl of this.selectedPlayers) {
        totalTime += this.wastedTimes[this.getPlayerKey(pl)] || 0;
      }

      // Total activity time: if we have actual duration from stored activities use it, otherwise fall back to totalTime
      totalActivityTime = Object.values(perType).reduce((sum, s) => sum + s.time, 0);
      if (!totalActivityTime) {
        totalActivityTime = totalTime;
      }

      // Total activities — count directly from IndexedDB for accuracy
      const totalActivities = await this.activityDb.countActivitiesForMemberships(this.selectedPlayers.map(p => p.membershipId));

      // Aggregate seals from WoD
      let totalSeals = 0;
      for (const pl of this.selectedPlayers) {
        totalSeals += this.wastedSeals[this.getPlayerKey(pl)] || 0;
      }

      // Build per-platform stats
      const platformStatsMap: { [key: string]: PlatformStats } = {};
      for (const pl of this.selectedPlayers) {
        const platformName = pl.platform;
        // Use game as part of the key so Destiny 1 and Destiny 2 accounts on the same platform don't overwrite each other
        // Also include membershipId so each account gets its own card in the summary
        const key = `${pl.game}-${platformName}-${pl.membershipId}`;
        // Prefer WastedOnDestiny playtime (seconds).  If unavailable (e.g. Destiny 1
        // accounts) fall back to the sum of `minutesPlayedTotal` (D2) or
        // `minutesPlayed` (D1) reported on each character profile.
        let time = this.wastedTimes[this.getPlayerKey(pl)] || 0;
        if (time === 0) {
          const chars = this.characters[this.getPlayerKey(pl)] as any[] | undefined;
          if (chars && chars.length > 0) {
            const minutes = chars.reduce((sum, c) => {
              const min = Number(c.minutesPlayedTotal ?? c.minutesPlayed ?? 0);
              return sum + (isNaN(min) ? 0 : min);
            }, 0);
            time = minutes * 60; // convert to seconds to keep units consistent
          }
        }
        const seals = this.wastedSeals[this.getPlayerKey(pl)] || 0;
        const acts = await this.activityDb.countActivitiesForMemberships([pl.membershipId]);

        if (!platformStatsMap[key]) {
          platformStatsMap[key] = {
            platform: platformName,
            game: pl.game as 'D1' | 'D2',
            totalTime: 0,
            totalActivities: 0,
            totalSeals: 0
          } as PlatformStats;
        }

        const s = platformStatsMap[key];
        s.totalTime += time;
        s.totalActivities += acts;
        s.totalSeals += seals;

        // Populate emblem info once per platform using the account with most playtime/activities
        if (!s.emblemBackground) {
          const chars = this.characters[this.getPlayerKey(pl)] as any[] | undefined;
          if (chars && chars.length > 0) {
            // Pick most recently played character for emblem art
            const top = [...chars].sort((a, b) => {
              const aDate = new Date(
                a.dateLastPlayed || a.dateLastPlayedTime || a.lastPlayed || 0
              ).getTime();
              const bDate = new Date(
                b.dateLastPlayed || b.dateLastPlayedTime || b.lastPlayed || 0
              ).getTime();
              return bDate - aDate;
            })[0];
            if (top) {
              s.emblemBackground = top.emblemBackgroundPath || top.emblemPath || undefined;
              s.emblemIcon = top.emblemPath || undefined;
              s.displayName = pl.displayName;
              if (top.classType !== undefined) {
                s.className = this.getClassName(top.classType);
              }
              s.lightLevel = top.light || top.lightLevel || undefined;
            }
          }
        }
      }
      // Include a platform row if it has *either* play time OR activities so newly
      // added Destiny 1 accounts (play-time unknown) still appear immediately once
      // activities sync in.
      this.perPlatformStats = Object.values(platformStatsMap).filter(s =>
        (s.totalTime || 0) > 0 || (s.totalActivities || 0) > 0
      );

      // Extend accountStats to include seals
      this.accountStats = {
        totalTime,
        totalActivityTime,
        totalActivityCount: totalActivities,
        totalSeals,
        perType: { ...perType }
      } as any;
    } catch (error) {
      console.error('[GuardianFirsts][ERROR] Error in calculateAccountStats:', error);
    } finally {
      // Only clear the spinner if this is the newest (last) in-flight calculation.
      if (token === this.statsCalcToken) {
        this.loadingAccountStats = false;
      }
      this.loadingGuardianFirsts = false;
      this.cdr.detectChanges();
    }
  }

  // Helper method to format duration
  formatDuration(seconds: number): string {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    
    return parts.join(' ');
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
  private createActivityEntry(activity: ActivityHistory): ActivityEntry {
    // Log the activity we're trying to process
    console.log('[DEBUG] Creating activity entry for:', {
      activityId: activity.activityDetails?.instanceId,
      period: activity.period,
      mode: activity.activityDetails?.mode,
      referenceId: activity.activityDetails?.referenceId
    });

    // Find the player by looking through all activities
    const player = this.selectedPlayers.find(p => {
      const playerActivities = Object.keys(this.activities)
        .filter(key => key.startsWith(`activities-${p.membershipId}-`))
        .some(key => {
          const activities = this.activities[key] || [];
          return activities.some(a => 
            a.activityDetails?.instanceId === activity.activityDetails?.instanceId
          );
        });
      return playerActivities;
    });

    if (!player) {
      console.error('[DEBUG] Could not find player for activity:', {
        activityId: activity.activityDetails?.instanceId,
        period: activity.period,
        mode: activity.activityDetails?.mode,
        referenceId: activity.activityDetails?.referenceId,
        availablePlayers: this.selectedPlayers.map(p => ({
          membershipId: p.membershipId,
          displayName: p.displayName
        }))
      });
      throw new Error('Activity has no associated player');
    }

    console.log('[DEBUG] Found player for activity:', {
      playerName: player.displayName,
      membershipId: player.membershipId,
      activityId: activity.activityDetails?.instanceId
    });

    return {
      game: this.isD1Player(player) ? 'D1' : 'D2',
      platform: this.getPlatformName(player.membershipType),
      player: player,
      activities: [activity]
    };
  }

  getDaysForMonth(month: string): number[] {
    const daysInMonth = new Date(2024, parseInt(month), 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }

  async onDateSelect(month: string, day: string) {
    const newMonth = parseInt(month);
    const newDay   = parseInt(day);

    // If the user clicked "Search" for the same day we're already showing, we
    // just trigger a lightweight refresh instead of blowing away caches and
    // restarting the fast-load logic (which caused the visible refresh loop).
    const sameDate = this.selectedMonth === newMonth && this.selectedDay === newDay;
    if (sameDate) {
      await this.loadAllFilteredActivities();
      return;
    }

    // Date actually changed – reset fast-load state so the first slice renders
    // quickly once again.
    this.initialDisplayShown = false;
    this.filteredActivitiesForDate = [];
    this.clearFilteredActivitiesCache();
    this.selectedMonth = newMonth;
    this.selectedDay = newDay;
    
    // Update URL for permalink sharing (using current year for URL)
    this.selectedYear = this.selectedYear || new Date().getFullYear();
    this.selectedDate = `${this.selectedYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    this.updateUrlForPermalink();
    
    // Clear loading statuses for all accounts when date changes
    this.accountLoadingStatus.clear();
    this.accountLoadingStatuses = [];
    
    // OPTIMIZATION: For users with selected players (especially favorites),
    // show cached data for the new date instantly before any API calls
    if (this.selectedPlayers.length > 0) {
      await this.showInstantDateChange();
    } else {
      // Set loading state for new users
    this.loadingActivities[this.selectedDate] = true;
    this.cdr.detectChanges();
    }

    try {
      await this.loadAllFilteredActivities();
    } catch (error) {
      console.error('Error loading activities for date:', error);
    } finally {
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Instantly show activities for the newly selected date using cached data
   * This makes date changes feel instantaneous for users with favorites
   */
  async showInstantDateChange(): Promise<void> {
    try {
      // Filter existing cached activities for the new date immediately
      const newFilteredActivities: { [playerKey: string]: ActivityWithMembership[] } = {};
      let hasAnyActivities = false;

      for (const playerKey in this.activities) {
        const playerActivities = this.activities[playerKey] || [];
        // Ensure we're working with ActivityWithMembership[] 
        const typedActivities = playerActivities as ActivityWithMembership[];
        const dateFilteredActivities = this.filterActivitiesByDate(typedActivities, this.selectedDate);
        
        if (dateFilteredActivities.length > 0) {
          newFilteredActivities[playerKey] = dateFilteredActivities;
          hasAnyActivities = true;
        }
      }

      if (hasAnyActivities) {
        // Update the display immediately with cached data for the new date
        this.filteredActivitiesForDate = this.formatActivitiesForDisplay(newFilteredActivities);
        this.computeAccountStatsWithService();
        this.loadingActivities[this.selectedDate] = false;
        this.cdr.detectChanges();
        
        console.log(`Instantly displayed cached activities for ${this.selectedDate}`);
      } else {
        // No cached activities for this date, show loading state
        this.loadingActivities[this.selectedDate] = true;
        this.cdr.detectChanges();
      }
      
    } catch (error) {
      console.error('Error showing instant date change:', error);
      this.loadingActivities[this.selectedDate] = true;
      this.cdr.detectChanges();
    }
  }
  /**
   * Filter activities array by the selected date (month/day across all years)
   */
  private filterActivitiesByDate(activities: ActivityWithMembership[], targetDate: string): ActivityWithMembership[] {
    const [, targetMonth, targetDay] = targetDate.split('-');
    
    return activities.filter(activity => {
      const activityDate = new Date(activity.period);
      const activityMonth = (activityDate.getMonth() + 1).toString().padStart(2, '0');
      const activityDay = activityDate.getDate().toString().padStart(2, '0');
      
      return activityMonth === targetMonth && activityDay === targetDay;
    });
  }

  /**
   * Format filtered activities for display in the UI
   */
  private formatActivitiesForDisplay(filteredActivities: { [playerKey: string]: ActivityWithMembership[] }): any[] {
    const allActivities: ActivityWithMembership[] = [];
    
    for (const playerKey in filteredActivities) {
      allActivities.push(...filteredActivities[playerKey]);
    }
    
    // Sort by time (most recent first) and group by account/type as needed
    return allActivities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
  }

  private isActivityOnSelectedDate(activity: ActivityHistory): boolean {
    if (!activity.period || !this.selectedMonth || !this.selectedDay) return false;
    
    const activityDate = new Date(activity.period);
    
    // Match month and day across all years
    const activityMonth = activityDate.getMonth() + 1; // getMonth() returns 0-11, we need 1-12
    const activityDay = activityDate.getDate();
    
    // Debug logging for D1 activities to help diagnose timezone issues (only for mismatches)
    if (activity.activityDetails?.referenceId && this.isD1Activity(activity)) {
      const isMatch = activityMonth === this.selectedMonth && activityDay === this.selectedDay;
      // Only log if there's a potential timezone issue (activity should match but doesn't)
      if (!isMatch && activity.period) {
        const activityDateOnly = activity.period.split('T')[0];
        // Only log if the month/day should match but doesn't
        if (activityMonth === this.selectedMonth && activityDay === this.selectedDay) {
          console.warn('[Date Check] D1 Activity timezone mismatch:', {
            activityPeriod: activity.period,
            activityDateOnly,
            activityMonth,
            activityDay,
            selectedMonth: this.selectedMonth,
            selectedDay: this.selectedDay,
            referenceId: activity.activityDetails.referenceId
          });
        }
      }
    }
    
    return activityMonth === this.selectedMonth && activityDay === this.selectedDay;
  }
  
  private isD1Activity(activity: ActivityHistory): boolean {
    // Check if this is a D1 activity based on reference ID ranges
    const refId = activity.activityDetails?.referenceId;
    if (!refId) return false;
    
    // D1 activity reference IDs are typically in specific ranges
    // This is a heuristic - D1 activities often have different ID patterns
    const d1RaidHashes = [
      // Vault of Glass (all variants)
      '3801607287', '708693006', '2659248071', '2659248068', '2659248069', 
      '856898338', '4038697181',
      // Crota's End (all variants)
      '898834093', '112157962', '3879860662', '1836893116', '1836893119',
      '2324706853', '4000873610',
      // King's Fall (all variants)
      '1733556769', '3534581229', '1016659723', '3978884648',
      // Wrath of the Machine (all variants)
      '2578867903', '4007500989', '1099433614', '1342567280', '260765522',
      '1387993552', '430160982', '3356249023'
    ];
    
    const refIdStr = String(refId);
    return d1RaidHashes.includes(refIdStr) || 
           (parseInt(refIdStr) < 1000000000); // D1 activities typically have smaller reference IDs
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
  private validateAndSetDate(dateStr: string): void {
    // Parse the date string (format: "MM-DD" or "YYYY-MM-DD")
    const dateParts = dateStr.split('-').map(Number);
    let month: number, day: number, year: number;
    
    if (dateParts.length === 2) {
      // Format: "MM-DD" - use current year
      [month, day] = dateParts;
      year = new Date().getFullYear();
    } else if (dateParts.length === 3) {
      // Format: "YYYY-MM-DD"
      [year, month, day] = dateParts;
    } else {
      console.warn('[DateFilter] Invalid date format:', dateStr);
      return;
    }
    
    // Create a date object for comparison using local time
    const selectedDate = new Date(year, month - 1, day);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if the date is in the future
    if (selectedDate > today) {
  
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();
      this.selectedDate = `${todayYear}-${todayMonth.toString().padStart(2, '0')}-${todayDay.toString().padStart(2, '0')}`;
      this.selectedMonth = todayMonth;
      this.selectedDay = todayDay;
      this.selectedYear = todayYear;
    } else {
      // Use the full YYYY-MM-DD format
      this.selectedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      this.selectedMonth = month;
      this.selectedDay = day;
      this.selectedYear = year;
    }
    

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
    console.log('[DEBUG] Date input value:', value);
    
    // Accept only valid yyyy-MM-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // Convert input date to local midnight
      const inputDate = new Date(value);
      inputDate.setHours(0, 0, 0, 0);
      console.log(`[DEBUG] Input date converted to local: ${inputDate.toLocaleString()}, UTC: ${inputDate.toISOString()}`);
      this.validateAndSetDate(inputDate.toISOString().split('T')[0]);
      this.cdr.detectChanges();
    }
  }

  getSortedYears(yearGroups: { [year: string]: any }): string[] {
    return Object.keys(yearGroups).sort((a, b) => parseInt(b) - parseInt(a));
  }

  getSortedTypes(typeGroups: { [type: string]: any }): string[] {
    const preferredOrder = ['Raid', 'Dungeon', 'Nightfall', 'Strike', 'Crucible', 'Other'];
    // Only include types with at least one activity
    const filteredTypes = Object.keys(typeGroups).filter(type => typeGroups[type] && typeGroups[type].length > 0);
    return filteredTypes.sort((a, b) => {
      const aIdx = preferredOrder.indexOf(a);
      const bIdx = preferredOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
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
   * 
   * ARCHITECTURE:
   * - D1 accounts are searched via the D1 API endpoints (searchD1Player)
   * - D2 accounts are searched via the D2 API endpoints (searchD2Player, searchUsersPrefix)
   * - The game property is set based on which API returned the result, not platform
   * - This ensures proper D1/D2 classification regardless of cross-save status
   * 
   * IMPORTANT: Never use D2 API to search for D1 accounts or vice versa.
   * The APIs are separate for a reason and return different data structures.
   */
  async addPlayer() {
    console.log('addPlayer called with searchUsername:', this.searchUsername);
    
    if (!this.searchUsername) {
      this.errorMessage = 'Please enter a username.';
      return;
    }

    // If not in add mode, clear all existing data first
    if (!this.addMode) {
      console.log('Not in add mode, clearing all players');
      this.clearAllPlayers();
      // Clear URL parameters to avoid confusion
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true
      });
    }

    // Reset state for fresh search
    this.errorMessage = '';
    this.d1SearchResults = [];
    this.d2SearchResults = [];
    this.crossSavePlayer = null;
    this.showPlatformPicker = false;
    this.loading['search'] = true;
    
    console.log('Starting search for:', this.searchUsername);

    try {
      const [d2Resp, d1Xbox, d1Psn] = await firstValueFrom(
        this.bungieService.searchAllGames(this.searchUsername)
      );

      /* --------------------
         Process Destiny 2
         IMPORTANT: These results come from the D2 API endpoints (searchD2Player or searchUsersPrefix).
         The D2 API returns D2 accounts, which can include cross-save accounts on any platform.
         We set game: 'D2' because these are definitely D2 accounts.
      -------------------- */
      if (this.searchUsername.includes('#')) {
        // Bungie Name exact match flow uses helper that already populates d2SearchResults
        await this.processExactD2SearchResponse(d2Resp);
      } else {
        const results = d2Resp?.Response?.searchResults as any[] | undefined;
        if (d2Resp && d2Resp.ErrorCode === 1 && results && results.length > 0) {
          const players: PlayerSearchDisplay[] = [];
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
                game: 'D2', // These come from D2 API, so they're definitely D2
                platform: this.getPlatformName(effectiveType),
                isCrossSavePrimary: m.isCrossSavePrimary,
                crossSaveOverride: m.crossSaveOverride
              } as PlayerSearchDisplay);
            }
          }
          // Deduplicate by (game, membershipId) so a Destiny 1 and Destiny 2 account with the same ID are both kept
          const unique = players.filter((p, idx, arr) => {
            const key = `${(p as any).game || 'D2'}|${p.membershipId}`;
            return arr.findIndex(x => `${(x as any).game || 'D2'}|${x.membershipId}` === key) === idx;
          });
          this.d2SearchResults = unique;
          this.crossSavePlayer = this.d2SearchResults.find(p => p.isCrossSavePrimary) || null;
        }
      }

      /* --------------------
         Process Destiny 1
         IMPORTANT: These results come from the D1 API endpoints, so they are definitely D1 accounts.
         The D1 API only returns D1 accounts, so we can safely set game: 'D1'.
      -------------------- */
      const d1Players = [...(d1Xbox || []), ...(d1Psn || [])];
      this.d1SearchResults = d1Players.map(pl => ({
        ...pl,
        game: 'D1', // These come from D1 API, so they're definitely D1
        platform: this.getPlatformName(pl.membershipType)
      }));

      /* --------------------
         Determine next action
      -------------------- */
      const total = this.d1SearchResults.length + this.d2SearchResults.length;
      if (total === 0) {
        this.errorMessage = 'No Destiny accounts found with that name.';
      } else if (total === 1) {
        const player = this.d2SearchResults[0] || this.d1SearchResults[0];
        await this.selectPlayer(player);
      } else {
        this.showPlatformPicker = true;
        this.focusFirstElementInModal('.modal.show');
      }

    } catch (error: any) {
      console.error('Error searching accounts:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        stack: error.stack
      });
      if (error.status === 503) {
        this.errorMessage = 'Bungie API is temporarily unavailable. Please try again later.';
      } else {
        this.errorMessage = `Error searching for accounts: ${error.message || 'Unknown error'}`;
      }
    } finally {
      this.loading['search'] = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Toggle between "add mode" (add profiles without clearing existing ones) 
   * and "replace mode" (clear existing profiles when searching)
   */
  toggleAddMode(): void {
    this.addMode = !this.addMode;
    
    // Clear error message and update it based on new mode
    if (this.selectedPlayers.length > 0 && this.searchUsername.trim()) {
      if (this.addMode) {
        this.errorMessage = ''; // Clear warning when switching to add mode
      } else {
        this.errorMessage = 'Warning: This search will replace your current profiles. Enable "Add mode" to keep existing profiles.';
      }
    } else {
      this.errorMessage = '';
    }
  }

  /**
   * Clear all selected players and reset to replace mode
   */
  clearAllPlayers(): void {
    this.selectedPlayers = [];
    this.selectedCharacterIds = {};
    this.characters = {};
    this.activities = {};
    this.loading = {};
    this.error = {};
    this.groupedActivitiesByAccount = [];
    this.addMode = false;
    
    // Clear filtered activities and related data
    this.filteredActivitiesForDate = [];
    this.filteredActivities$.next([]);
    this.processedActivities = [];
    
    // Clear first ever activities
    this.firstEverActivities = {};
    this.guardianFirstsMap = {};
    
    // Clear account stats
    this.computedAccountStats = null;
    this.accountStats = {
      totalTime: 0,
      totalActivityTime: 0,
      totalActivityCount: 0,
      totalSeals: 0,
      perType: {}
    };
    
    // Clear all loading statuses
    this.accountLoadingStatus.clear();
    this.accountLoadingStatuses = [];
    
    // Clear background processing
    this.backgroundProcessing.stopProcessing();
    this.showBackgroundProcessingIndicator = false;
    
    // Clear caches
    this.clearCache();
    this.invalidateMemoCaches();
    
    // Clear selected accounts service for Analytics component
    this.selectedAccounts.clear();
    
    this.cdr.detectChanges();
  }

  removePlayer(index: number) {
    const removed = this.selectedPlayers.splice(index, 1)[0];
    if (removed) {
      this.selectedAccounts.remove(removed.membershipId);
      
      // Remove loading status for this player
      const accountKey = this.getPlayerKey(removed);
      this.removeAccountLoadingStatus(accountKey);
    }
    // Clear date-scoped aggregates so UI reflects only current selections
    this.filteredActivitiesForDate = [];
    this.filteredActivities$.next([]);
    this.groupedActivitiesByAccount = [];
    // Recalculate account stats when a player is removed
    this.calculateAccountStats();
    this.cdr.detectChanges();
    this.updatePlatformTabs();
    
    // Update URL for permalink sharing
    this.updateUrlForPermalink();
  }

  private async getFilteredActivitiesFromDb(
    membershipId: string,
    characterId: string,
    month: number,
    day: number,
    mode?: number
  ): Promise<StoredActivity[]> {
    try {
      // Get all activities for the character
      const activities = await this.activityDb.getActivitiesByDate(
        membershipId,
        characterId,
        month,
        day
      );

      // If a specific mode is requested, filter by it
      if (mode !== undefined) {
        return activities.filter(a => a.activityDetails?.mode === mode);
      }

      return activities;
    } catch (error) {
      console.error('[DEBUG] Error getting filtered activities:', error);
      return [];
    }
  }

  /**
   * Helper method to get all activities for a player with caching.
   * Handles D1/D2 characterId differences using getCharacterId utility.
   */
  private async getPlayerActivities(membershipId: string): Promise<StoredActivity[]> {
    // Check cache first
    const cachedActivities = this.activitiesCache.get(membershipId);
    if (cachedActivities) {
      console.log('[DEBUG] Using cached activities for player:', membershipId);
      return cachedActivities;
    }

    // Get all characters for the player
    const characters = this.characters[membershipId] || [];
    if (characters.length === 0) {
      console.log('[DEBUG] No characters found for player:', membershipId);
      return [];
    }

    // Get activities for all characters in parallel
    // Always use getCharacterId utility, filter out undefineds
    const activitiesPromises = characters
      .map(getCharacterId)
      .filter((id): id is string => !!id)
      .map(async (charId: string) => {
        const game = characters.find((c: any) => getCharacterId(c) === charId)?.game || 'D2';
        return this.activityDb.getActivitiesByGame(membershipId, charId, game);
      });

    const activitiesArrays = await Promise.all(activitiesPromises);
    const allActivities = activitiesArrays.flat();

    // Cache the results
    this.activitiesCache.set(membershipId, allActivities);
    
    return allActivities;
  }
  /**
   * Retrieves all filtered activities for the selected date and players.
   */
  private async getAllFilteredActivitiesForDate(forceRefresh: boolean = false): Promise<ActivityWithMembership[]> {
    if (!this.selectedDate) {
      return [];
    }

    const cacheKey = `filtered-${this.selectedDate}-${this.selectedActivityType.label}`;
    const cachedEntry = this.filteredActivitiesCache.get(cacheKey);
    if (cachedEntry && !forceRefresh && !cachedEntry.dirty && this.firstFullSyncDone) {
      console.log('[DEBUG] Using cached filtered activities for date:', this.selectedDate);
      return cachedEntry.list;
    }

    // Parse selectedDate (format: "YYYY-MM-DD")
    const dateParts = this.selectedDate.split('-');
    if (dateParts.length !== 3) {
      console.warn('[DEBUG] Invalid selectedDate format:', this.selectedDate);
      return [];
    }
    const [year, month, day] = dateParts.map(Number);
    // debug removed
    
    const allFilteredActivities: ActivityWithMembership[] = [];

    // Get all activities for selected players in parallel
    const playerActivitiesPromises = this.selectedPlayers.map(async player => {
      console.log('[DEBUG] Getting activities for player:', player.displayName, 'on date:', this.selectedDate);
      
      // Use the new optimized query methods based on activity type
      let playerActivities: StoredActivity[] = [];
      
      if (this.selectedActivityType.label === 'All') {
        // Get all activities for the date
        const charIds = (this.characters[this.getPlayerKey(player)] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);
          
        console.log('[DEBUG] Found character IDs for', player.displayName, ':', charIds);
        
        const activitiesPromises = charIds.map(async charId => {
          const activities = await this.activityDb.getActivitiesByDate(player.membershipId, charId, month, day);
          console.log('[DEBUG] Found', activities.length, 'activities for character', charId, 'of', player.displayName);
          return activities;
        });
        const activitiesArrays = await Promise.all(activitiesPromises);
        playerActivities = activitiesArrays.flat();
        console.log('[DEBUG] Total activities for', player.displayName, ':', playerActivities.length);
      } else {
        // Get activities filtered by mode and date
        const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
        // For dungeons, we need to use a different approach since they don't have a consistent mode
        let mode: number | undefined;
        if (this.selectedActivityType.label === 'Dungeon' && player.game === 'D2') {
          // For dungeons, we'll get all activities and filter by type later
          mode = undefined;
        } else {
          mode = player.game === 'D1' ? this.selectedActivityType.d1Mode : this.selectedActivityType.d2Mode;
        }
        
        if (mode !== undefined) {
        playerActivities = await this.activityDb.getActivitiesByModeAndDate(
          player.membershipId,
            mode,
          startDate,
          endDate
        );
        } else {
          // For dungeons, get all activities and filter by type
          const charIds = (this.characters[this.getPlayerKey(player)] || [])
            .map(getCharacterId)
            .filter((id): id is string => !!id);
          
          const activitiesArrays = await Promise.all(
            charIds.map(async (charId: string) => {
              return this.activityDb.getActivitiesByGame(player.membershipId, charId, player.game);
            })
          );
          playerActivities = activitiesArrays.flat();
        }
      }

      // Keep only activities that belong to the same game as this player
      playerActivities = playerActivities.filter(a => {
        const g = (a as any).game as 'D1' | 'D2' | undefined;
        // Older cached rows may not include the `game` marker – treat them as belonging to this player's game
        return !g || g === player.game;
      });

      
      
      return playerActivities.map(activity => ({
        ...activity,
        membershipId: player.membershipId,
        membershipType: player.membershipType,
        displayName: player.displayName,
        platform: player.platform,
        game: player.game,
        iconPath: this.manifest.getActivityIcon(activity.activityDetails?.referenceId, player.game === 'D1')
      }));
    });

    const playerFilteredActivities = await Promise.all(playerActivitiesPromises);
    allFilteredActivities.push(...playerFilteredActivities.flat());

    console.log('[DEBUG] getAllFilteredActivitiesForDate - allFilteredActivities length before dedup:', allFilteredActivities.length);
    console.log('[DEBUG] getAllFilteredActivitiesForDate - sample allFilteredActivities:', allFilteredActivities.slice(0, 3));

    // Deduplicate by membershipId + instanceId (per-account dedupe)
    const dedupedMap = new Map<string, ActivityWithMembership>();
    let activitiesWithInstanceId = 0;
    let activitiesWithoutInstanceId = 0;
    
    for (const activity of allFilteredActivities) {
      const instanceId = activity.activityDetails?.instanceId;
      const membershipId = (activity as any).membershipId as string | undefined;
      if (instanceId && membershipId) {
        activitiesWithInstanceId++;
        const key = `${membershipId}|${instanceId}`;
        if (!dedupedMap.has(key)) {
          dedupedMap.set(key, activity);
        } else {
          // Duplicate of the same activity instance for the same account
          // This can happen when querying per-character; safe to ignore
        }
      } else {
        activitiesWithoutInstanceId++;
        console.log('[DEBUG] Activity without instanceId or membershipId:', activity);
      }
    }
    
    console.log('[DEBUG] Deduplication stats (per-account) - with instanceId:', activitiesWithInstanceId, 'without instanceId:', activitiesWithoutInstanceId);

    const dedupedActivities = Array.from(dedupedMap.values());
    // Sort by period (descending)
    dedupedActivities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
    
    console.log('[DEBUG] getAllFilteredActivitiesForDate - dedupedActivities length:', dedupedActivities.length);
    console.log('[DEBUG] getAllFilteredActivitiesForDate - sample deduped activities:', dedupedActivities.slice(0, 3));

    // Cache only after initial full sync completes so early partial lists don't persist
    if (this.firstFullSyncDone) {
      this.filteredActivitiesCache.set(cacheKey, { list: dedupedActivities, dirty: false });
    }
    
    this.filteredActivitiesForDate = dedupedActivities;
    console.log('[DEBUG] getAllFilteredActivitiesForDate - set filteredActivitiesForDate to:', this.filteredActivitiesForDate.length, 'activities');
    this.computeAccountStatsWithService();
    return dedupedActivities;
  }
  // Helper for Guardian Firsts template
  getGuardianFirstsForGame(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    // Only show raids and dungeons
    return this.guardianFirsts.filter(f => f.game === game && (f.type === 'raid' || f.type === 'dungeon'));
  }

  getGuardianFirstRaidsForGame(membershipId: string, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const firsts = this.guardianFirstsMap[membershipId] || [];
    const raids = firsts.filter((f: ActivityFirstCompletion) => f.type === 'raid' && f.game === game);

    // Sort by release date
    const releaseOrder = game === 'D1' ? [
      'Vault of Glass',
      "Crota's End",
      "King's Fall",
      'Wrath of the Machine'
    ] : [
      'Leviathan',
      'Leviathan, Eater of Worlds',
      'Leviathan, Spire of Stars',
      'Last Wish',
      'Scourge of the Past',
      'Crown of Sorrow',
      'Garden of Salvation',
      'Deep Stone Crypt',
      'Vault of Glass',
      "King's Fall",
      'Vow of the Disciple',
      'Root of Nightmares',
      "Crota's End",
      "Salvation's Edge"
    ];

    return raids.sort((a: ActivityFirstCompletion, b: ActivityFirstCompletion) => {
      const aIndex = releaseOrder.indexOf(a.name);
      const bIndex = releaseOrder.indexOf(b.name);
      return aIndex - bIndex;
    });
  }
  getGuardianFirstDungeonsForGame(membershipId: string, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    if (game === 'D1') return [];
    const firsts = this.guardianFirstsMap[membershipId] || [];
    const dungeons = firsts.filter((f: ActivityFirstCompletion) => f.type === 'dungeon' && f.game === game);
    // Sort by release date
    const releaseOrder = [
      'The Shattered Throne',
      'Pit of Heresy',
      'Prophecy',
      'Grasp of Avarice',
      'Duality',
      'Spire of the Watcher',
      'Ghosts of the Deep',
      "Warlord's Ruin",
      "Vesper's Host",
      "Sundered Doctrine"
    ];
    return dungeons.sort((a: ActivityFirstCompletion, b: ActivityFirstCompletion) => {
      const aIndex = releaseOrder.indexOf(a.name);
      const bIndex = releaseOrder.indexOf(b.name);
      return aIndex - bIndex;
    });
  }

  hasGuardianFirstsForGame(game: 'D1' | 'D2'): boolean {
    return this.guardianFirsts.some(f => f.game === game);
  }

  // Helper for Guardian Firsts image
  getFirstCompletionImage(first: ActivityFirstCompletion): string | SafeHtml | null {
    if (!first) return null;
    if (first.game === 'D1') {
      // For D1, try raid image first
      const raidImage = this.manifest.getActivityPgcrImage(first.referenceId, true);
      if (raidImage) {
        return raidImage;
      }
      // Then try activity type icon
      return this.activityIconService.getActivityIconPath(first.type, true);
    }
    // For D2, try PGCR image first
    if (first.referenceId) {
      const pgcrImage = this.manifest.getActivityPgcrImage(first.referenceId, false);
      if (pgcrImage && (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/')))
        return 'https://www.bungie.net' + pgcrImage;
    }
    // Fallback to activity type icon
    return this.activityIconService.getActivityIconPath(first.type, false);
  }

  // Build per-character earliest for a given list of first completions
  getPerCharacterFirsts(player: PlayerSearchDisplay, type: 'first-ever' | 'raid' | 'dungeon'): Array<{ characterId: string; className?: string; platformIcon: string; first: ActivityHistory | ActivityFirstCompletion }>{
    const results: Array<{ characterId: string; className?: string; platformIcon: string; first: ActivityHistory | ActivityFirstCompletion }> = [];
    const pKey = this.getPlayerKey(player);
    const charIds = (this.characters[pKey] || []).map(getCharacterId).filter((id): id is string => !!id);
    if (type === 'first-ever') {
      // For first-ever, compute earliest per character from stored activities
      for (const cid of charIds) {
        const list = (this.activities[`${player.membershipId}|${cid}`] || []) as ActivityHistory[];
        if (!list.length) continue;
        const earliest = [...list].sort((a: ActivityHistory, b: ActivityHistory) => new Date(a.period).getTime() - new Date(b.period).getTime())[0];
        results.push({
          characterId: cid,
          className: earliest.characterClass,
          platformIcon: this.getPlatformIconUrl(player.membershipType),
          first: earliest
        });
      }
    } else {
      // For raid/dungeon, use per-character earliest from guardianFirstsMap entries for this player
      const list = this.getFirstsForPlayer(player).filter((f: ActivityFirstCompletion) => f.game === player.game && (type === 'raid' ? f.type === 'raid' : f.type === 'dungeon'));
      const perChar = new Map<string, ActivityFirstCompletion>();
      for (const f of list) {
        const existing = perChar.get(f.characterId);
        if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
          perChar.set(f.characterId, f);
        }
      }
      perChar.forEach((f: ActivityFirstCompletion) => {
        results.push({
          characterId: f.characterId,
          className: f.characterClass,
          platformIcon: this.getPlatformIconUrl(f.membershipType ?? player.membershipType),
          first: f
        });
      });
    }
    return results.sort((a, b) => a.className?.localeCompare(b.className || '') || 0);
  }

  // UI state for per-character expand/collapse keyed by player+kind
  private perCharacterExpanded: { [key: string]: boolean } = {};
  private getExpandKey(player: PlayerSearchDisplay, kind: 'first-ever' | 'raid' | 'dungeon'): string {
    return `${this.getPlayerKey(player)}|${kind}`;
  }
  isPerCharacterExpanded(player: PlayerSearchDisplay, kind: 'first-ever' | 'raid' | 'dungeon'): boolean {
    return !!this.perCharacterExpanded[this.getExpandKey(player, kind)];
  }
  togglePerCharacter(player: PlayerSearchDisplay, kind: 'first-ever' | 'raid' | 'dungeon'): void {
    const key = this.getExpandKey(player, kind);
    this.perCharacterExpanded[key] = !this.perCharacterExpanded[key];
    this.cdr.detectChanges();
  }

  groupActivitiesByType(activities: any[]): ActivityGroup[] {
    const groups = new Map<string, ActivityGroup>();
    
    activities.forEach((activity: any) => {
      const key = `${activity.activityDetails?.referenceId}-${activity.game}`;
      if (!groups.has(key)) {
        groups.set(key, {
          type: activity.activityDetails?.mode || 0,
          game: activity.game,
          activities: []
        });
      }
      const group = groups.get(key);
      if (group) {
        group.activities.push(activity);
      }
    });

    // Sort activities within each group by time
    groups.forEach((group: ActivityGroup) => {
      group.activities.sort((a: any, b: any) => 
        new Date(b.period).getTime() - new Date(a.period).getTime()
      );
    });

    return Array.from(groups.values());
  }

  getAverageDuration(activities: any[]): number {
    if (!activities.length) return 0;
    const totalDuration = activities.reduce((sum: number, activity: any) => 
      sum + this.getActivityDurationSeconds(activity), 0
    );
    return totalDuration / activities.length / 60; // Convert to minutes
  }
  public getActivityImage(activity: any, isD1: boolean): string | null {
    if (!activity) return null;
    const referenceId = activity.activityDetails?.referenceId;
    if (isD1) {
      // For D1, try raid image first
      if (referenceId) {
        const raidImage = this.manifest.getActivityPgcrImage(referenceId, true);
        if (raidImage) {
          return raidImage;
        }
      }
      // Then try activity type icon
      const mode = activity.activityDetails?.mode;
      if (mode !== undefined) {
        const type = this.getActivityType(mode);
        return this.activityIconService.getActivityIconPath(type, true);
      }
      return null;
    }
    // For D2, try PGCR image first
    if (referenceId) {
      const pgcrImage = this.manifest.getActivityPgcrImage(referenceId, false);
      if (pgcrImage && (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/')))
        return 'https://www.bungie.net' + pgcrImage;
    }
    // Fallback to activity type icon
    const mode = activity.activityDetails?.mode;
    if (mode !== undefined) {
      const type = this.getActivityType(mode);
      return this.activityIconService.getActivityIconPath(type, false);
    }
    return null;
  }

  // For Guardian Firsts PGCR button
  openExternalPGCRForFirst(first: ActivityFirstCompletion) {
    if (!first.instanceId) return;
    const game = first.game === 'D1' ? 'destiny1' : 'destiny2';
    window.open(`https://pgcr.eververse.trade/${game}/${first.instanceId}`, '_blank', 'noopener');
  }

  private isDuplicateActivity(a1: any, a2: any): boolean {
    return a1.activityDetails?.instanceId === a2.activityDetails?.instanceId;
  }

  /** Returns local SVG icon path for the given platform */
  getPlatformIconUrl(membershipType: number): string {
    switch (membershipType) {
      case 1:
        return 'assets/icons/platforms/xbox.png';
      case 2:
        return 'assets/icons/platforms/ps.png';
      case 3:
        return 'assets/icons/platforms/steam.png';
      case 4:
        return 'assets/icons/platforms/blizzard.svg';
      case 5:
        return 'assets/icons/platforms/stadia.png';
      case 6:
        return 'assets/icons/platforms/egs.png';
      default:
        return '';
    }
  }

  getPlatformIconUrlForFirst(first: { membershipId?: string }): string {
    const pl = first && first.membershipId ? this.selectedPlayers.find(p => p.membershipId === first.membershipId) : undefined;
    return this.getPlatformIconUrl(pl?.membershipType ?? 0);
  }

  async loadGuardianFirsts(player: PlayerSearchDisplay): Promise<void> {
    this.loadingGuardianFirsts = true;
    try {
      const charIds = (this.characters[this.getPlayerKey(player)] || [])
        .map(getCharacterId)
        .filter((id): id is string => !!id);
      const allFirsts: ActivityFirstCompletion[] = [];
      for (const characterId of charIds) {
        const firsts = await this.activityDb.getFirstCompletions(player.membershipId, characterId, player.game);
        allFirsts.push(...firsts.firstCompletions);
      }
      // Deduplicate within the account so we keep only the earliest completion for each (game,type,name)
      // For D1 raids, use referenceId to keep variants separate since they have the same name
      const perName = new Map<string, ActivityFirstCompletion>();
      for (const f of allFirsts) {
        let key: string;
        if (f.game === 'D1' && f.type === 'raid') {
          // For D1 raids, use referenceId to keep Normal/Hard/390 variants separate
          key = `${f.game}|${f.type}|${f.name}|${f.referenceId}`;
        } else {
          // For D2 and other activities, use the original logic
          key = `${f.game}|${f.type}|${f.name}`;
        }
        const existing = perName.get(key);
        if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
          perName.set(key, f);
        }
      }
      const sorted = Array.from(perName.values()).sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime());
      
      // Per-player deduplication completed
      
      // store per-player list (keyed by game+membershipId)
      const pKey = this.getPlayerKey(player);
      this.guardianFirstsMap[pKey] = sorted;
      // recompute aggregate list (dedup by name + game + type)
      // For D1 raids, use referenceId to keep variants separate since they have the same name
      const aggregate: ActivityFirstCompletion[] = [];
      const seen = new Set<string>();
      Object.values(this.guardianFirstsMap).forEach(list => {
        for (const f of list) {
          let key: string;
          if (f.game === 'D1' && f.type === 'raid') {
            // For D1 raids, use referenceId to keep Normal/Hard/390 variants separate
            key = `${f.game}|${f.type}|${f.name}|${f.referenceId}`;
          } else {
            // For D2 and other activities, use the original logic
            key = `${f.game}|${f.type}|${f.name}`;
          }
          const existing = aggregate.find(x => {
            if (x.game === 'D1' && x.type === 'raid') {
              return `${x.game}|${x.type}|${x.name}|${x.referenceId}` === key;
            } else {
              return `${x.game}|${x.type}|${x.name}` === key;
            }
          });
          if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
            if (existing) {
              // replace later completion with earlier one
              const idx = aggregate.indexOf(existing);
              aggregate[idx] = f;
            } else {
              aggregate.push(f);
            }
          }
        }
      });
      this.aggregateGuardianFirsts = aggregate.sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime());
      
      // Debug logging for D1 raids
      const d1Raids = this.aggregateGuardianFirsts.filter(f => f.game === 'D1' && f.type === 'raid');
      console.log('[DEBUG][D1UI] aggregateGuardianFirsts D1 raids after calculation:', d1Raids.map(r => ({
        name: r.name,
        referenceId: r.referenceId,
        completionDate: r.completionDate
      })));
      
      // Aggregate guardian firsts computation completed
      // Default existing property points to aggregate so legacy helpers keep working
      this.guardianFirsts = this.aggregateGuardianFirsts;
      // Compute first-ever activity for this specific player once firsts are loaded
      this.firstEverActivities[pKey] = await this.computeFirstEverActivityForPlayer(player);
    } catch (error) {
      console.error('[Firsts] Error loading guardian firsts:', error);
      this.guardianFirstsMap[this.getPlayerKey(player)] = [];
      this.aggregateGuardianFirsts = [];
      this.guardianFirsts = [];
      this.firstEverActivities[this.getPlayerKey(player)] = undefined;
    } finally {
      this.loadingGuardianFirsts = false;
      this.updatePlatformTabs();
      this.cdr.detectChanges();
    }
  }

  /** Per-player helper variants (platform-specific) */
  private getFirstsForPlayer(player: PlayerSearchDisplay): ActivityFirstCompletion[] {
    return this.guardianFirstsMap[this.getPlayerKey(player)] || [];
  }

  getPlayerRaids(player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const list = this.getFirstsForPlayer(player).filter(f => f.type === 'raid' && f.game === game);
    return this.sortRaids(list, game);
  }

  getPlayerDungeons(player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const list = this.getFirstsForPlayer(player).filter(f => f.type === 'dungeon' && f.game === game);
    if (game === 'D1') return [];
    return this.sortDungeons(list);
  }

  getPlayerPantheonRaids(player: PlayerSearchDisplay): ActivityFirstCompletion[] {
    const list = this.getFirstsForPlayer(player).filter(f => 
      f.type === 'raid' && f.game === 'D2' && 
      (f.name.includes('The Pantheon:') || f.name.includes('Pantheon:'))
    );
    return this.sortPantheonRaids(list);
  }

  getPlayerRegularRaids(player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const list = this.getFirstsForPlayer(player).filter(f => 
      f.type === 'raid' && f.game === game && 
      !f.name.includes('The Pantheon:') && !f.name.includes('Pantheon:')
    );
    return this.sortRaids(list, game);
  }

  /** Aggregate helpers */
  getAggregateRaids(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const d1Raids = this.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'raid');
    console.log('[DEBUG][D1UI] getAggregateRaids - aggregateGuardianFirsts D1 raids:', d1Raids.map(r => ({
      name: r.name,
      referenceId: r.referenceId,
      completionDate: r.completionDate
    })));
    const earliest = this.getEarliestFirsts(d1Raids);
    console.log('[DEBUG][D1UI] getAggregateRaids - after getEarliestFirsts:', earliest.map(r => ({
      name: r.name,
      referenceId: r.referenceId,
      completionDate: r.completionDate
    })));
    return this.sortRaids(earliest, game);
  }

  getAggregateDungeons(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const dungeonFirsts = this.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'dungeon');
    
    // Process dungeon firsts for aggregation
    
    const earliest = this.getEarliestFirsts(dungeonFirsts);
    return this.sortDungeons(earliest);
  }

  /**
   * Gets raids grouped by base activity name with versions
   */
  getGroupedRaids(game: 'D1' | 'D2'): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const raids = this.getAggregateRaids(game);
    return this.groupActivitiesByBaseName(raids);
  }

  /**
   * Gets dungeons grouped by base activity name with versions
   */
  getGroupedDungeons(game: 'D1' | 'D2'): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const dungeons = this.getAggregateDungeons(game);
    return this.groupActivitiesByBaseName(dungeons);
  }

  /**
   * Gets Pantheon raids grouped by base activity name with versions
   */
  getGroupedPantheonRaids(): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const allRaids = this.getAggregateRaids('D2');
    const pantheonRaids = allRaids.filter(raid => 
      raid.name.includes('The Pantheon:') || raid.name.includes('Pantheon:')
    );
    const sortedPantheonRaids = this.sortPantheonRaids(pantheonRaids);
    return this.groupActivitiesByBaseName(sortedPantheonRaids);
  }

  /** Wrapper to allow grouping from template */
  public groupActivitiesByBaseNamePublic(activities: ActivityFirstCompletion[]): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    return this.groupActivitiesByBaseName(activities);
  }

  /** Per-player Pantheon groups */
  public getGroupedPantheonRaidsForPlayer(player: PlayerSearchDisplay): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const list = this.getFirstsForPlayer(player).filter(f => f.type === 'raid' && f.game === 'D2' && (f.name.includes('The Pantheon:') || f.name.includes('Pantheon:')));
    return this.groupActivitiesByBaseName(list);
  }

  /**
   * Gets regular D2 raids (excluding Pantheon) grouped by base activity name with versions
   */
  getGroupedRegularRaids(): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const allRaids = this.getAggregateRaids('D2');
    const regularRaids = allRaids.filter(raid => 
      !raid.name.includes('The Pantheon:') && !raid.name.includes('Pantheon:')
    );
    return this.groupActivitiesByBaseName(regularRaids);
  }

  /**
   * Multi-version regular D2 raids (2+ versions) for full grouped display
   */
  getGroupedRegularRaidsMulti(): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    return this.getGroupedRegularRaids().filter(group => (group.versions?.length || 0) > 1);
  }

  /**
   * Single-version regular D2 raids as compact cards
   */
  getRegularRaidSingleCards(): Array<{ baseName: string; first: ActivityFirstCompletion }> {
    return this.getGroupedRegularRaids()
      .filter(group => (group.versions?.length || 0) === 1)
      .map(group => ({ baseName: group.baseName, first: group.versions[0] }));
  }

  /**
   * Multi-version D1 raids (2+ versions) for full grouped display
   */
  getGroupedD1RaidsMulti(): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    return this.getGroupedRaids('D1').filter(group => (group.versions?.length || 0) > 1);
  }

  /**
   * Single-version D1 raids as compact cards
   */
  getD1RaidSingleCards(): Array<{ baseName: string; first: ActivityFirstCompletion }> {
    return this.getGroupedRaids('D1')
      .filter(group => (group.versions?.length || 0) === 1)
      .map(group => ({ baseName: group.baseName, first: group.versions[0] }));
  }

  /**
   * Gets all D2 raids with all possible variants (completed or not)
   */
  getAllD2RaidVariants(): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }> 
  }> {
    const raidVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    
    // Collect all completed raids
    const allRaids = this.getAggregateRaids('D2');
    
    for (const raid of allRaids) {
      const baseName = this.getBaseActivityName(raid.name);
      const version = this.getActivityVersion(raid.name);
      
      if (!raidVariants.has(baseName)) {
        raidVariants.set(baseName, new Map());
      }
      raidVariants.get(baseName)!.set(version, raid);
    }

    // Define all possible variants for each raid
    const raidVariantDefinitions = new Map<string, string[]>([
      ['Leviathan', ['Normal', 'Prestige']],
      ['Leviathan, Eater of Worlds', ['Normal', 'Prestige']],
      ['Leviathan, Spire of Stars', ['Normal', 'Prestige']],
      ['Crown of Sorrow', ['Normal']],
      ['Garden of Salvation', ['Normal']],
      ['Deep Stone Crypt', ['Normal']],
      ['Vault of Glass', ['Normal', 'Master', 'Standard']],
      ['Vow of the Disciple', ['Standard', 'Legend', 'Master']],
      ['King\'s Fall', ['Standard', 'Normal', 'Master', 'Expert']],
      ['Root of Nightmares', ['Normal']],
      ['Crota\'s End', ['Standard', 'Normal', 'Master', 'Legend']],
      ['Salvation\'s Edge', ['Standard', 'Master']],
      ['Last Wish', ['Standard', 'Normal']]
    ]);

    const result: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> }> = [];

    for (const [baseName, possibleVersions] of raidVariantDefinitions) {
      const completedVariants = raidVariants.get(baseName) || new Map();

      // Merge Normal/Standard into a single base-difficulty entry using earliest completion
      const hasNormal = completedVariants.get('Normal');
      const hasStandard = completedVariants.get('Standard');
      let baseFirst: ActivityFirstCompletion | undefined = undefined;
      if (hasNormal && hasStandard) {
        baseFirst = new Date(hasNormal.completionDate) <= new Date(hasStandard.completionDate) ? hasNormal : hasStandard;
      } else {
        baseFirst = hasStandard || hasNormal || undefined;
      }
      const baseLabel = hasStandard ? 'Standard' : (hasNormal ? 'Normal' : (possibleVersions.includes('Standard') ? 'Standard' : 'Normal'));

      const variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> = [];

      // Push base-difficulty merged row
      if (possibleVersions.includes('Normal') || possibleVersions.includes('Standard')) {
        variants.push({ version: baseLabel, first: baseFirst, hasClear: !!baseFirst });
      }

      // Push remaining versions excluding Normal/Standard
      for (const version of possibleVersions) {
        if (version === 'Normal' || version === 'Standard') continue;
        const first = completedVariants.get(version);
        variants.push({ version, first, hasClear: !!first });
      }

      result.push({ baseName, variants });
    }

    return result.sort((a, b) => a.baseName.localeCompare(b.baseName));
  }

  /** Per-player: D2 raids with variants */
  getAllD2RaidVariantsForPlayer(player: PlayerSearchDisplay): Array<{
    baseName: string;
    variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }>;
  }> {
    const raidVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    const all = this.getFirstsForPlayer(player).filter(f => f.type === 'raid' && f.game === 'D2');
    for (const raid of all) {
      const baseName = this.getBaseActivityName(raid.name);
      const version = this.getActivityVersion(raid.name);
      if (!raidVariants.has(baseName)) raidVariants.set(baseName, new Map());
      raidVariants.get(baseName)!.set(version, raid);
    }
    const defs = new Map<string, string[]>([
      ['Leviathan', ['Normal', 'Prestige']],
      ['Leviathan, Eater of Worlds', ['Normal', 'Prestige']],
      ['Leviathan, Spire of Stars', ['Normal', 'Prestige']],
      ['Crown of Sorrow', ['Normal']],
      ['Garden of Salvation', ['Normal']],
      ['Deep Stone Crypt', ['Normal']],
      ['Vault of Glass', ['Normal', 'Master', 'Standard']],
      ['Vow of the Disciple', ['Standard', 'Legend', 'Master']],
      ["King's Fall", ['Standard', 'Normal', 'Master', 'Expert']],
      ['Root of Nightmares', ['Normal']],
      ["Crota's End", ['Standard', 'Normal', 'Master', 'Legend']],
      ["Salvation's Edge", ['Standard', 'Master']],
      ['Last Wish', ['Standard', 'Normal']]
    ]);
    const result: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> }> = [];
    for (const [baseName, possible] of defs) {
      const completed = raidVariants.get(baseName) || new Map();
      const hasNormal = completed.get('Normal');
      const hasStandard = completed.get('Standard');
      let baseFirst: ActivityFirstCompletion | undefined = hasStandard || hasNormal;
      if (hasNormal && hasStandard) baseFirst = new Date(hasNormal.completionDate) <= new Date(hasStandard.completionDate) ? hasNormal : hasStandard;
      const baseLabel = hasStandard ? 'Standard' : (hasNormal ? 'Normal' : (possible.includes('Standard') ? 'Standard' : 'Normal'));
      const variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> = [];
      if (possible.includes('Normal') || possible.includes('Standard')) variants.push({ version: baseLabel, first: baseFirst, hasClear: !!baseFirst });
      for (const v of possible) {
        if (v === 'Normal' || v === 'Standard') continue;
        const first = completed.get(v);
        variants.push({ version: v, first, hasClear: !!first });
      }
      result.push({ baseName, variants });
    }
    return result.sort((a, b) => a.baseName.localeCompare(b.baseName));
  }
  /**
   * Gets the first completion image for a raid/dungeon group.
   * Falls back to manifest-based family maps to locate an appropriate referenceId
   * when no variant has a clear yet.
   */
  getFirstCompletionImageForRaid(raid: { baseName: string; variants: Array<{ hasClear: boolean; first?: ActivityFirstCompletion }> }): any {
    const firstWithClear = raid.variants.find(v => v.hasClear);
    if (firstWithClear) {
      return this.getFirstCompletionImage(firstWithClear.first!);
    }

    // Fallback: derive a representative referenceId from the manifest family maps
    const ACTIVITY_FAMILY_MAP = (ActivityDbService as any)['ACTIVITY_FAMILY_MAP'] as Record<string, string> | undefined;
    const D1_FAMILY_MAP = (ActivityDbService as any)['D1_FAMILY_MAP'] as Record<string, string> | undefined;

    let refId: string | undefined;
    let isD1 = false;

    if (ACTIVITY_FAMILY_MAP) {
      for (const [hash, family] of Object.entries(ACTIVITY_FAMILY_MAP)) {
        if (this.getBaseActivityName(family) === raid.baseName) {
          refId = hash;
          break;
        }
      }
    }

    if (!refId && D1_FAMILY_MAP) {
      for (const [hash, family] of Object.entries(D1_FAMILY_MAP)) {
        if (this.getBaseActivityName(family) === raid.baseName) {
          refId = hash;
          isD1 = true;
          break;
        }
      }
    }

    if (refId) {
      const pgcrImage = this.manifest.getActivityPgcrImage(refId, isD1);
      if (pgcrImage) {
        // Normalize to absolute URL when needed
        if (pgcrImage.startsWith('http')) return pgcrImage;
        return 'https://www.bungie.net' + pgcrImage;
      }
    }

    return null;
  }

  /**
   * Gets all D2 dungeons with all possible variants (completed or not)
   */
  getAllD2DungeonVariants(): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }> 
  }> {
    const dungeonVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    
    // Collect all completed dungeons
    const allDungeons = this.getAggregateDungeons('D2');
    
    for (const dungeon of allDungeons) {
      const baseName = this.getBaseActivityName(dungeon.name);
      const version = this.getActivityVersion(dungeon.name);
      
      if (!dungeonVariants.has(baseName)) {
        dungeonVariants.set(baseName, new Map());
      }
      dungeonVariants.get(baseName)!.set(version, dungeon);
    }

    // Define all possible variants for each dungeon
    const dungeonVariantDefinitions = new Map<string, string[]>([
      ['The Shattered Throne', ['Standard']],
      ['Pit of Heresy', ['Normal', 'Master']],
      ['Prophecy', ['Normal', 'Master']],
      ['Grasp of Avarice', ['Normal', 'Master']],
      ['Duality', ['Normal', 'Master']],
      ['Spire of the Watcher', ['Normal', 'Master']],
      ['Ghosts of the Deep', ['Normal', 'Master']],
      ['Warlord\'s Ruin', ['Normal', 'Master']],
      // Removed erroneous 'The Coil'
      // Fixed incorrect name to Vesper's Host
      ['Vesper\'s Host', ['Normal', 'Master']],
      ['Sundered Doctrine', ['Normal', 'Master']]
    ]);

    const result: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> }> = [];

    for (const [baseName, possibleVersions] of dungeonVariantDefinitions) {
      const completedVariants = dungeonVariants.get(baseName) || new Map();

      // Merge Normal/Standard into single base-difficulty entry
      const hasNormal = completedVariants.get('Normal');
      const hasStandard = completedVariants.get('Standard');
      let baseFirst: ActivityFirstCompletion | undefined = undefined;
      if (hasNormal && hasStandard) {
        baseFirst = new Date(hasNormal.completionDate) <= new Date(hasStandard.completionDate) ? hasNormal : hasStandard;
      } else {
        baseFirst = hasStandard || hasNormal || undefined;
      }
      const baseLabel = hasStandard ? 'Standard' : (hasNormal ? 'Normal' : (possibleVersions.includes('Standard') ? 'Standard' : 'Normal'));

      const variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> = [];

      if (possibleVersions.includes('Normal') || possibleVersions.includes('Standard')) {
        variants.push({ version: baseLabel, first: baseFirst, hasClear: !!baseFirst });
      }
      for (const version of possibleVersions) {
        if (version === 'Normal' || version === 'Standard') continue;
        const first = completedVariants.get(version);
        variants.push({ version, first, hasClear: !!first });
      }

      result.push({ baseName, variants });
    }

    return result.sort((a, b) => a.baseName.localeCompare(b.baseName));
  }

  /** Per-player: D2 dungeons with variants */
  getAllD2DungeonVariantsForPlayer(player: PlayerSearchDisplay): Array<{
    baseName: string;
    variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }>;
  }> {
    const dungeonVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    const all = this.getFirstsForPlayer(player).filter(f => f.type === 'dungeon' && f.game === 'D2');
    for (const d of all) {
      const baseName = this.getBaseActivityName(d.name);
      const version = this.getActivityVersion(d.name);
      if (!dungeonVariants.has(baseName)) dungeonVariants.set(baseName, new Map());
      dungeonVariants.get(baseName)!.set(version, d);
    }
    const defs = new Map<string, string[]>([
      ['The Shattered Throne', ['Standard']],
      ['Pit of Heresy', ['Normal', 'Master']],
      ['Prophecy', ['Normal', 'Master']],
      ['Grasp of Avarice', ['Normal', 'Master']],
      ['Duality', ['Normal', 'Master']],
      ['Spire of the Watcher', ['Normal', 'Master']],
      ['Ghosts of the Deep', ['Normal', 'Master']],
      ["Warlord's Ruin", ['Normal', 'Master']],
      ["Vesper's Host", ['Normal', 'Master']],
      ['Sundered Doctrine', ['Normal', 'Master']]
    ]);
    const result: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> }> = [];
    for (const [baseName, possible] of defs) {
      const completed = dungeonVariants.get(baseName) || new Map();
      const hasNormal = completed.get('Normal');
      const hasStandard = completed.get('Standard');
      let baseFirst: ActivityFirstCompletion | undefined = hasStandard || hasNormal;
      if (hasNormal && hasStandard) baseFirst = new Date(hasNormal.completionDate) <= new Date(hasStandard.completionDate) ? hasNormal : hasStandard;
      const baseLabel = hasStandard ? 'Standard' : (hasNormal ? 'Normal' : (possible.includes('Standard') ? 'Standard' : 'Normal'));
      const variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> = [];
      if (possible.includes('Normal') || possible.includes('Standard')) variants.push({ version: baseLabel, first: baseFirst, hasClear: !!baseFirst });
      for (const v of possible) {
        if (v === 'Normal' || v === 'Standard') continue;
        const first = completed.get(v);
        variants.push({ version: v, first, hasClear: !!first });
      }
      result.push({ baseName, variants });
    }
    return result.sort((a, b) => a.baseName.localeCompare(b.baseName));
  }
  /**
   * Gets all D1 raids with all possible variants (completed or not)
   */
  getAllD1RaidVariants(): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }> 
  }> {
    const raidVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    
    // Collect all completed raids
    const allRaids = this.getAggregateRaids('D1');
    console.log('[DEBUG][D1UI] getAllD1RaidVariants - allRaids:', allRaids);
    
    for (const raid of allRaids) {
      const baseName = this.getBaseActivityName(raid.name);
      // For D1 raids, use referenceId to determine variant type since all variants have the same name
      const version = this.getD1RaidVariantName(raid.referenceId, raid.name);
      
      console.log('[DEBUG][D1UI] Processing raid:', {
        name: raid.name,
        baseName,
        referenceId: raid.referenceId,
        version,
        completionDate: raid.completionDate
      });
      
      if (!raidVariants.has(baseName)) {
        raidVariants.set(baseName, new Map());
      }
      const byVersion = raidVariants.get(baseName)!;
      const existing = byVersion.get(version);
      // Keep the earliest completion for a given version (dedupe alt hashes like Normal x2)
      if (!existing || new Date(raid.completionDate) < new Date(existing.completionDate)) {
        byVersion.set(version, raid);
      }
    }

    // Define all possible variants for each D1 raid
    const raidVariantDefinitions = new Map<string, string[]>([
      ['Vault of Glass', ['Normal', 'Hard', '390 Light']],
      ['Crota\'s End', ['Normal', 'Hard', '390 Light']],
      ['King\'s Fall', ['Normal', 'Hard', '390 Light']],
      ['Wrath of the Machine', ['Normal', 'Hard', '390 Light']]
    ]);

    const result: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> }> = [];

    for (const [baseName, possibleVersions] of raidVariantDefinitions) {
      const completedVariants = raidVariants.get(baseName) || new Map();
      const variants = possibleVersions.map(version => {
        const first = completedVariants.get(version);
        return {
          version,
          first,
          hasClear: !!first
        };
      });

      result.push({ baseName, variants });
    }

    return result.sort((a, b) => a.baseName.localeCompare(b.baseName));
  }

  /** Per-player: D1 raids with variants */
  getAllD1RaidVariantsForPlayer(player: PlayerSearchDisplay): Array<{
    baseName: string;
    variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }>;
  }> {
    const raidVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    const all = this.getFirstsForPlayer(player).filter(f => f.type === 'raid' && f.game === 'D1');
    for (const raid of all) {
      const base = this.getBaseActivityName(raid.name);
      // For D1 raids, use referenceId to determine variant type since all variants have the same name
      const version = this.getD1RaidVariantName(raid.referenceId, raid.name);
      if (!raidVariants.has(base)) raidVariants.set(base, new Map());
      raidVariants.get(base)!.set(version, raid);
    }
    const defs = new Map<string, string[]>([
      ['Vault of Glass', ['Normal', 'Hard']],
      ["Crota's End", ['Normal', 'Hard']],
      ["King's Fall", ['Normal', 'Hard']],
      ['Wrath of the Machine', ['Normal', 'Hard']]
    ]);
    const result: Array<{ baseName: string; variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }> }> = [];
    for (const [baseName, possible] of defs) {
      const completed = raidVariants.get(baseName) || new Map();
      const variants = possible.map(v => {
        const first = completed.get(v);
        return { version: v, first, hasClear: !!first };
      });
      result.push({ baseName, variants });
    }
    return result.sort((a, b) => a.baseName.localeCompare(b.baseName));
  }

  /**
   * Groups activities by base name and sorts versions
   */
  private groupActivitiesByBaseName(activities: ActivityFirstCompletion[]): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const groupMap = new Map<string, ActivityFirstCompletion[]>();
    
    for (const activity of activities) {
      // Get the base name (remove version suffix)
      const baseName = this.getBaseActivityName(activity.name);
      
      if (!groupMap.has(baseName)) {
        groupMap.set(baseName, []);
      }
      groupMap.get(baseName)!.push(activity);
    }
    
    // Convert to array and sort
    return Array.from(groupMap.entries())
      .map(([baseName, versions]) => ({
        baseName,
        versions: this.sortVersions(versions)
      }))
      .sort((a, b) => {
        // Sort by base name alphabetically
        return a.baseName.localeCompare(b.baseName);
      });
  }
  /**
   * Sorts versions within a group (Normal, Standard, Explorer, Eternity, Ultimatum, Master)
   */
  private sortVersions(activities: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
    const versionOrder = ['Normal', 'Standard', 'Explorer', 'Eternity', 'Ultimatum', 'Master'];
    
    return activities.sort((a, b) => {
      const aVersion = this.getActivityVersion(a.name);
      const bVersion = this.getActivityVersion(b.name);
      
      const aIndex = versionOrder.indexOf(aVersion);
      const bIndex = versionOrder.indexOf(bVersion);
      
      if (aIndex === -1 && bIndex === -1) return aVersion.localeCompare(bVersion);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  private sortRaids(list: ActivityFirstCompletion[], game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const releaseOrder = game === 'D1' ? [
      'Vault of Glass',
      "Crota's End",
      "King's Fall",
      'Wrath of the Machine'
    ] : [
      'Leviathan',
      'Leviathan, Eater of Worlds',
      'Leviathan, Spire of Stars',
      'Last Wish',
      'Scourge of the Past',
      'Crown of Sorrow',
      'Garden of Salvation',
      'Deep Stone Crypt',
      'Vault of Glass',
      "King's Fall",
      'Vow of the Disciple',
      'Root of Nightmares',
      "Crota's End",
      "Salvation's Edge"
    ];
    return list.slice().sort((a, b) => releaseOrder.indexOf(a.name) - releaseOrder.indexOf(b.name));
  }

  private sortPantheonRaids(list: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
    const pantheonOrder = [
      'The Pantheon: Atraks Sovereign',
      'The Pantheon: Oryx Exalted', 
      'The Pantheon: Rhulk Indomitable',
      'The Pantheon: Nezarec Sublime'
    ];
    return list.slice().sort((a, b) => pantheonOrder.indexOf(a.name) - pantheonOrder.indexOf(b.name));
  }

  private sortDungeons(list: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
    const releaseOrder = [
      'The Shattered Throne',
      'Pit of Heresy',
      'Prophecy',
      'Grasp of Avarice',
      'Duality',
      'Spire of the Watcher',
      'Ghosts of the Deep',
      "Warlord's Ruin",
      "Vesper's Host",
      "Sundered Doctrine"
    ];
    
    return list.slice().sort((a, b) => {
      // Extract base dungeon name (remove version suffix)
      const aBase = this.getBaseDungeonName(a.name);
      const bBase = this.getBaseDungeonName(b.name);
      
      const aIndex = releaseOrder.indexOf(aBase);
      const bIndex = releaseOrder.indexOf(bBase);
      
      // If base names are different, sort by release order
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      
      // If base names are the same, sort by version (Normal < Master < Explorer < Eternity < Ultimatum)
      const versionOrder = ['Normal', 'Standard', 'Explorer', 'Eternity', 'Ultimatum', 'Master'];
      const aVersion = this.getDungeonVersion(a.name);
      const bVersion = this.getDungeonVersion(b.name);
      
      const aVersionIndex = versionOrder.indexOf(aVersion);
      const bVersionIndex = versionOrder.indexOf(bVersion);
      
      return aVersionIndex - bVersionIndex;
    });
  }

  /**
   * Gets the mapped activity name from our custom mapping
   */
  private getMappedActivityName(referenceId: string): string | null {
    // Import the mapping from the activity db service
    const mapping = (this.activityDb as any).ACTIVITY_FAMILY_MAP;
    return mapping?.[referenceId] || null;
  }

  /**
   * Extracts the base activity name from a versioned activity name.
   * e.g., "Vesper's Host: Master" -> "Vesper's Host"
   * e.g., "Crota's End: Normal" -> "Crota's End"
   */
  private getBaseActivityName(versionedName: string): string {
    const colonIndex = versionedName.indexOf(': ');
    if (colonIndex === -1) {
      return versionedName; // No version suffix
    }
    return versionedName.substring(0, colonIndex);
  }
  private getBaseRaidName(manifestName: string, game: 'D1' | 'D2'): string {
    // For D1, all raid variants have the same name, so we can return it as-is
    if (game === 'D1') {
      return manifestName;
    }

    // For D2, handle manifest names that may have variants
    // Remove common variant suffixes
    const variantSuffixes = [
      ': Master',
      ': Standard', 
      ': Normal',
      ': Prestige',
      ': Challenge',
      ': Expert',
      ': Legend',
      ': Contest',
      ': Day One',
      ': World First',
      ': Hard',
      ': Easy',
      ': Heroic',
      ': Grandmaster'
    ];

    let baseName = manifestName;
    
    // Remove variant suffixes
    for (const suffix of variantSuffixes) {
      if (baseName.endsWith(suffix)) {
        baseName = baseName.replace(suffix, '');
        break;
      }
    }

    // Handle specific D2 raid groupings
    if (baseName.includes('Leviathan')) return 'Leviathan';
    if (baseName.includes('Last Wish')) return 'Last Wish';
    if (baseName.includes('Scourge of the Past')) return 'Scourge of the Past';
    if (baseName.includes('Crown of Sorrow')) return 'Crown of Sorrow';
    if (baseName.includes('Garden of Salvation')) return 'Garden of Salvation';
    if (baseName.includes('Deep Stone Crypt')) return 'Deep Stone Crypt';
    if (baseName.includes('Vault of Glass')) return 'Vault of Glass';
    if (baseName.includes('Vow of the Disciple')) return 'Vow of the Disciple';
    if (baseName.includes('King\'s Fall')) return 'King\'s Fall';
    if (baseName.includes('Root of Nightmares')) return 'Root of Nightmares';
    if (baseName.includes('Crota\'s End')) return 'Crota\'s End';
    if (baseName.includes('Salvation\'s Edge')) return 'Salvation\'s Edge';
    if (baseName.includes('The Final Shape')) return 'The Final Shape';
    if (baseName.includes('Duality')) return 'Duality';
    if (baseName.includes('Grasp of Avarice')) return 'Grasp of Avarice';
    if (baseName.includes('Prophecy')) return 'Prophecy';
    if (baseName.includes('Pit of Heresy')) return 'Pit of Heresy';
    if (baseName.includes('Shattered Throne')) return 'Shattered Throne';
    if (baseName.includes('Spire of the Watcher')) return 'Spire of the Watcher';
    if (baseName.includes('Ghosts of the Deep')) return 'Ghosts of the Deep';
    if (baseName.includes('Warlord\'s Ruin')) return 'Warlord\'s Ruin';
    if (baseName.includes('Pantheon')) return 'Pantheon';

    return baseName;
  }

  /**
   * Extracts the base dungeon name from a versioned dungeon name.
   * e.g., "Vesper's Host: Master" -> "Vesper's Host"
   */
  private getBaseDungeonName(versionedName: string): string {
    return this.getBaseActivityName(versionedName);
  }

  /**
   * Extracts the dungeon version from a versioned dungeon name.
   * e.g., "Vesper's Host: Master" -> "Master"
   */
  private getDungeonVersion(versionedName: string): string {
    const colonIndex = versionedName.indexOf(': ');
    if (colonIndex === -1) {
      return 'Normal'; // Default to Normal if no version specified
    }
    return versionedName.substring(colonIndex + 2);
  }

  /** Loads first solo / solo-flawless completions for all dungeons for the given player. */
  private async loadDungeonSoloFirsts(player: PlayerSearchDisplay): Promise<void> {
    this.loadingDungeonSoloFirsts[player.membershipId] = true;
    try {
      const data = await this.activityDb.getDungeonSoloFirsts(player.membershipId);
      this.dungeonSoloFirsts[player.membershipId] = data;
    } catch (error) {
      console.error('[SoloFirsts] Error loading dungeon solos:', error);
      this.dungeonSoloFirsts[player.membershipId] = [];
    } finally {
      this.loadingDungeonSoloFirsts[player.membershipId] = false;
      this.cdr.detectChanges();
    }
  }

  private clearFilteredActivitiesCache(): void {
    this.filteredActivitiesCache.clear();
  }

  openExternalPGCR(activity: ActivityHistory, isD1: boolean) {
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) return;
    const game = isD1 ? 'destiny1' : 'destiny2';
    window.open(`https://pgcr.eververse.trade/${game}/${instanceId}`, '_blank', 'noopener');
  }

  // Route per-character row clicks to the right PGCR link regardless of data shape
  onClickPerCharacterFirst(first: ActivityHistory | ActivityFirstCompletion, player: PlayerSearchDisplay): void {
    const anyFirst: any = first as any;
    if (anyFirst && anyFirst.instanceId && (anyFirst.completionDate || anyFirst.type)) {
      // Looks like ActivityFirstCompletion
      this.openExternalPGCRForFirst(anyFirst as ActivityFirstCompletion);
      return;
    }
    // Fallback as ActivityHistory
    this.openExternalPGCR(first as ActivityHistory, this.isD1Player(player));
  }

  handleImageError(event: Event, isD1: boolean): void {
    const imgElement = event.target as HTMLImageElement;
    // Prevent infinite loop: only set if not already the fallback
    if (!imgElement.src.includes('assets/icons/activities/ghost.png')) {
      imgElement.src = 'assets/icons/activities/ghost.png';
    } else {
      // Remove error handler to prevent further loops
      imgElement.onerror = null;
    }
  }

  async clearAllActivitiesFromDb() {
    if (!confirm('Are you sure you want to clear all activities from the database? This cannot be undone.')) return;
    await this.activityDb.clearAllActivities();
    this.activities = {};
    this.clearCache();
    this.accountStats = {
      totalTime: 0,
      totalActivityTime: 0,
      totalActivityCount: 0,
      totalSeals: 0,
      perType: {}
    };
    this.cdr.detectChanges();
    alert('All activities have been cleared from the database.');
  }

  // Add this method to trigger activity refresh only when Search is clicked
  onDateSearch() {
    this.onDateSelect(this.selectedMonth.toString(), this.selectedDay.toString());
  }

  /**
   * Debug method to manually clear caches and reload first ever activity
   */
  async debugReloadFirstEver() {
    // debug removed
    this.clearFirstEverActivitiesCache();
    this.firstEverActivity = undefined;
    
    if (this.selectedPlayers.length > 0) {
      const player = this.selectedPlayers[0];
      // debug removed
      this.firstEverActivity = await this.computeFirstEverActivityForSelectedPlayerFromDb();
      this.cdr.detectChanges();
    }
  }

  // Debug: Get all record hashes from d2TitleRecords
  getAllRecordHashes(): string[] {
    const records = (window as any).d2TitleRecords;
    return records ? Object.keys(records) : [];
  }

  // Debug: Get a record by hash
  getRecordByHash(hash: string): any {
    const records = (window as any).d2TitleRecords;
    return records ? records[hash] : null;
  }


  getFilteredRecordHashes(): string[] {
    const filter = this.recordHashFilter.trim().toLowerCase();
    if (!filter) return this.getAllRecordHashes();
    return this.getAllRecordHashes().filter(hash => {
      if (hash.includes(filter)) return true;
      const record = this.getRecordByHash(hash);
      return record && JSON.stringify(record).toLowerCase().includes(filter);
    });
  }

  // Public method to trigger the minimal Bungie API test for the selected player
  public runProfileRecordsTest() {
    if (this.selectedPlayers.length > 0) {
      const player = this.selectedPlayers[0];

    } else {
      console.warn('[TEST] No player selected for test.');
    }
  }

  /**
   * Returns the first-ever activity for a player for the specified game (D1 or D2),
   * delegated to the centralized FirstActivityService.
   */
  async getFirstEverActivity(player: PlayerSearchDisplay, game: 'D1' | 'D2'): Promise<ActivityHistory | undefined> {
    return this.firstActivityService.getFirstEverActivity({ membershipId: player.membershipId, game });
  }

  // Replace the helper function with a centralized service call
  async computeFirstEverActivityForSelectedPlayerFromDb(): Promise<ActivityHistory | undefined> {
    if (this.selectedPlayers.length === 0) return undefined;
    const player = this.selectedPlayers[0];
    return this.firstActivityService.getFirstEverActivity({ membershipId: player.membershipId, game: player.game });
  }



  // Add a helper to set firstEverActivity using the centralized service
  private async setFirstEverActivityFromDb() {
    if (this.selectedPlayers.length > 0) {
      const player = this.selectedPlayers[0];
      this.firstEverActivity = await this.firstActivityService.getFirstEverActivity({ membershipId: player.membershipId, game: player.game });
    } else {
      this.firstEverActivity = undefined;
    }
    this.cdr.detectChanges();
  }
  private async onTabChangeLegacy(tab: 'activities' | 'firsts' | 'titles') {
    this.activeTab = tab;
    if (tab === 'titles' && this.selectedPlayers.length > 0) {
      this.loadingTitlesOverall = true;
      for (const player of this.selectedPlayers) {
        if (this.isD1Player(player)) continue; // skip Destiny 1 profiles (no titles)
        const pKey = this.getPlayerKey(player);
        if (!this.playerTitles[pKey]) {
          this.loadingTitles[pKey] = true;
          try {
            if (!this.manifest.isLoadedSync) {
              await this.manifest.isLoaded().toPromise();
            }
            const presentationNodes = this.manifest.getPresentationNodes();
            // Hashes for current and legacy titles
            const currentTitlesHash = 616318467;
            const legacyTitlesHash = 1881970629;
            const getChildNodes = (parentHash: number) => {
              const parentNode = presentationNodes[parentHash];
              if (!parentNode || !parentNode.children || !Array.isArray(parentNode.children.presentationNodes)) return [];
              return parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean);
            };
            const currentTitleNodes = getChildNodes(currentTitlesHash);
            const legacyTitleNodes = getChildNodes(legacyTitlesHash);
            // Gather all title nodes (current + legacy)
            const titleParentHashes = [616318467, 1881970629]; // Current and Legacy Titles
            let allTitleNodes: any[] = [];
            for (const parentHash of titleParentHashes) {
              const parentNode = presentationNodes[parentHash];
              if (!parentNode || !parentNode.children || !Array.isArray(parentNode.children.presentationNodes)) continue;
              allTitleNodes.push(...parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean));
            }
            // Get player records
            const response = await firstValueFrom(this.bungieService.getPlayerTitles(player.membershipType, player.membershipId));
            const records = response.Response?.profileRecords?.data?.records || {};
            const charRecords = response.Response?.characterRecords?.data as { [characterId: string]: { records?: { [key: string]: TitleRecord } } } || {};
      // debug removed
            // Debug: Print all completionRecordHash values from manifest title nodes
            for (const node of allTitleNodes) {
              if (!node || !node.completionRecordHash) continue;
              let hasRecord = !!records[node.completionRecordHash];
              if (!hasRecord) {
                // Check all character records for this hash
                for (const charId of Object.keys(charRecords)) {
                  const charRecordObj = charRecords[charId];
                  if (charRecordObj?.records && charRecordObj.records[node.completionRecordHash]) {
                    hasRecord = true;
                    // debug removed
                    break;
                  }
                }
              }
              if (!hasRecord) {
                // debug removed
              }
            }
            // Build a single list of titles (show all manifest nodes, even if no record)
            const titleMap: { [key: string]: any } = {};
            for (const node of allTitleNodes) {
              if (!node || !node.completionRecordHash) {
                // debug removed
                continue;
              }
              let record = records[node.completionRecordHash];
              let foundInCharacter = false;
              if (!record) {
                for (const charId of Object.keys(charRecords)) {
                  const charRecordObj = charRecords[charId];
                  if (charRecordObj?.records && charRecordObj.records[node.completionRecordHash]) {
                    record = charRecordObj.records[node.completionRecordHash];
                    foundInCharacter = true;
                    break;
                  }
                }
              }
              // Get the DestinyRecordDefinition for the completionRecordHash
              const recordDef = this.manifest.getTitleDefs()[node.completionRecordHash];
              // Prefer special mapping name if present
              const special = SPECIAL_TITLES[node.completionRecordHash] || SPECIAL_TITLES[node.hash];
              let displayName = special ? special.name : (recordDef?.titleInfo?.titlesByGender?.Male || node.displayProperties?.name || 'Unknown');
              const normalizedName = this.normalizeTitleName(displayName);
              // Use Bungie bitmask for completion if record exists
              const isCompleted = record ? ((record.state & 1) !== 0) : false;
              // Gilding logic for all eligible titles
              let isGilded = false;
              let timesGilded = 0;
              let gildedIcon: string | undefined = undefined;
              let mappingExists = false;
              // Use special-case hash for current Conqueror/Flawless, otherwise manifest's hash
              let gildingTrackingHash = special?.gildingTrackingRecordHash || recordDef?.titleInfo?.gildingTrackingRecordHash;
              let isGildable = !!gildingTrackingHash;
              if (isGildable && isCompleted) {
                mappingExists = !!this.GILDED_SEAL_IMAGE_MAP[normalizedName];
                // Look up the gilding tracking record in both profile and character records
                let gildingRecord = records[gildingTrackingHash];
                if (!gildingRecord) {
                  for (const charId of Object.keys(charRecords)) {
                    const charRecordObj = charRecords[charId];
                    if (charRecordObj?.records && charRecordObj.records[gildingTrackingHash]) {
                      gildingRecord = charRecordObj.records[gildingTrackingHash];
                      break;
                    }
                  }
                }
                if (gildingRecord) {
                  timesGilded = gildingRecord.completedCount || 0;
                  isGilded = timesGilded > 0;
                  if (isGilded && mappingExists) {
                    gildedIcon = this.GILDED_SEAL_IMAGE_MAP[normalizedName];
                  }
                  // debug removed
                } else {
                  // debug removed
                }
              } else if (isGildable && !isCompleted) {
                // If not completed, do not show gilded info
                // debug removed
              }
              // Debug: Output each title's record and completion logic
              // debug removed
              // Calculate progress percentage for incomplete titles
              let progressPercent: number | undefined;
              if (!isCompleted && record && Array.isArray((record as any).objectives)) {
                let total = 0;
                let done = 0;
                for (const obj of (record as any).objectives) {
                  if (obj?.visible === false) continue;
                  const target = obj.completionValue ?? 1;
                  total += target;
                  done += Math.min(obj.progress ?? 0, target);
                }
                if (total > 0) {
                  progressPercent = Math.round((done / total) * 100);
                }
              }
              // Use a unique key for deduplication: displayName + completionRecordHash
              const uniqueKey = `${displayName}#${node.completionRecordHash}`;
              if (!titleMap[uniqueKey]) {
                titleMap[uniqueKey] = {
                  hash: node.completionRecordHash,
                  name: displayName,
                  icon: (isGilded && gildedIcon) ? gildedIcon : (node.displayProperties?.icon ? `https://www.bungie.net${node.displayProperties.icon}` : null),
                  completed: isCompleted,
                  isGilded,
                  timesGilded: (isCompleted && timesGilded > 0) ? timesGilded : undefined,
                  gildedIcon: (isGilded && gildedIcon) ? gildedIcon : undefined,
                  locked: !isCompleted,
                  missingRecord: !record,
                  altIcon: (() => {
                    const frames = node.iconSequences && node.iconSequences[1] && node.iconSequences[1].frames;
                    if (frames && frames.length > 0) {
                      return `https://www.bungie.net${frames[frames.length - 1]}`; // grey/silver variant
                    }
                    return undefined;
                  })(),
                  legacy: (node.parentNodeHashes || []).includes(1881970629),
                  releaseRank: RELEASE_ORDER[normalizedName] || 0,
                  normalized: normalizedName,
                  progressPercent: progressPercent,
                };
              }
            }
            // Split into completed and locked, then sort
            const allTitles = Object.values(titleMap);
            const completed = allTitles.filter((t: any) => t.completed).sort((a: any, b: any) => a.name.localeCompare(b.name));
            const locked = allTitles.filter((t: any) => !t.completed).sort((a: any, b: any) => a.name.localeCompare(b.name));
            this.playerTitles[pKey] = [...completed, ...locked];
            // Debug: Print all record hashes for the current user
            const motHashes = ['126238604', '3175660257']; // MoT 2024, 2023
            const recordKeys = Object.keys(records);
            // debug removed
            for (const motHash of motHashes) {
              let found = !!records[motHash];
              if (!found) {
                for (const charId of Object.keys(charRecords)) {
                  const charRecordObj = charRecords[charId];
                  if (charRecordObj?.records && charRecordObj.records[motHash]) {
                    found = true;
                    // debug removed
                    break;
                  }
                }
              }
              if (!found) {
                // debug removed
              } else {
                // debug removed
              }
            }
            // Add MoT 2024 debug info for this player
            this.motDebug[player.membershipId] = records['126238604'] || null;
          } catch (err) {
            // Store an empty list when we fail to fetch titles so downstream code can safely iterate
            this.playerTitles[pKey] = [];
          } finally {
            this.loadingTitles[pKey] = false;
            this.cdr.markForCheck();
          }
        }
      }
      // After fetching titles for all players, create aggregatedTitles based on main/cross-save account.
      // Choose first Destiny 2 profile as the reference account for ordering
      const mainPlayer = (this.selectedPlayers.find(p => !this.isD1Player(p) && p.isPrimary) ||
                          this.crossSavePlayer ||
                          this.selectedPlayers.find(p => !this.isD1Player(p))) as typeof this.selectedPlayers[0];
      const mainList = mainPlayer ? (this.playerTitles[this.getPlayerKey(mainPlayer)] || []) : [];

      // Build a map keyed by title name to avoid duplicates and to merge data cleanly
      const aggMap = new Map<number, any>();

      const addHolder = (titleObj: any, holder: { displayName: string; platform: string }) => {
        if (!titleObj.holders) titleObj.holders = [];
        titleObj.holders.push(holder);
      };

      // Seed with the main account's titles (completed **and** locked)
      for (const t of mainList as any[]) {
        // Skip duplicates; prefer a completed version over locked if both exist
        const existing = aggMap.get(t.hash);
        if (!existing) {
          // Clone to avoid mutating original reference
          const clone = { ...t, holders: [] as { displayName: string; platform: string }[] };
          if (t.completed) {
            addHolder(clone, { displayName: mainPlayer.displayName, platform: mainPlayer.platform });
          }
          aggMap.set(t.hash, clone);
        } else if (!existing.completed && t.completed) {
          // Replace locked placeholder with completed version
          const clone = { ...t, holders: existing.holders };
          if (clone.holders.length === 0) {
            addHolder(clone, { displayName: mainPlayer.displayName, platform: mainPlayer.platform });
          }
          aggMap.set(t.hash, clone);
        }
      }

      // Merge in titles from the rest of the selected players
      for (const p of this.selectedPlayers) {
        if (this.isD1Player(p)) continue; // skip D1 accounts entirely
        if (p.membershipId === mainPlayer.membershipId) continue;
        const list = this.playerTitles[this.getPlayerKey(p)] || [];
        for (const t of list as any[]) {
          const existing = aggMap.get(t.hash);
          if (!existing) {
            // Clone and seed map (even if locked) so other players can add themselves as holders later
            const clone = { ...t, holders: [] as { displayName: string; platform: string }[] };
            aggMap.set(t.hash, clone);
          }
          // If this player has completed the title, record them as a holder
          if (t.completed) {
            const ex = aggMap.get(t.hash)!;
            addHolder(ex, { displayName: p.displayName, platform: p.platform });
            // Upgrade to completed if previously locked
            if (!ex.completed) {
              ex.completed = true;
              ex.locked = false;
              if (!ex.icon) ex.icon = t.icon;
            }
          }
        }
      }

      // Rebuild aggregatedTitles via the new service
      this.aggregatedTitles = this.titleService.aggregateTitles(
        this.selectedPlayers as any,
        this.playerTitles as any
      );
      this.loadingTitlesOverall = false;
      this.cdr.detectChanges();
    }
  }

  isRecordCompleted(record: any): boolean {
    return !!record && (record.state & 1) !== 0;
  }

  /** Returns the DungeonSoloFirst entry matching the given family for the player, or undefined. */
  private getDungeonSoloFirstForPlayerExact(player: PlayerSearchDisplay, family: string): DungeonSoloFirst | undefined {
    return this.dungeonSoloFirsts[player.membershipId]?.find(d => d.family === family);
  }

  openExternalPGCRFromStored(activity: any) {
    if (!activity) return;
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) return;
    this.openExternalPGCR(activity as any, false);
  }

  private formatDateSolo(dateStr: string | Date | undefined): string {
    if (typeof dateStr === 'string') {
      return this.formatDate(dateStr);
    }
    if (dateStr instanceof Date) {
      return this.formatDate(dateStr.toISOString());
    }
    return '';
  }

  /**
   * Returns the DungeonSoloFirst entry that matches the exact dungeon version.
   * This now matches by full version name (e.g., "Vesper's Host: Master") for precise solo tracking.
   */
  getDungeonSoloFirstForPlayer(player: PlayerSearchDisplay, label: string): DungeonSoloFirst | undefined {
    const list = this.dungeonSoloFirsts[player.membershipId];
    if (!list) return undefined;
    
    // First, try exact match by full version name
    let result = list.find(d => d.fullName === label);
    
    // If no exact match, try to map the label to our custom names
    if (!result) {
      const mappedName = this.mapManifestNameToCustomName(label);
      if (mappedName) {
        result = list.find(d => d.fullName === mappedName);
      }
    }
    
    // If still no match and this looks like a dungeon name, try to find by base name
    if (!result && this.isDungeonName(label)) {
      // Find all versions of this dungeon that have solo data
      const matchingVersions = list.filter(d => d.family === label);
      
      if (matchingVersions.length > 0) {
        // Return the version with the earliest solo completion
        result = matchingVersions.reduce((earliest, current) => {
          if (!earliest.firstSolo) return current;
          if (!current.firstSolo) return earliest;
          return new Date(current.firstSolo.period) < new Date(earliest.firstSolo.period) ? current : earliest;
        });
      }
    }
    
    return result;
  }
  /**
   * Maps manifest activity names to our custom fullName mappings
   */
  private mapManifestNameToCustomName(manifestName: string): string | null {
    // Handle common naming differences between manifest and our mappings
    const mappings: { [key: string]: string } = {
      // Ghosts of the Deep variations
      'Ghosts of the Deep: Standard': 'Ghosts of the Deep: Normal',
      'Ghosts of the Deep': 'Ghosts of the Deep: Normal',
      
      // Prophecy variations  
      'Prophecy: Explorer': 'Prophecy: Explorer', // This should already be correct
      'Prophecy': 'Prophecy: Normal',
      
      // Spire variations
      'Spire of the Watcher: Standard': 'Spire of the Watcher: Normal',
      'Spire of the Watcher': 'Spire of the Watcher: Normal',
      
      // Vesper's Host variations
      "Vesper's Host: Standard": "Vesper's Host: Normal",
      "Vesper's Host": "Vesper's Host: Normal",
      
      // Sundered Doctrine variations
      "Sundered Doctrine: Standard": "Sundered Doctrine: Normal",
      "Sundered Doctrine": "Sundered Doctrine: Normal",
      
      // Warlord's Ruin variations
      "Warlord's Ruin: Standard": "Warlord's Ruin: Standard", // This should already be correct
      "Warlord's Ruin": "Warlord's Ruin: Standard"
    };
    
    return mappings[manifestName] || null;
  }

  /**
   * Helper method to determine if a label represents a dungeon name
   */
  private isDungeonName(label: string): boolean {
    const dungeonNames = [
      'The Shattered Throne', 'Pit of Heresy', 'Prophecy', 'Grasp of Avarice',
      'Duality', 'Spire of the Watcher', 'Ghosts of the Deep', "Warlord's Ruin",
      "Vesper's Host", "Sundered Doctrine"
    ];
    return dungeonNames.includes(label);
  }

  getPlatformIconForFirst(first: { membershipId?: string }): string {
    const pl = first && first.membershipId ? this.selectedPlayers.find(p => p.membershipId === first.membershipId) : undefined;
    return this.getPlatformIconUrl(pl?.membershipType ?? 0);
  }

  /** Returns readable platform string for a Guardian First entry */
  getPlatformNameForFirst(first: { membershipId?: string }): string {
    const pl = first && first.membershipId ? this.selectedPlayers.find(p => p.membershipId === first.membershipId) : undefined;
    return pl?.platform || '';
  }

  /**
   * Loads playtime from WastedOnDestiny (or falls back to Bungie profile minutes) and caches it.
   */
  private async loadWastedTime(player: PlayerSearchDisplay): Promise<void> {
    const key = this.getPlayerKey(player);
    if (this.wastedTimes[key] !== undefined) return; // cached

    try {
      const res = await this.playtimeService.getPlaytime(player);
      this.wastedTimes[key] = res.seconds;
      this.wastedSeals[key] = res.seals;
    } catch (err) {
      console.warn('[loadWastedTime] playtime service failed', err);
      this.wastedTimes[key] = 0;
      this.wastedSeals[key] = 0;
    } finally {
      this.statsDebounce$.next();
    }
  }

  /** Map a platform string (Xbox, PlayStation, Steam, etc.) to Bungie membershipType so we can reuse getPlatformIcon */
  getPlatformId(platform: string): number {
    const p = platform.toLowerCase();
    if (p.includes('xbox')) return 1;
    if (p.includes('playstation') || p.includes('psn') || p.includes('ps')) return 2;
    if (p.includes('steam') || p.includes('pc')) return 3;
    if (p.includes('blizzard') || p.includes('battlenet')) return 4;
    if (p.includes('stadia')) return 5;
    if (p.includes('epic')) return 6;
    return 0;
  }

  /** Map class name to icon asset path */
  getClassIconUrl(className?: string): string | undefined {
    if (!className) return undefined;
    const c = className.toLowerCase();
    if (c.includes('hunter')) return 'assets/icons/destiny/class-hunter-svgrepo-com.svg';
    if (c.includes('titan')) return 'assets/icons/destiny/class-titan-svgrepo-com.svg';
    if (c.includes('warlock')) return 'assets/icons/destiny/class-warlock-svgrepo-com.svg';
    return undefined;
  }

  /** Returns cached first ever activity for player */
  getFirstEverForPlayer(player: PlayerSearchDisplay): ActivityHistory | undefined {
    return this.firstEverActivities[this.getPlayerKey(player)];
  }

  /** Compute first-ever activity per player using centralized service */
  private async computeFirstEverActivityForPlayer(player: PlayerSearchDisplay): Promise<ActivityHistory | undefined> {
    // Ensure D1 history is fully backfilled before computing earliest
    if (player.game === 'D1') {
    const charIds = (this.characters[this.getPlayerKey(player)] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);
    for (const charId of charIds) {
        try {
          await this.activityDb.fetchAndStoreActivities(
            player.membershipType as any,
            player.membershipId,
            charId,
            true,
            true
          );
        } catch {}
      }
    }
    // Force service refresh and scope to this player's characters to avoid stray rows
    const scopedCharIds = (this.characters[this.getPlayerKey(player)] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);
    return this.firstActivityService.getFirstEverActivity({ membershipId: player.membershipId, game: player.game, characterIds: scopedCharIds }, true);
  }

  /** Called on every keystroke in the username box */
  onSearchInput(value: string): void {
    this.searchTerm$.next(value);
    
    // If not in add mode and we have existing players, show a warning
    if (!this.addMode && this.selectedPlayers.length > 0 && value.trim()) {
      this.errorMessage = 'Warning: This search will replace your current profiles. Enable "Add mode" to keep existing profiles.';
    } else if (this.addMode && this.selectedPlayers.length > 0 && value.trim()) {
      this.errorMessage = ''; // Clear any previous warnings
    }
  }

  /** Handler for toggling the "Include linked accounts" checkbox */
  // Removed onIncludeLinkedChange method - users explicitly select accounts from search modal

  /** Returns earliest (first ever) activity across all selected players for the specified game. */
  getAggregateFirstEver(game: 'D1' | 'D2'): ActivityHistory | undefined {
    const firsts: ActivityHistory[] = [];
    for (const pl of this.selectedPlayers) {
      if (pl.game !== game) continue;
      const first = this.getFirstEverForPlayer(pl);
      if (first) firsts.push(first);
    }
    if (firsts.length === 0) return undefined;
    return firsts.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())[0];
  }

  /**
   * Handles the exact-match Bungie Name search response (Player#1234).
   * It mirrors the old behaviour we had before prefix-search support.
   */
  private async processExactD2SearchResponse(response: any) {
    if (!response || response.ErrorCode !== 1 || !response.Response?.length) {
      this.errorMessage = 'No Destiny 2 player found with that Bungie Name.';
      return;
    }

    this.d2SearchResults = response.Response.map((player: any) => ({
      ...player,
      game: 'D2',
      platform: this.getPlatformName(player.membershipType)
    })) as PlayerSearchDisplay[];

    // Identify cross-save primary (if any)
    this.crossSavePlayer = this.d2SearchResults.find(p => p.crossSaveOverride && p.crossSaveOverride > 0) || null;

    if (this.d2SearchResults.length > 1 || this.crossSavePlayer) {
      this.showPlatformPicker = true;
    } else if (this.d2SearchResults.length === 1) {
      await this.selectPlayer(this.d2SearchResults[0]);
    }
  }
  /**
   * Selects every account currently listed in the search-results modal (cross-save, D2, D1).
   * This only selects them in the modal, doesn't load them.
   */
  async selectAllPlayersInModal() {
    // Clear current selection and select all available players
    this.modalSelectedPlayers.clear();
    
    const all: PlayerSearchDisplay[] = [];
    if (this.crossSavePlayer) {
      all.push(this.crossSavePlayer);
    }
    all.push(...this.d2SearchResults.filter(p => !p.isCrossSavePrimary));
    all.push(...this.d1SearchResults);

    // Add all to selection
    all.forEach(player => {
      this.modalSelectedPlayers.add(this.getPlayerKey(player));
    });
    
    this.cdr.detectChanges();
  }

  // Helper to generate a composite key for a favorite account
  private getFavoriteKey(account: { membershipId: string; game: 'D1' | 'D2'; membershipType: number }): string {
    return `${account.membershipId}|${account.game}|${account.membershipType}`;
  }
  async addSelectedToFavorites() {
    // Gather all available players
    const all: PlayerSearchDisplay[] = [];
    if (this.crossSavePlayer) {
      all.push(this.crossSavePlayer);
    }
    all.push(...this.d2SearchResults.filter((p: PlayerSearchDisplay) => !p.isCrossSavePrimary));
    all.push(...this.d1SearchResults);

    // Build selectedPlayers by matching keys in modalSelectedPlayers
    const selectedPlayers: PlayerSearchDisplay[] = all.filter((player: PlayerSearchDisplay) =>
      this.modalSelectedPlayers.has(this.getPlayerKey(player))
    );
    console.log('[Favorites][AddSelected] Selected players to favorite:', selectedPlayers.map((p: PlayerSearchDisplay) => ({
      displayName: p.displayName,
      membershipId: p.membershipId,
      membershipType: p.membershipType,
      game: p.game,
      platform: p.platform
    })));
    // Convert to FavoriteAccount for deduplication and favoriting
    const now = new Date().toISOString();
    const favoriteAccounts: FavoriteAccount[] = selectedPlayers.map((player: PlayerSearchDisplay) => ({
      membershipId: player.membershipId,
      membershipType: player.membershipType,
      displayName: player.displayName,
      game: player.game,
      platform: player.platform,
      lastUpdated: now,
      compositeKey: this.getFavoriteKey({
        membershipId: player.membershipId,
        game: player.game,
        membershipType: player.membershipType
      })
    }));
    // Deduplicate using composite key
    const uniqueFavorites: { [key: string]: FavoriteAccount } = {};
    for (const fav of favoriteAccounts) {
      const key = this.getFavoriteKey(fav);
      if (!uniqueFavorites[key]) {
        uniqueFavorites[key] = fav;
      }
    }
    for (const key in uniqueFavorites) {
      const fav = uniqueFavorites[key];
      console.log('[Favorites][AddSelected] Adding to favorites:', {
        displayName: fav.displayName,
        membershipId: fav.membershipId,
        membershipType: fav.membershipType,
        game: fav.game,
        platform: fav.platform
      });
      await this.addFavorite(fav);
    }
  }

  /** Returns a unique key for the given player independent of case */
  public getPlayerKey(p: { membershipId: string; game?: 'D1' | 'D2'; }): string {
    return `${p.game || 'D2'}|${p.membershipId}`;
  }

  clearModalSelection() {
    this.modalSelectedPlayers.clear();
    this.cdr.detectChanges();
  }

  isPlayerSelected(player: PlayerSearchDisplay): boolean {
    return this.modalSelectedPlayers.has(this.getPlayerKey(player));
  }

  togglePlayerSelection(player: PlayerSearchDisplay) {
    const key = this.getPlayerKey(player);
    if (this.modalSelectedPlayers.has(key)) {
      this.modalSelectedPlayers.delete(key);
    } else {
      this.modalSelectedPlayers.add(key);
    }
    this.cdr.detectChanges();
  }

  getSelectedCount(): number {
    return this.modalSelectedPlayers.size;
  }

  getTotalCount(): number {
    let count = 0;
    if (this.crossSavePlayer) count++;
    count += this.d2SearchResults.length;
    count += this.d1SearchResults.length;
    return count;
  }

  async loadSelectedPlayers() {
    const selectedPlayers: PlayerSearchDisplay[] = [];
    
    // Get all available players
    const all: PlayerSearchDisplay[] = [];
    if (this.crossSavePlayer) {
      all.push(this.crossSavePlayer);
    }
    all.push(...this.d2SearchResults.filter(p => !p.isCrossSavePrimary));
    all.push(...this.d1SearchResults);

    // Filter to only selected players
    all.forEach(player => {
      if (this.modalSelectedPlayers.has(this.getPlayerKey(player))) {
        selectedPlayers.push(player);
      }
    });

    if (selectedPlayers.length === 0) {
      return;
    }

    // Check profile limit
    if (selectedPlayers.length > 10) {
      this.errorMessage = `Too many profiles selected (${selectedPlayers.length}). Only the first 10 will be loaded.`;
      selectedPlayers.splice(10);
    }

    console.log('[LoadSelectedPlayers] Loading', selectedPlayers.length, 'players:', selectedPlayers.map(p => `${p.displayName} (${p.platform}, ${p.game})`));

    // CRITICAL FIX: Use the first as primary, then append the rest
    // This ensures all selected players end up in this.selectedPlayers
    const [primary, ...rest] = selectedPlayers;
    await this.selectPlayer(primary);

    // Now append the rest using appendPlayer to add them to this.selectedPlayers
    for (const player of rest) {
      await this.appendPlayer(player);
    }

    // Hide the modal
    this.showPlatformPicker = false;

    if (this.selectedDate) {
      await this.loadAllFilteredActivities();
    }
    await this.calculateAccountStats();

    this.showPlatformPicker = false;
    this.modalSelectedPlayers.clear();
    this.cdr.detectChanges();
  }


  // Currently viewed game within the Guardian Firsts view – drives platform list & rendering
  activeFirstsGame: 'D1' | 'D2' = 'D2';

  /**
   * Switch the Guardian Firsts view between Destiny 1 and Destiny 2.
   * Resets the sub-platform selector back to "All" and recalculates the
   * platform chip list for the chosen game.
   */
  setActiveFirstsGame(game: 'D1' | 'D2' | string): void {
    // Accept string from template and coerce to union
    if (game !== 'D1' && game !== 'D2') {
      return;
    }
    if (this.activeFirstsGame !== game) {
      this.activeFirstsGame = game;
      this.activeFirstsTab = 'all';
      this.updatePlatformTabs();
      this.cdr.detectChanges();
    }
  }

  getAggregateRaidsByPlatform(game: 'D1' | 'D2', platform: string): ActivityFirstCompletion[] {
    const perPlatform: ActivityFirstCompletion[] = [];
    const seen = new Map<string, ActivityFirstCompletion>();
    for (const player of this.selectedPlayers) {
      if (player.platform !== platform) continue;
      if ((game === 'D1' && this.isD1Player(player)) || (game === 'D2' && !this.isD1Player(player))) {
        for (const f of this.getPlayerRaids(player, game)) {
          const existing = seen.get(f.name);
          if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
            seen.set(f.name, f);
          }
        }
      }
    }
    perPlatform.push(...seen.values());
    return this.sortRaids(perPlatform, game);
  }

  getAggregateDungeonsByPlatform(game: 'D1' | 'D2', platform: string): ActivityFirstCompletion[] {
    const perPlatform: ActivityFirstCompletion[] = [];
    const seen = new Map<string, ActivityFirstCompletion>();
    for (const player of this.selectedPlayers) {
      if (player.platform !== platform) continue;
      if (game === 'D2' && !this.isD1Player(player)) {
        for (const f of this.getPlayerDungeons(player, game)) {
          const existing = seen.get(f.name);
          if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
            seen.set(f.name, f);
          }
        }
      }
    }
    perPlatform.push(...seen.values());
    return this.sortDungeons(perPlatform);
  }

  getAggregateFirstEverByPlatform(game: 'D1' | 'D2', platform: string): ActivityHistory | undefined {
    let earliest: ActivityHistory | undefined;
    for (const player of this.selectedPlayers) {
      if (player.platform !== platform) continue;
      if ((game === 'D1' && this.isD1Player(player)) || (game === 'D2' && !this.isD1Player(player))) {
        const first = this.getFirstEverForPlayer(player);
        if (first && (!earliest || new Date(first.period) < new Date(earliest.period))) {
          earliest = first;
        }
      }
    }
    return earliest;
  }

  /**
   * Given a list of Guardian Firsts returns the earliest completion per unique name.
   * The returned list keeps exactly one entry for each distinct raid/dungeon name.
   */
  private getEarliestFirsts(list: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
    const map = new Map<string, ActivityFirstCompletion>();
    for (const first of list) {
      // Preserve D1 raid variants by including referenceId in the key
      const key = (first.game === 'D1' && first.type === 'raid')
        ? `${first.name}|${first.referenceId}`
        : first.name;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, first);
        continue;
      }
      // Keep the earliest based on completionDate (ISO string)
      if (new Date(first.completionDate) < new Date(existing.completionDate)) {
        map.set(key, first);
      }
    }
    return Array.from(map.values());
  }

  /**
   * Helper for the template to fetch the solo/solo-flawless first that corresponds to
   * a given Guardian Firsts entry.
   */
  getSoloFirstForFirst(first: ActivityFirstCompletion): DungeonSoloFirst | undefined {
    if (!first || !first.membershipId) return undefined;
    const player = this.selectedPlayers.find(p => p.membershipId === first.membershipId);
    if (!player) return undefined;
    return this.getDungeonSoloFirstForPlayer(player, first.name);
  }

  getAccountGroupsForGame(game: 'D1' | 'D2') {
    return this.groupedActivitiesByAccount.filter(g => g.game === game);
  }
  /**
   * Groups activities by their version (Normal, Master, Explorer, etc.)
   */
  getVersionGroups(activities: ActivityWithMembership[]): Array<{ version: string; activities: ActivityWithMembership[] }> {
    const versionMap = new Map<string, ActivityWithMembership[]>();
    
    for (const activity of activities) {
      // Use manifest as primary source, custom mapping as backup
      let activityName = this.manifest.getActivityName(activity.activityDetails?.referenceId, activity.game === 'D1');
      if (!activityName || activityName === 'Unknown Activity') {
        activityName = this.getMappedActivityName(String(activity.activityDetails?.referenceId)) || 'Unknown Activity';
      }
      const version = this.getActivityVersion(activityName);
      
      if (!versionMap.has(version)) {
        versionMap.set(version, []);
      }
      versionMap.get(version)!.push(activity);
    }
    
    // Sort versions in preferred order
    const versionOrder = ['Normal', 'Standard', 'Explorer', 'Eternity', 'Ultimatum', 'Master'];
    return Array.from(versionMap.entries())
      .map(([version, activities]) => ({ version, activities }))
      .sort((a, b) => {
        const aIndex = versionOrder.indexOf(a.version);
        const bIndex = versionOrder.indexOf(b.version);
        if (aIndex === -1 && bIndex === -1) return a.version.localeCompare(b.version);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
  }

  /**
   * Extracts the version from an activity name
   */
  getActivityVersion(activityName: string): string {
    const colonIndex = activityName.indexOf(': ');
    if (colonIndex === -1) {
      return 'Standard'; // Default for activities without version
    }
    return activityName.substring(colonIndex + 2);
  }

  /**
   * Track by function for version groups
   */
  trackByVersionGroup(index: number, versionGroup: { version: string; activities: ActivityWithMembership[] }): string {
    return versionGroup.version;
  }



  // ------------------------------------------------------------------
  // Export helpers
  // ------------------------------------------------------------------
  async exportActivities(): Promise<void> {
    if (!this.selectedDate) {
      console.warn('[Export] No date selected');
      return;
    }

    // Parse selectedDate (format: "YYYY-MM-DD")
    const dateParts = this.selectedDate.split('-');
    if (dateParts.length !== 3) {
      console.warn('[Export] Invalid selectedDate format:', this.selectedDate);
      return;
    }
    const [year, month, day] = dateParts.map(Number);
    const fromDate = new Date(Date.UTC(year, month - 1, day));

    const req: ExportRequest = {
      from: fromDate,
      to: fromDate,
      types: [],       // all modes
      platforms: [],   // all selected
      includeSummaries: false,
      includeFirsts: false,
      includeActivities: true,
    } as const;

    await this.exportService.exportMultiSheet(req, {
      selectedPlayers: this.selectedPlayers,
      activityDb: this.activityDb,
      manifestService: this.manifest,
      characters: this.characters,
      getPlayerKey: this.getPlayerKey.bind(this),
      titleService: this.titleService
    });
  }

  showExportDialog: boolean = false;
  showFavoritesModal: boolean = false;
  showShareDropdown: boolean = false;
  modalSelectedPlayers: Set<string> = new Set(); // Track selected players in modal

  openExportOptionsDialog() {
    this.showExportDialog = true;
  }

  async handleExportOptions(options: any) {
    console.log('Received export options:', options);
    this.showExportDialog = false;
    // Convert date string to valid ISO date string if needed
    if (options.from && typeof options.from === 'string') {
      const dateParts = options.from.split('-').map(Number);
      if (dateParts.length === 2) {
        // Old MM-DD format
        const [month, day] = dateParts;
      const year = new Date().getFullYear();
      options.from = new Date(Date.UTC(year, month - 1, day)).toISOString();
      } else if (dateParts.length === 3) {
        // New YYYY-MM-DD format
        const [year, month, day] = dateParts;
        options.from = new Date(Date.UTC(year, month - 1, day)).toISOString();
      }
    }
    await this.exportService.exportMultiSheet(options, {
      selectedPlayers: this.selectedPlayers,
      activityDb: this.activityDb,
      manifestService: this.manifest,
      characters: this.characters,
      getPlayerKey: this.getPlayerKey.bind(this),
      titleService: this.titleService
    });
  }

  async refreshTitles() {
    try {
      this.loadingTitlesOverall = true;
      const result = await this.titleService.refreshTitles();
      console.log(`[Titles] Refresh complete. Found ${result.totalTitles} total titles.`);
      
      // Check for specific new titles
      this.checkForSpecificTitles();
      
      // Clear cached titles to force reload
      this.playerTitles = {};
      this.aggregatedTitles = [];
      
      // Force reload all player titles
      if (this.activeTab === 'titles' && this.selectedPlayers.length > 0) {
        for (const player of this.selectedPlayers) {
          if (this.isD1Player(player)) continue; // skip Destiny 1 profiles (no titles)
          const pKey = this.getPlayerKey(player);
          
          // Force reload by clearing the cache and setting loading state
          this.loadingTitles[pKey] = true;
          delete this.playerTitles[pKey];
        }
        
        // Now reload the titles tab
        await this.onTabChange('titles');
      }
      
      this.cdr.detectChanges();
    } catch (error) {
      console.error('[Titles] Error refreshing titles:', error);
    } finally {
      this.loadingTitlesOverall = false;
      this.cdr.detectChanges();
    }
  }

  private checkForSpecificTitles() {
    if (!this.manifest.isLoadedSync) {
      console.log('[Titles] Manifest not loaded, skipping specific title check');
      return;
    }

    const presentationNodes = this.manifest.getPresentationNodes();
    const titleDefs = this.manifest.getTitleDefs();
    
    // Check for specific new titles using their completionRecordHash values
    const newTitleCompletionHashes = [3888842466, 3198225435]; // Edge of Fate, Sharpshooter completion hashes
    
    console.log('[Titles] Checking for specific new titles by completion hash...');
    for (const hash of newTitleCompletionHashes) {
      const recordDef = titleDefs[hash];
      
      if (recordDef) {
        console.log(`[Titles] ✅ Found record definition for completion hash ${hash}:`, {
          titleInfo: recordDef.titleInfo,
          displayProperties: recordDef.displayProperties,
          name: recordDef.displayProperties?.name
        });
      } else {
        console.log(`[Titles] ❌ No record definition found for completion hash ${hash}`);
      }
    }

    // Also check by presentation node hash
    const newTitlePresentationHashes = [3588958240, 3417748255]; // Edge of Fate, Sharpshooter presentation hashes
    
    console.log('[Titles] Checking for specific new titles by presentation hash...');
    for (const hash of newTitlePresentationHashes) {
      const node = presentationNodes[hash];
      
      if (node) {
        console.log(`[Titles] ✅ Found presentation node for hash ${hash}:`, {
          name: node.displayProperties?.name,
          description: node.displayProperties?.description,
          icon: node.displayProperties?.icon,
          completionRecordHash: node.completionRecordHash
        });
      } else {
        console.log(`[Titles] ❌ No presentation node found for hash ${hash}`);
      }
    }
  }

  async debugTitles() {
    console.log('[Titles] Starting debug...');
    await this.titleService.debugAllTitles();
    this.checkForSpecificTitles();
  }
  async onTabChange(tab: 'activities' | 'firsts' | 'titles') {
    this.activeTab = tab;
    if (tab === 'titles' && this.selectedPlayers.length > 0) {
      this.loadingTitlesOverall = true;
      for (const player of this.selectedPlayers) {
        if (this.isD1Player(player)) continue; // skip Destiny 1 profiles (no titles)
        const pKey = this.getPlayerKey(player);
        if (!this.playerTitles[pKey]) {
          this.loadingTitles[pKey] = true;
          try {
            if (!this.manifest.isLoadedSync) {
              await this.manifest.isLoaded().toPromise();
            }
            const presentationNodes = this.manifest.getPresentationNodes();
            // Hashes for current and legacy titles
            const currentTitlesHash = 616318467;
            const legacyTitlesHash = 1881970629;
            const getChildNodes = (parentHash: number) => {
              const parentNode = presentationNodes[parentHash];
              if (!parentNode || !parentNode.children || !Array.isArray(parentNode.children.presentationNodes)) return [];
              return parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean);
            };
            const currentTitleNodes = getChildNodes(currentTitlesHash);
            const legacyTitleNodes = getChildNodes(legacyTitlesHash);
            // Gather all title nodes (current + legacy)
            const titleParentHashes = [616318467, 1881970629]; // Current and Legacy Titles
            let allTitleNodes: any[] = [];
            for (const parentHash of titleParentHashes) {
              const parentNode = presentationNodes[parentHash];
              if (!parentNode || !parentNode.children || !Array.isArray(parentNode.children.presentationNodes)) continue;
              allTitleNodes.push(...parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean));
            }
            // Get player records
            const response = await firstValueFrom(this.bungieService.getPlayerTitles(player.membershipType, player.membershipId));
            const records = response.Response?.profileRecords?.data?.records || {};
            const charRecords = response.Response?.characterRecords?.data as { [characterId: string]: { records?: { [key: string]: TitleRecord } } } || {};
            // Debug: Output player records
            console.log('[TITLES DEBUG] Player Records:', records);
            // Debug: Print all completionRecordHash values from manifest title nodes
            for (const node of allTitleNodes) {
              if (!node || !node.completionRecordHash) continue;
              let hasRecord = !!records[node.completionRecordHash];
              if (!hasRecord) {
                // Check all character records for this hash
                for (const charId of Object.keys(charRecords)) {
                  const charRecordObj = charRecords[charId];
                  if (charRecordObj?.records && charRecordObj.records[node.completionRecordHash]) {
                    hasRecord = true;
                    console.warn(`[TITLES DEBUG] Manifest node: ${node.displayProperties?.name} (completionRecordHash: ${node.completionRecordHash}) - FOUND in characterRecords for characterId: ${charId}`);
                    break;
                  }
                }
              }
              if (!hasRecord) {
                console.log(`[TITLES DEBUG] Manifest node: ${node.displayProperties?.name} (completionRecordHash: ${node.completionRecordHash}) - In player records: false`);
              }
            }
            // Build a single list of titles (show all manifest nodes, even if no record)
            const titleMap: { [key: string]: any } = {};
            for (const node of allTitleNodes) {
              if (!node || !node.completionRecordHash) {
                console.warn('[TITLES DEBUG] Skipping node with missing completionRecordHash:', node);
                continue;
              }
              let record = records[node.completionRecordHash];
              let foundInCharacter = false;
              if (!record) {
                for (const charId of Object.keys(charRecords)) {
                  const charRecordObj = charRecords[charId];
                  if (charRecordObj?.records && charRecordObj.records[node.completionRecordHash]) {
                    record = charRecordObj.records[node.completionRecordHash];
                    foundInCharacter = true;
                    break;
                  }
                }
              }
              // Get the DestinyRecordDefinition for the completionRecordHash
              const recordDef = this.manifest.getTitleDefs()[node.completionRecordHash];
              // Prefer special mapping name if present
              const special = SPECIAL_TITLES[node.completionRecordHash] || SPECIAL_TITLES[node.hash];
              let displayName = special ? special.name : (recordDef?.titleInfo?.titlesByGender?.Male || node.displayProperties?.name || 'Unknown');
              const normalizedName = this.normalizeTitleName(displayName);
              // Use Bungie bitmask for completion if record exists
              const isCompleted = record ? ((record.state & 1) !== 0) : false;
              // Gilding logic for all eligible titles
              let isGilded = false;
              let timesGilded = 0;
              let gildedIcon: string | undefined = undefined;
              let mappingExists = false;
              // Use special-case hash for current Conqueror/Flawless, otherwise manifest's hash
              let gildingTrackingHash = special?.gildingTrackingRecordHash || recordDef?.titleInfo?.gildingTrackingRecordHash;
              let isGildable = !!gildingTrackingHash;
              if (isGildable && isCompleted) {
                mappingExists = !!this.GILDED_SEAL_IMAGE_MAP[normalizedName];
                // Look up the gilding tracking record in both profile and character records
                let gildingRecord = records[gildingTrackingHash];
                if (!gildingRecord) {
                  for (const charId of Object.keys(charRecords)) {
                    const charRecordObj = charRecords[charId];
                    if (charRecordObj?.records && charRecordObj.records[gildingTrackingHash]) {
                      gildingRecord = charRecordObj.records[gildingTrackingHash];
                      break;
                    }
                  }
                }
                if (gildingRecord) {
                  timesGilded = gildingRecord.completedCount || 0;
                  isGilded = timesGilded > 0;
                  if (isGilded && mappingExists) {
                    gildedIcon = this.GILDED_SEAL_IMAGE_MAP[normalizedName];
                  }
                  console.log(`[TITLES DEBUG] Gilded status for ${displayName}: isGilded=${isGilded}, timesGilded=${timesGilded}, gildedIcon=${gildedIcon}`);
                } else {
                  console.warn(`[TITLES DEBUG] No valid gildingRecord for ${displayName}`);
                }
              } else if (isGildable && !isCompleted) {
                // If not completed, do not show gilded info
                console.log(`[TITLES DEBUG] ${displayName} is not completed, skipping gilded info.`);
              }
              // Debug: Output each title's record and completion logic
              console.log('[TITLES DEBUG] Seal:', displayName, 'completionRecordHash:', node.completionRecordHash, 'State:', record?.state, 'Completed:', isCompleted, foundInCharacter ? '(Found in characterRecords)' : '');
              // Calculate progress percentage for incomplete titles
              let progressPercent: number | undefined;
              if (!isCompleted && record && Array.isArray((record as any).objectives)) {
                let total = 0;
                let done = 0;
                for (const obj of (record as any).objectives) {
                  if (obj?.visible === false) continue;
                  const target = obj.completionValue ?? 1;
                  total += target;
                  done += Math.min(obj.progress ?? 0, target);
                }
                if (total > 0) {
                  progressPercent = Math.round((done / total) * 100);
                }
              }
              // Use a unique key for deduplication: displayName + completionRecordHash
              const uniqueKey = `${displayName}#${node.completionRecordHash}`;
              if (!titleMap[uniqueKey]) {
                titleMap[uniqueKey] = {
                  hash: node.completionRecordHash,
                  name: displayName,
                  icon: (isGilded && gildedIcon) ? gildedIcon : (node.displayProperties?.icon ? `https://www.bungie.net${node.displayProperties.icon}` : null),
                  completed: isCompleted,
                  isGilded,
                  timesGilded: (isCompleted && timesGilded > 0) ? timesGilded : undefined,
                  gildedIcon: (isGilded && gildedIcon) ? gildedIcon : undefined,
                  locked: !isCompleted,
                  missingRecord: !record,
                  altIcon: (() => {
                    const frames = node.iconSequences && node.iconSequences[1] && node.iconSequences[1].frames;
                    if (frames && frames.length > 0) {
                      return `https://www.bungie.net${frames[frames.length - 1]}`; // grey/silver variant
                    }
                    return undefined;
                  })(),
                  legacy: (node.parentNodeHashes || []).includes(1881970629),
                  releaseRank: RELEASE_ORDER[normalizedName] || 0,
                  normalized: normalizedName,
                  progressPercent: progressPercent,
                };
              }
            }
            // Split into completed and locked, then sort
            const allTitles = Object.values(titleMap);
            const completed = allTitles.filter((t: any) => t.completed).sort((a: any, b: any) => a.name.localeCompare(b.name));
            const locked = allTitles.filter((t: any) => !t.completed).sort((a: any, b: any) => a.name.localeCompare(b.name));
            this.playerTitles[pKey] = [...completed, ...locked];
            // Debug: Print all record hashes for the current user
            const motHashes = ['126238604', '3175660257']; // MoT 2024, 2023
            const recordKeys = Object.keys(records);
            // debug removed
            for (const motHash of motHashes) {
              let found = !!records[motHash];
              if (!found) {
                for (const charId of Object.keys(charRecords)) {
                  const charRecordObj = charRecords[charId];
                  if (charRecordObj?.records && charRecordObj.records[motHash]) {
                    found = true;
                    console.warn(`[TITLES DEBUG] MoT record FOUND in characterRecords for hash: ${motHash} (characterId: ${charId})`);
                    break;
                  }
                }
              }
              if (!found) {
                console.warn(`[TITLES DEBUG] MoT record missing for hash: ${motHash}`);
              } else {
                console.log(`[TITLES DEBUG] MoT record found for hash: ${motHash}`);
              }
            }
            // Add MoT 2024 debug info for this player
            this.motDebug[player.membershipId] = records['126238604'] || null;
          } catch (err) {
            // Store an empty list when we fail to fetch titles so downstream code can safely iterate
            this.playerTitles[pKey] = [];
          } finally {
            this.loadingTitles[pKey] = false;
            this.cdr.markForCheck();
          }
        }
      }
      // After fetching titles for all players, create aggregatedTitles based on main/cross-save account.
      // Choose first Destiny 2 profile as the reference account for ordering
      const mainPlayer = (this.selectedPlayers.find(p => !this.isD1Player(p) && p.isPrimary) ||
                          this.crossSavePlayer ||
                          this.selectedPlayers.find(p => !this.isD1Player(p))) as typeof this.selectedPlayers[0];
      const mainList = mainPlayer ? (this.playerTitles[this.getPlayerKey(mainPlayer)] || []) : [];

      // Build a map keyed by title name to avoid duplicates and to merge data cleanly
      const aggMap = new Map<number, any>();

      const addHolder = (titleObj: any, holder: { displayName: string; platform: string }) => {
        if (!titleObj.holders) titleObj.holders = [];
        titleObj.holders.push(holder);
      };

      // Seed with the main account's titles (completed **and** locked)
      for (const t of mainList as any[]) {
        // Skip duplicates; prefer a completed version over locked if both exist
        const existing = aggMap.get(t.hash);
        if (!existing) {
          // Clone to avoid mutating original reference
          const clone = { ...t, holders: [] as { displayName: string; platform: string }[] };
          if (t.completed) {
            addHolder(clone, { displayName: mainPlayer.displayName, platform: mainPlayer.platform });
          }
          aggMap.set(t.hash, clone);
        } else if (!existing.completed && t.completed) {
          // Replace locked placeholder with completed version
          const clone = { ...t, holders: existing.holders };
          if (clone.holders.length === 0) {
            addHolder(clone, { displayName: mainPlayer.displayName, platform: mainPlayer.platform });
          }
          aggMap.set(t.hash, clone);
        }
      }

      // Merge in titles from the rest of the selected players
      for (const p of this.selectedPlayers) {
        if (this.isD1Player(p)) continue; // skip D1 accounts entirely
        if (p.membershipId === mainPlayer.membershipId) continue;
        const list = this.playerTitles[this.getPlayerKey(p)] || [];
        for (const t of list as any[]) {
          const existing = aggMap.get(t.hash);
          if (!existing) {
            // Clone and seed map (even if locked) so other players can add themselves as holders later
            const clone = { ...t, holders: [] as { displayName: string; platform: string }[] };
            aggMap.set(t.hash, clone);
          }
          // If this player has completed the title, record them as a holder
          if (t.completed) {
            const ex = aggMap.get(t.hash)!;
            addHolder(ex, { displayName: p.displayName, platform: p.platform });
            // Upgrade to completed if previously locked
            if (!ex.completed) {
              ex.completed = true;
              ex.locked = false;
              if (!ex.icon) ex.icon = t.icon;
            }
          }
        }
      }

      // Rebuild aggregatedTitles via the new service
      this.aggregatedTitles = this.titleService.aggregateTitles(
        this.selectedPlayers as any,
        this.playerTitles as any
      );
      this.loadingTitlesOverall = false;
      this.cdr.detectChanges();
    }
  }



  // Convenience getter for template (avoids forbidden arrow functions)
  get d2Players(): PlayerSearchDisplay[] {
    return this.selectedPlayers.filter(p => p.game === 'D2');
  }

  async shareDailyView(): Promise<void> {
    if (!this.selectedPlayers.length) return;
    const players = this.selectedPlayers.map(p => [p.membershipId, p.membershipType, p.game]);
    const dateStr = `${this.selectedMonth}-${this.selectedDay}`;
    const state = { d: dateStr, p: players };
    const link = this.shareService.buildLink(state);
    try {
      await navigator.clipboard.writeText(link);
      alert('Share link copied to clipboard!');
    } catch {
      prompt('Copy link', link);
    }
  }

  /**
   * Clears the firstEverActivities cache to force recalculation with new filtering logic
   */
  clearFirstEverActivitiesCache(): void {
    this.firstEverActivities = {};
    this.firstEverActivity = undefined;
    // Also clear the FirstActivityService cache to ensure fresh data
    if (this.firstActivityService) {
      this.firstActivityService.clearCache();
    }
  }

  // Phase 4: UI Rendering Optimization - Virtual Scrolling & Performance Methods

  /**
   * Prepares data for virtual scrolling by chunking large lists
   */
  private prepareForVirtualScrolling<T>(items: T[], chunkSize: number = 100): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Optimized method to get activities with pagination for virtual scrolling
   */
  getActivitiesForVirtualScroll(
    activities: ActivityHistory[],
    startIndex: number,
    endIndex: number
  ): ActivityHistory[] {
    return activities.slice(startIndex, endIndex);
  }

  /**
   * Debounced method to update UI efficiently
   */
  private debouncedUpdateUI = this.debounce(() => {
    this.cdr.detectChanges();
  }, 16); // ~60fps

  /**
   * Debounce utility function for performance optimization
   */
  private debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * Optimized method to check if an activity should be visible
   */
  isActivityVisible(activity: ActivityHistory, currentIndex: number, visibleRange: number = 50): boolean {
    return currentIndex < visibleRange;
  }

  /**
   * Gets performance metrics for monitoring
   */
  getPerformanceMetrics(): any {
    return {
      changeDetectionRuns: (this.cdr as any)._view?.state || 'Unknown',
      memoryUsage: (performance as any).memory ? {
        usedJSHeapSize: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
        totalJSHeapSize: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024),
        jsHeapSizeLimit: Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024)
      } : 'Not available',
      timestamp: Date.now()
    };
  }

  /**
   * Optimized method to update activities with minimal change detection
   */
  updateActivitiesOptimized(newActivities: ActivityHistory[]): void {
    // Only trigger change detection if the data actually changed
    if (JSON.stringify(this.activities) !== JSON.stringify(newActivities)) {
      this.activities = { ...this.activities };
      this.debouncedUpdateUI();
    }
  }

  /**
   * Batch update method to reduce change detection cycles
   */
  batchUpdate<T>(updates: Array<() => void>): void {
    // Disable change detection temporarily
    this.cdr.detach();
    
    // Apply all updates
    updates.forEach(update => update());
    
    // Re-enable and trigger single change detection
    this.cdr.reattach();
    this.cdr.detectChanges();
  }

  /**
   * Interleaves D1 and D2 players for optimal concurrent loading
   * This ensures both game types start loading immediately rather than D1 waiting for D2
   */
  private interleavePlayersForConcurrency(d1Players: PlayerSearchDisplay[], d2Players: PlayerSearchDisplay[]): PlayerSearchDisplay[] {
    const result: PlayerSearchDisplay[] = [];
    const maxLength = Math.max(d1Players.length, d2Players.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (i < d1Players.length) {
        result.push(d1Players[i]);
      }
      if (i < d2Players.length) {
        result.push(d2Players[i]);
      }
    }
    
    return result;
  }

  /**
   * Updates the URL to reflect the current state for permalink sharing
   */
  private updateUrlForPermalink() {
    const params: any = {};
    
    // Add date parameter if a date is selected
    if (this.selectedDate) {
      params.date = this.selectedDate;
    }
    
    // Add players parameter if players are selected
    if (this.selectedPlayers.length > 0) {
      const playerData = this.selectedPlayers.map(player => ({
        displayName: player.displayName,
        membershipId: player.membershipId,
        membershipType: player.membershipType,
        game: player.game,
        platform: player.platform
      }));
      params.players = encodeURIComponent(JSON.stringify(playerData));
    }
    
    // Build the new URL using query parameters instead of path parameters
    let newUrl = '/share';
    const queryParams = new URLSearchParams();
    
    if (params.date) {
      queryParams.set('date', params.date);
    }
      if (params.players) {
      queryParams.set('players', params.players);
      }
    
    if (queryParams.toString()) {
      newUrl += '?' + queryParams.toString();
    }
    
    
    // Update the URL without triggering navigation
    this.location.replaceState(newUrl);
  }

  /**
   * Shares the current permalink with the user
   */

  /**
   * Copy current view data as JSON to clipboard
   */
  async copyDataToClipboard() {
    try {
      const snapshotData = {
        date: this.selectedDate,
        players: this.selectedPlayers.map(player => ({
          displayName: player.displayName,
          membershipId: player.membershipId,
          membershipType: player.membershipType,
          game: player.game,
          platform: player.platform
        })),
        activities: this.filteredActivitiesForDate,
        accountStats: this.accountStats,
        timestamp: new Date().toISOString()
      };

      const jsonString = JSON.stringify(snapshotData, null, 2);
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(jsonString);
        alert('Data copied to clipboard!');
        console.log('[SHARE] Data successfully copied to clipboard');
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = jsonString;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Data copied to clipboard!');
      }
    } catch (error) {
      console.error('Failed to copy data to clipboard:', error);
      alert('Failed to copy data to clipboard');
    }
  }

  /**
   * Export current date view as Excel file
   */
  async exportCurrentDate() {
    try {
      if (!this.selectedDate) {
        alert('No date selected');
        return;
      }

      // Convert selectedDate string to Date object
      const dateParts = this.selectedDate.split('-').map(Number);
      const fromDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));

      const exportOptions = {
        from: fromDate,
        includeActivities: true,
        includeFirsts: true,
        includeTitles: true,
        includeSummary: true,
        showIconsInline: false
      };

      await this.exportService.exportMultiSheet(exportOptions, {
        selectedPlayers: this.selectedPlayers,
        activityDb: this.activityDb,
        manifestService: this.manifest,
        characters: this.characters,
        getPlayerKey: this.getPlayerKey.bind(this),
        titleService: this.titleService
      });

      console.log('[SHARE] Current date exported successfully');
    } catch (error) {
      console.error('Failed to export current date:', error);
      alert('Failed to export data');
    }
  }
  /**
   * Capture screenshot of current view
   */
  async captureScreenshot() {
    try {
      // Hide the share dropdown first
      this.showShareDropdown = false;
      this.cdr.detectChanges();

      // Wait a moment for UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the main content area to capture - try multiple selectors
      let mainContent = document.querySelector('main') as HTMLElement;
      
      if (!mainContent) {
        // Try alternative selectors
        mainContent = document.querySelector('app-player-search') as HTMLElement;
      }
      
      if (!mainContent) {
        // Try the main container div
        mainContent = document.querySelector('.min-h-screen') as HTMLElement;
      }
      
      if (!mainContent) {
        // Fallback to body
        mainContent = document.body;
      }

      if (!mainContent) {
        alert('Unable to find content to capture');
        return;
      }

      // Use html2canvas to capture the screenshot
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(mainContent as HTMLElement, {
        background: '#0f172a',
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        width: (mainContent as HTMLElement).scrollWidth,
        height: (mainContent as HTMLElement).scrollHeight
      } as any);

      // Convert canvas to blob and download
      canvas.toBlob((blob: Blob | null) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `destiny-chronicle-${this.selectedDate || 'screenshot'}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          console.log('[SHARE] Screenshot captured successfully');
        } else {
          alert('Failed to capture screenshot');
        }
      }, 'image/png');

    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      alert('Failed to capture screenshot. Make sure you have a stable internet connection.');
    }
  }

  /**
   * Shows a success message to the user
   */
  private showSuccessMessage(message: string) {
    // For now, use a simple alert. In the future, this could be a toast notification
    alert(message);
  }

  // Account loading status tracking
  private accountLoadingStatus = new Map<string, LoadingStatus>();
  public accountLoadingStatuses: LoadingStatus[] = [];
  public showLoadingModal = false;
  public isLoadingComplete = false;

  private getD1RaidVariantName(referenceId: string, manifestName: string): string {
    // Map D1 raid referenceIds to their variant types based on our D1_FAMILY_MAP analysis
    const variantMap: { [key: string]: string } = {
      // Vault of Glass variants
      '3801607287': 'Normal',    // Normal (alt)
      '708693006': 'Hard',       // Hard (alt)
      '2659248071': 'Normal',    // Y1 Normal (26)
      '2659248068': 'Hard',      // Y1 Hard (30)
      '2659248069': 'Hard',      // Y1 Hard (31)
      '856898338': '390 Light',  // AOT 390
      '4038697181': '390 Light', // AOT 390 (alt)

      // Crota's End variants
      '898834093': 'Normal',     // Normal (alt)
      '112157962': 'Hard',       // Hard (alt)
      '1836893116': 'Normal',    // Y1 Normal (30)
      '1836893119': 'Hard',      // Y1 Hard (33)
      '2324706853': '390 Light', // AOT 390
      '4000873610': '390 Light', // AOT 390 (alt)

      // King's Fall variants
      '1733556769': 'Normal',    // Normal
      '3534581229': 'Normal',    // Normal (alt)
      '1016659723': 'Hard',      // Hard
      '3978884648': '390 Light', // AOT 390

      // Wrath of the Machine variants
      '2578867903': 'Normal',    // Normal (alt)
      '4007500989': 'Normal',    // Normal (alt)
      '260765522': 'Normal',     // Normal
      '1387993552': 'Hard',      // Hard (380) – verified via PGCR
      '1099433614': 'Hard',      // Hard (pre-Age of Triumph ~380)
      '1342567280': 'Hard',      // Hard (alt)
      '430160982': '390 Light',  // Heroic/390
      '3356249023': '390 Light'  // Heroic/390 (alt)
    };

    return variantMap[referenceId] || 'Normal';
  }

  // Player-specific variant grouping methods
  getPlayerD2RaidVariants(player: any): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    const raids = this.getPlayerRaids(player, 'D2');
    return this.groupRaidsByBaseName(raids, 'D2');
  }

  getPlayerD2DungeonVariants(player: any): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    const dungeons = this.getPlayerDungeons(player, 'D2');
    return this.groupRaidsByBaseName(dungeons, 'D2');
  }

  getPlayerD1RaidVariants(player: any): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    const raids = this.getPlayerRaids(player, 'D1');
    return this.groupRaidsByBaseName(raids, 'D1');
  }

  getPlayerPantheonVariants(player: any): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    const pantheonRaids = this.getPlayerRaids(player, 'D2').filter(raid =>
      raid.name.includes('Pantheon') || raid.name.includes('Pantheon')
    );
    return this.groupRaidsByBaseName(pantheonRaids, 'D2');
  }

  // Rite of the Nine Dungeons methods
  getRiteOfTheNineDungeons(): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    // Collect the three Rite of the Nine dungeons only
    const dungeons = this.getAggregateDungeons('D2').filter(dungeon =>
      (dungeon.name.includes('Ghosts of the Deep') ||
       dungeon.name.includes('Spire of the Watcher') ||
       dungeon.name.includes('Prophecy')) &&
      // Keep only the Rite variants
      (dungeon.name.includes('Explorer') ||
       dungeon.name.includes('Eternity') ||
       dungeon.name.includes('Ultimatum'))
    );

    const variants = dungeons.map(activity => ({
      version: this.getManifestVariantName(activity),
      first: activity,
      hasClear: true
    }));

    // Return a SINGLE card group titled Rite of the Nine
    return [
      {
        baseName: 'Rite of the Nine',
        variants
      }
    ];
  }

  getRiteOfTheNineDungeonGroups(variants: Array<{ 
    version: string; 
    first?: ActivityFirstCompletion; 
    hasClear: boolean;
  }>): Array<{ dungeonName: string; variants: Array<{ 
    version: string; 
    first?: ActivityFirstCompletion; 
    hasClear: boolean;
  }> }> {
    const groups = new Map<string, Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>>();
    
    variants.forEach(variant => {
      let dungeonName = 'Unknown';
      if (variant.first?.name.includes('Ghosts of the Deep')) {
        dungeonName = 'Ghosts of the Deep';
      } else if (variant.first?.name.includes('Spire of the Watcher')) {
        dungeonName = 'Spire of the Watcher';
      } else if (variant.first?.name.includes('Prophecy')) {
        dungeonName = 'Prophecy';
      }
      
      if (!groups.has(dungeonName)) {
        groups.set(dungeonName, []);
      }
      groups.get(dungeonName)!.push(variant);
    });
    
    return Array.from(groups.entries()).map(([dungeonName, variants]) => ({
      dungeonName,
      variants
    }));
  }
  getPlayerRiteOfTheNineVariants(player: any): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    const dungeons = this.getPlayerDungeons(player, 'D2').filter(dungeon =>
      (dungeon.name.includes('Ghosts of the Deep') ||
       dungeon.name.includes('Spire of the Watcher') ||
       dungeon.name.includes('Prophecy')) &&
      (dungeon.name.includes('Explorer') ||
       dungeon.name.includes('Eternity') ||
       dungeon.name.includes('Ultimatum'))
    );

    const variants = dungeons.map(activity => ({
      version: this.getManifestVariantName(activity),
      first: activity,
      hasClear: true
    }));

    return [
      {
        baseName: 'Rite of the Nine',
        variants
      }
    ];
  }

  private groupRaidsByBaseName(activities: ActivityFirstCompletion[], game: 'D1' | 'D2'): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    const groups = new Map<string, { 
      baseName: string; 
      variants: Array<{ 
        version: string; 
        first?: ActivityFirstCompletion; 
        hasClear: boolean;
      }>;
    }>();

    activities.forEach(activity => {
      // Get the manifest name for the base grouping
      const referenceId = activity.referenceId;
      const isD1 = activity.game === 'D1';
      const manifestName = referenceId ? (this.manifest.getActivityName(referenceId, isD1) || activity.name) : activity.name;

      const baseName = this.getBaseRaidName(manifestName, game);

      if (!groups.has(baseName)) {
        groups.set(baseName, {
          baseName,
          variants: []
        });
      }

      const group = groups.get(baseName)!;
      const variant = this.createRaidVariant(activity);

      // Check if this variant already exists (avoid duplicates)
      const existingVariant = group.variants.find((v: any) => v.version === variant.version);

      if (!existingVariant) {
        group.variants.push(variant);
      } else {
        // If we have a duplicate variant, keep the earlier completion
        if (variant.first && existingVariant.first) {
          const variantDate = new Date(variant.first.completionDate);
          const existingDate = new Date(existingVariant.first.completionDate);
          if (variantDate < existingDate) {
            const index = group.variants.indexOf(existingVariant);
            group.variants[index] = variant;
          }
        }
      }
    });

    // Sort variants by priority (Normal first, then others)
    groups.forEach(group => {
      group.variants.sort((a: any, b: any) => {
        const priority: { [key: string]: number } = { 'Normal': 0, 'Standard': 0, 'Hard': 1, 'Master': 2, 'Prestige': 2, 'Challenge': 3 };
        const aPriority = priority[a.version] ?? 999;
        const bPriority = priority[b.version] ?? 999;
        return aPriority - bPriority;
      });
    });

    return Array.from(groups.values()).sort((a, b) => a.baseName.localeCompare(b.baseName));
  }

  private createRaidVariant(activity: ActivityFirstCompletion): { 
    version: string; 
    first?: ActivityFirstCompletion; 
    hasClear: boolean;
  } {
    // Get the proper manifest name for the variant
    const manifestName = this.getManifestVariantName(activity);

    return {
      version: manifestName,
      hasClear: true,
      first: activity
    };
  }

  private getManifestVariantName(activity: ActivityFirstCompletion): string {
    // Get the manifest activity name
    const referenceId = activity.referenceId;
    if (!referenceId) return 'Unknown Activity';

    const isD1 = activity.game === 'D1';
    const manifestName = this.manifest.getActivityName(referenceId, isD1) || 'Unknown Activity';

    // For D1 raids, use referenceId to determine variant type since all variants have the same name
    if (isD1 && activity.type === 'raid') {
      return this.getD1RaidVariantName(referenceId, manifestName);
    }

    // Extract just the variant part from the manifest name
    // For example: "Leviathan, Eater of Worlds" -> "Eater of Worlds"
    // "Leviathan, Spire of Stars" -> "Spire of Stars"
    // "Leviathan (Prestige)" -> "Prestige"
    // "Leviathan" -> "Normal"

    const baseName = this.getBaseRaidName(manifestName, isD1 ? 'D1' : 'D2');

    // If the manifest name is different from the base name, extract the variant
    if (manifestName !== baseName) {
      // Remove the base name and clean up
      let variant = manifestName.replace(baseName, '').trim();

      // Remove common separators
      variant = variant.replace(/^[,:\-]\s*/, '').trim();
      variant = variant.replace(/^\(/, '').replace(/\)$/, '').trim();

      // If we still have a meaningful variant name, return it
      if (variant && variant !== '') {
        return variant;
      }
    }

    // Fallback to difficulty-based naming
    return this.getVariantName(activity.name);
  }

  private getVariantName(activityName: string): string {
    // Extract variant name (Normal, Prestige, Master, etc.)
    if (activityName.includes('Master')) return 'Master';
    if (activityName.includes('Prestige')) return 'Prestige';
    if (activityName.includes('Challenge')) return 'Challenge';
    if (activityName.includes('Hard')) return 'Hard';
    if (activityName.includes('Standard')) return 'Standard';
    if (activityName.includes('Legend')) return 'Legend';
    if (activityName.includes('Grandmaster')) return 'Grandmaster';
    if (activityName.includes('Contest')) return 'Contest';
    if (activityName.includes('Day One')) return 'Day One';
    if (activityName.includes('World First')) return 'World First';
    if (activityName.includes('Heroic')) return 'Heroic';
    if (activityName.includes('Easy')) return 'Easy';
    return 'Normal';
  }

}