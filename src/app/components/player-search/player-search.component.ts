import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BungieApiService, PlayerSearchResult } from '../../services/bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { DestinyManifestService } from '../../services/destiny-manifest.service';
import { ActivityCacheService } from '../../services/activity-cache.service';
import { PGCRCacheService } from '../../services/pgcr-cache.service';
import { LoadingProgressComponent } from '../loading-progress/loading-progress.component';
import { ActivityHistory, Character } from '../../models/activity-history.model';
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption, ActivityMode, ACTIVITY_MODE_MAP } from '../../models/activity-types';
import { ActivityDbService, StoredActivity, FavoriteAccount } from '../../services/activity-db.service';
import { BehaviorSubject, Observable, of, Subject, debounceTime, from } from 'rxjs';
import { map, shareReplay, switchMap, catchError, distinctUntilChanged, exhaustMap } from 'rxjs/operators';
import { TimezoneService } from '../../services/timezone.service';
import { ActivityIconService } from '../../services/activity-icon.service';
import { ActivityFirstCompletion, GuardianFirsts, RAID_NAMES } from '../../models/guardian-firsts.model';
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

// Minimal standalone function to test Bungie API response for profileRecords
async function testBungieProfileRecords(bungieService: any, membershipType: number, membershipId: string) {
  try {
    const response = await firstValueFrom(bungieService.getPlayerTitles(membershipType, membershipId)) as any;
    console.log('[TEST] Full API response:', JSON.stringify(response, null, 2));
    if (response.Response && response.Response.profileRecords && response.Response.profileRecords.data && response.Response.profileRecords.data.records) {
      const records = response.Response.profileRecords.data.records;
      const keys = Object.keys(records);
      console.log('[TEST] profileRecords.data.records keys:', keys);
      console.log('[TEST] profileRecords.data.records[126238604]:', records['126238604']);
      console.log('[TEST] profileRecords.data.records[3175660257]:', records['3175660257']);
    } else {
      console.log('[TEST] profileRecords.data.records not found in response');
    }
  } catch (err) {
    console.error('[TEST] Error fetching Bungie profile records:', err);
  }
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

@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LoadingProgressComponent,
    AccountStatsComponent,
    ExportOptionsDialogComponent
  ],
  templateUrl: './player-search.component.html',
  styleUrls: ['./player-search.component.scss']
})
export class PlayerSearchComponent implements OnInit {
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
  selectedPlatform = '';
  selectedGame: 'D1' | 'D2' = 'D2';
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
  private filteredActivitiesForDate: ActivityWithMembership[] = [];
  private currentLoadToken = 0;
  /** Incrementing token for stats calculations to avoid stale calls resetting the spinner late. */
  private statsCalcToken = 0;
  private readonly PGCR_BATCH_SIZE = 30;
  private readonly VALIDATION_DELAY = 50;
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
  includeLinkedAccounts: boolean = true;
  addMode: boolean = false; // NEW: Track whether we're adding profiles or replacing them
  /** Play-time + seal counts fetched from WastedOnDestiny keyed by "game|membershipId" */
  private wastedTimes: { [playerKey: string]: number } = {};
  private wastedSeals: { [playerKey: string]: number } = {};
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

  // ------------------------------------------------------------------
  // Concurrency-limited queue for per-account sync (Pattern 2)
  // ------------------------------------------------------------------
  private readonly MAX_PARALLEL_PLAYER_SYNCS = 2;
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

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef,
    private activityCacheService: ActivityCacheService,
    private pgcrCacheService: PGCRCacheService,
    private activityDb: ActivityDbService,
    private timezoneService: TimezoneService,
    private activityIconService: ActivityIconService,
    private wastedService: WastedOnDestinyService,
    private playtimeService: PlaytimeService,
    private titleService: TitleService,
    private selectedAccounts: SelectedAccountsService,
    private exportService: ExportService,
    private shareService: ShareService
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
    // Set default date to today
    const today = new Date();
    this.selectedMonth = today.getMonth() + 1;
    this.selectedDay = today.getDate();
    this.selectedDate = `${this.selectedMonth}-${this.selectedDay}`;
    await this.loadAndDisplayFavorites();
    this.dbReady = true;
    this.cdr.detectChanges();
  }

  async loadFavorites() {
    this.favoriteAccounts = await this.activityDb.getFavorites();
    this.cdr.detectChanges();
  }

  /**
   * Automatically load and display favorite profiles on app startup
   */
  async loadAndDisplayFavorites() {
    await this.loadFavorites();
    
    // If we have favorites and no currently selected players, load them automatically
    if (this.favoriteAccounts.length > 0 && this.selectedPlayers.length === 0) {
      await this.loadMultipleFavorites(this.favoriteAccounts);
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

    // Ensure a date is selected
    if (!this.selectedDate) {
      const month = this.currentMonth;
      const day = this.currentDay;
      this.selectedDate = `${month}-${day}`;
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
    }
  }

  isFavorite(player: PlayerSearchDisplay): boolean {
    return this.favoriteAccounts.some(f => 
      f.membershipId === player.membershipId && 
      f.game === player.game && 
      f.membershipType === player.membershipType
    );
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
    console.log('[DEBUG] selectPlatformPlayer:', player);
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
    const incomingGame = (player as any).game || this.selectedGame;
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

    // Use the game property from the player object if present, otherwise fallback to selectedGame
    const displayPlayer: PlayerSearchDisplay = {
      ...player,
      game: (player as any).game || this.selectedGame,
      platform: this.getPlatformName(player.membershipType),
      isPrimary: true
    };
    this.selectedPlayers = [displayPlayer];
    this.selectedCharacterIds[player.membershipId] = undefined;

    // Fetch linked profiles if enabled
    if (this.includeLinkedAccounts) {
      try {
        const linkedResp = await firstValueFrom(this.bungieService.getLinkedProfiles(player.membershipType, player.membershipId));
        const linkedProfiles = linkedResp?.Response?.profiles || [];
        for (const prof of linkedProfiles) {
          if (prof.isCrossSavePrimary) continue; // skip primary (already included)
          // include profile even if private; API will 403 and we will just log it later
          const legacyPlayer: PlayerSearchDisplay = {
            displayName: player.displayName,
            membershipId: prof.membershipId,
            // Convert BungieNext (254) to concrete platform via crossSaveOverride if available
            membershipType: (prof.membershipType === 254 && prof.crossSaveOverride && prof.crossSaveOverride > 0)
              ? prof.crossSaveOverride
              : prof.membershipType,
            game: 'D2',
            platform: this.getPlatformName((prof.membershipType === 254 && prof.crossSaveOverride && prof.crossSaveOverride > 0)
              ? prof.crossSaveOverride
              : prof.membershipType),
            isPrimary: false
          } as any;
          // Deduplicate
          if (!this.selectedPlayers.some(p => p.membershipId === legacyPlayer.membershipId)) {
            this.selectedPlayers.push(legacyPlayer);
            this.selectedCharacterIds[legacyPlayer.membershipId] = undefined;
          }
        }
      } catch (err) {
        console.warn('[LinkedProfiles] Failed to load linked profiles:', err);
      }
    }

    // Ensure a date is selected
    if (!this.selectedDate) {
      const month = this.currentMonth;
      const day = this.currentDay;
      this.selectedDate = `${month}-${day}`;
    }
    // Set loading state for the selected date
    this.loadingActivities[this.selectedDate] = true;
    this.cdr.detectChanges();

    try {
      // Reset running counter for progress UI
      this.overallActivitiesProcessed = 0;

      // Parallel loading of activities, titles, and firsts for each selected player (primary + linked)
      const loadPromises: Promise<void>[] = [];
      for (const pl of this.selectedPlayers) {
        // Use the concurrency-limited runner so only N accounts are being
        // crawled at the same time.  Each player sync includes character
        // history + guardian firsts + dungeon solo firsts serially.
        loadPromises.push(
          this.runWithPlayerSyncLimit(async () => {
            try {
              await this.loadCharacterHistory(pl);
              await this.loadGuardianFirsts(pl);
              await this.loadDungeonSoloFirsts(pl);
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

    const incomingGame = (player as any).game || this.selectedGame;

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

    // Ensure UI reflects the newly added chip immediately.
    this.updatePlatformTabs();
    this.cdr.detectChanges();

    try {
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
  }

  async loadCharacterHistory(player: PlayerSearchResult | PlayerSearchDisplay) {
    console.log('loadCharacterHistory called', { player });
    const key = `characters-${this.getPlayerKey(player)}`;
    this.loading[key] = true;
    this.error[key] = '';
    try {
      const isD1 = this.isD1Player(player);
      if (isD1) {
        // D1: characterId is under characterBase.characterId
        const profile = await firstValueFrom(this.bungieService.getD1Profile(player.membershipType, player.membershipId));
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }
        this.characters[this.getPlayerKey(player)] = profile.Response.data?.characters || [];
        // Set the first character as selected if we have characters
        if (this.characters[this.getPlayerKey(player)].length > 0) {
          // D1: characterBase.characterId
          this.selectedCharacterIds[player.membershipId] = getCharacterId(this.characters[this.getPlayerKey(player)][0]) || '';
        }
        for (const char of this.characters[this.getPlayerKey(player)]) {
          const charId = getCharacterId(char);
          if (!charId) continue; // Defensive: skip if no valid ID
          await this.loadActivityHistoryForCharacter({
            characterId: charId,
            membershipType: player.membershipType,
            membershipId: player.membershipId,
            game: 'D1'
          });
        }
      } else {
        // D2: characterId is top-level
        const profile = await firstValueFrom(this.bungieService.getProfile(player.membershipType, player.membershipId));
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }
        const characters = Object.values(profile.Response.characters?.data || {}) as Array<{ characterId: string }>;
        this.characters[this.getPlayerKey(player)] = characters;
        // Set the first character as selected if we have characters
        if (characters.length > 0) {
          this.selectedCharacterIds[player.membershipId] = getCharacterId(characters[0]) || '';
        }
        for (const char of characters) {
          const charId = getCharacterId(char);
          if (!charId) continue; // Defensive: skip if no valid ID
          await this.loadActivityHistoryForCharacter({
            characterId: charId,
            membershipType: player.membershipType,
            membershipId: player.membershipId,
            game: 'D2'
          });
        }
      }
    } catch (error: any) {
      console.error('Error loading character history:', error);
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
    console.log(`[DEBUG] Looking for character in PGCRs:`, {
      membershipId: character.membershipId,
      characterId: character.characterId,
      game: character.game,
      membershipType: character.membershipType,
      platform: this.getPlatformName(character.membershipType)
    });
    
    // Create array of PGCR fetch promises with metadata
    const pgcrPromises = batch.map(activity => {
      const instanceId = activity.activityDetails?.instanceId;
      if (!instanceId) {
        console.warn('[DEBUG] Activity missing instanceId:', activity);
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
          console.warn(`[DEBUG] PGCR ${instanceId} has no entries (undefined or empty). Marking as unavailable.`);
          validatedActivities.push({
            ...activity,
            pgcrUnavailable: true
          });
          return;
        }
        console.log(`[DEBUG] Processing PGCR ${instanceId}:`, {
          entries: pgcr.entries.map((e: any) => ({
            membershipId: e.player?.destinyUserInfo?.membershipId,
            characterId: e.characterId,
            displayName: e.player?.destinyUserInfo?.displayName,
            membershipType: e.player?.destinyUserInfo?.membershipType,
            platform: this.getPlatformName(e.player?.destinyUserInfo?.membershipType)
          }))
        });

        // Try multiple matching strategies
        const playerInPgcr = pgcr.entries.some((entry: PGCREntry) => {
          // Strategy 1: Exact match (both membershipId and characterId)
          const exactMatch = entry.player?.destinyUserInfo?.membershipId === character.membershipId &&
                           entry.characterId === character.characterId;
          
          // Strategy 2: Just membershipId match
          const membershipMatch = entry.player?.destinyUserInfo?.membershipId === character.membershipId;
          
          // Strategy 3: Just characterId match (for cross-save scenarios)
          const characterMatch = entry.characterId === character.characterId;
          
          // Strategy 4: Platform-specific membershipId match
          const platformMatch = entry.player?.destinyUserInfo?.membershipType === character.membershipType &&
                              entry.player?.destinyUserInfo?.membershipId === character.membershipId;

          // Log match attempt details
          console.log(`[DEBUG] Match attempt for PGCR ${instanceId}:`, {
            entry: {
              membershipId: entry.player?.destinyUserInfo?.membershipId,
              characterId: entry.characterId,
              membershipType: entry.player?.destinyUserInfo?.membershipType,
              platform: this.getPlatformName(entry.player?.destinyUserInfo?.membershipType)
            },
            character: {
              membershipId: character.membershipId,
              characterId: character.characterId,
              membershipType: character.membershipType,
              platform: this.getPlatformName(character.membershipType)
            },
            matchResults: {
              exactMatch,
              membershipMatch,
              characterMatch,
              platformMatch
            }
          });

          return exactMatch || membershipMatch || characterMatch || platformMatch;
        });

        if (playerInPgcr) {
          console.log(`[DEBUG] Successfully validated activity ${instanceId} for player ${character.membershipId}`);
          validatedActivities.push({
            ...activity,
            validated: true,
            validatedAt: new Date().toISOString()
          });
        } else {
          console.warn(`[DEBUG] Player ${character.membershipId} not found in PGCR ${instanceId} using any matching strategy`);
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
        : [undefined];    // D2 – aggregated

      for (const mode of modes) {
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

          const uniqueNewActivities = storedActivities.filter(activity => 
            !dbActivities.some(existing => this.isDuplicateActivity(existing, activity))
          );

          // Count every activity we fetched toward the progress display, even if it was already cached
          this.overallActivitiesProcessed += storedActivities.length;

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
            const foundToday = storedActivities.some(act => this.isActivityOnSelectedDate(act));
            if (foundToday) {
              this.initialDisplayShown = true;
              // Fire-and-forget – we don't await to avoid stalling further page fetches.
              this.loadAllFilteredActivities(true);
            }
          }

          // Emit progress before heavy processing so user sees immediate feedback
          const percent = ((page + 1) / (page + 2)) * 100;
          this.updateLoadingProgress(
            'fetch',
            percent,
            100,
            `Fetching activities (${percent.toFixed(0)}%)…`
          );
          
          page++;
        }
      }

      this.processAndGroupActivities();
      await this.loadAllFilteredActivities();
    } catch (error) {
      console.error('Error loading activity history:', error);
      throw error;
    } finally {
      this.loadingActivities[loadingKey] = false;
      this.loadingProgress = null;
      this.cdr.detectChanges();
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
      this.debugLogEarliestActivity();
      return;
    }
    // Initialise process-phase progress bar
    this.updateLoadingProgress('process', 0, totalToProcess, 'Processing activities…');
    let processedCount = 0;
    const accountGroups = new Map<string, AccountGroup>();
    for (const activity of this.filteredActivitiesForDate) {
      const accountKey = `${activity.game}|${activity.membershipId}`;
      if (!accountGroups.has(accountKey)) {
        accountGroups.set(accountKey, {
          displayName: activity.displayName,
          platform: activity.platform,
          game: activity.game,
          yearGroups: new Map<string, YearGroup>()
        });
      }
      const account = accountGroups.get(accountKey)!;
      const year = new Date(activity.period).getFullYear().toString();
      if (!account.yearGroups.has(year)) {
        account.yearGroups.set(year, {
          year,
          typeGroups: new Map<string, TypeGroup>()
        });
      }
      const yearGroup = account.yearGroups.get(year)!;
      // Use manifest to get real activity name and type
      const referenceId = activity.activityDetails?.referenceId;
      const isD1 = activity.game === 'D1';
      const activityName = this.manifest.getActivityName(referenceId, isD1) || 'Unknown Activity';
      const activityType = this.manifest.getActivityType(referenceId, activity.activityDetails?.mode);
      const normalizedType = (activityType || 'other').toLowerCase().replace(/\s+/g, '-');
      const groupKey = `${activityName}`;
      if (!yearGroup.typeGroups.has(groupKey)) {
        let icon = this.activityIconService.getActivityIconPath(normalizedType, isD1);
        if (!icon) {
          icon = this.activityIconService.getActivityIconPath('other', isD1);
        }
        yearGroup.typeGroups.set(groupKey, {
          name: activityName,      // for display
          type: activityType,      // for icon
          isD1,
          image: this.getActivityImage(activity, isD1),
          icon,
          activities: []
        });
      }
      yearGroup.typeGroups.get(groupKey)!.activities.push(activity);

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
    for (const account of accountGroups.values()) {
      for (const yearGroup of account.yearGroups.values()) {
        for (const typeGroup of yearGroup.typeGroups.values()) {
          typeGroup.activities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
        }
      }
    }

    this.groupedActivitiesByAccount = Array.from(accountGroups.values()).map(account => ({
      ...account,
      yearGroups: Array.from(account.yearGroups.values()).map(yearGroup => ({
        year: yearGroup.year,
        typeGroups: Array.from(yearGroup.typeGroups.values())
      }))
    }));
    this.cdr.detectChanges();
    await this.setFirstEverActivityFromDb();
    this.debugLogEarliestActivity();
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

  public async loadAllFilteredActivities(forceRefresh: boolean = false) {
    const loadToken = ++this.currentLoadToken;

    // Kick off render-phase progress bar (will update inside slice loop)
    this.updateLoadingProgress('render', 0, 1, 'Preparing display…');

    try {
      const activities = await this.getAllFilteredActivitiesForDate(forceRefresh);
      if (loadToken !== this.currentLoadToken) return; // Abort if a newer load started

      // Ensure Destiny manifest has finished loading so that activity names/types resolve properly
      if (!this.manifest.isLoadedSync) {
        await this.manifest.isLoaded().toPromise();
      }

      // PROCESS phase handled separately—ensure groups are ready before rendering slices
      this.processAndGroupActivities();

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
        this.cdr.detectChanges();
      }
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
    if ((player as any).game) {
      // D1/D2 distinction by explicit property
      return (player as any).game === 'D1';
    }
    // Fallback: D1 is Xbox/PlayStation, no BungieGlobalDisplayName, not cross-save
    // This logic is brittle if Bungie changes their API, so always test both games after refactor.
    return (player.membershipType === 1 || player.membershipType === 2) && 
           !(player as any).bungieGlobalDisplayName &&
           !(player as any).isCrossSavePrimary;
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
      '3801607287', '708693006', '2659248071', '2043403989', // Vault of Glass
      '898834093', '112157962', '3879860662', '1836893116', // Crota's End
      '1733556769', '421023204', '1661734046', '2964135793', // King's Fall
      '2578867903', '4007500989', '1099433614', '1342567280', '260765522' // Wrath of the Machine
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
      // Special case for Dungeons (D2 only)
      if (this.selectedActivityType.label === 'Dungeon') {
        return game === 'D2' && mode === this.selectedActivityType.d2Mode;
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
    let totalTime = 0;
    let totalActivityTime = 0;
    const perType: { [type: string]: { count: number, time: number } } = {};
    const allFirstCompletions: ActivityFirstCompletion[] = [];

    try {
      // <--- INSERT HERE
      const D1_RAID_HASHES = [
        '3801607287', '708693006', '2659248071', '2043403989', // Vault of Glass
        '898834093', '112157962', '3879860662', '1836893116', // Crota's End
        '1733556769', '421023204', '1661734046', '2964135793', // King's Fall
        '2578867903', '4007500989', '1099433614', '1342567280', '260765522' // Wrath of the Machine
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
        const key = `${pl.game}-${platformName}`;
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
    const sameDate = newMonth === this.selectedMonth && newDay === this.selectedDay;
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
    this.selectedDate = `${month}-${day}`;
    
    // Set loading state for the selected date
    this.loadingActivities[this.selectedDate] = true;
    this.cdr.detectChanges();

    try {
      await this.loadAllFilteredActivities();
    } catch (error) {
      console.error('Error loading activities for date:', error);
    } finally {
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
    }
  }

  private isActivityOnSelectedDate(activity: ActivityHistory): boolean {
    if (!activity.period) return false;
    
    const activityDate = new Date(activity.period);
    const activityMonth = activityDate.getUTCMonth() + 1; // Convert 0-11 to 1-12
    const activityDay = activityDate.getUTCDate();
    const activityYear = activityDate.getUTCFullYear();

    // Debug logging for specific activity
    if (activity.activityDetails.instanceId === '1859166440') {
      console.log('[Date Check] Activity 1859166440:', {
        period: activity.period,
        utc: activityDate.toISOString(),
        month: activityMonth,
        day: activityDay,
        year: activityYear,
        selectedMonth: this.selectedMonth,
        selectedDay: this.selectedDay,
        selectedYear: this.selectedYear
      });
    }

    return activityMonth === this.selectedMonth && 
           activityDay === this.selectedDay && 
           (!this.selectedYear || activityYear === this.selectedYear);
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
    // Parse the month and day from the date string
    const [month, day] = dateStr.split('-').map(Number);
    
    // Create a date object for comparison (year doesn't matter)
    const selectedDate = new Date(Date.UTC(2024, month - 1, day));
    
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    // Only treat as future date if the month/day is in the future
    const isFutureDate = selectedDate.getUTCMonth() > today.getUTCMonth() || 
                        (selectedDate.getUTCMonth() === today.getUTCMonth() && 
                         selectedDate.getUTCDate() > today.getUTCDate());
    
    if (isFutureDate) {
      console.log('[DEBUG] Future date detected, using today instead');
      this.selectedDate = `${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
    } else {
      // Keep just the month and day
      this.selectedDate = `${month}-${day}`;
    }
    
    console.log('[DEBUG] Date validated and set to:', {
      selectedDate: this.selectedDate,
      month: selectedDate.getUTCMonth() + 1,
      day: selectedDate.getUTCDate(),
      isFutureDate
    });
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

  async addPlayer() {
    if (!this.searchUsername) {
      this.errorMessage = 'Please enter a username.';
      return;
    }

    // Reset state for fresh search
    this.errorMessage = '';
    this.d1SearchResults = [];
    this.d2SearchResults = [];
    this.crossSavePlayer = null;
    this.showPlatformPicker = false;
    this.loading['search'] = true;

    try {
      const [d2Resp, d1Xbox, d1Psn] = await firstValueFrom(
        this.bungieService.searchAllGames(this.searchUsername)
      );

      /* --------------------
         Process Destiny 2
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
                game: 'D2',
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
      -------------------- */
      const d1Players = [...(d1Xbox || []), ...(d1Psn || [])];
      this.d1SearchResults = d1Players.map(pl => ({
        ...pl,
        game: 'D1',
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
      }

    } catch (error: any) {
      console.error('Error searching accounts:', error);
      if (error.status === 503) {
        this.errorMessage = 'Bungie API is temporarily unavailable. Please try again later.';
      } else {
        this.errorMessage = 'Error searching for accounts.';
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
    this.clearCache();
    this.cdr.detectChanges();
  }

  removePlayer(index: number) {
    const removed = this.selectedPlayers.splice(index, 1)[0];
    if (removed) {
      this.selectedAccounts.remove(removed.membershipId);
    }
    // Recalculate account stats when a player is removed
    this.calculateAccountStats();
    this.cdr.detectChanges();
    this.updatePlatformTabs();
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

    const [month, day] = this.selectedDate.split('-').map(Number);
    console.log('[DEBUG][D1] Processing date:', { month, day, selectedDate: this.selectedDate });
    
    const allFilteredActivities: ActivityWithMembership[] = [];

    // Get all activities for selected players in parallel
    const playerActivitiesPromises = this.selectedPlayers.map(async player => {
      console.log('[DEBUG][D1] Processing player:', { 
        displayName: player.displayName, 
        membershipId: player.membershipId,
        game: player.game,
        isD1: this.isD1Player(player)
      });
      
      // Use the new optimized query methods based on activity type
      let playerActivities: StoredActivity[] = [];
      
      if (this.selectedActivityType.label === 'All') {
        // Get all activities for the date
        const charIds = (this.characters[this.getPlayerKey(player)] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);
        console.log('[DEBUG][D1] Found character IDs:', { 
          player: player.displayName, 
          charIds,
          characters: this.characters[this.getPlayerKey(player)]
        });
        
        const activitiesPromises = charIds.map(async charId => {
          console.log('[DEBUG][D1] Fetching activities for character:', {
            player: player.displayName,
            charId,
            membershipId: player.membershipId,
            month,
            day
          });
          
          const activities = await this.activityDb.getActivitiesByDate(player.membershipId, charId, month, day);
          
          // Debug log for D1 activities
          if (player.game === 'D1') {
            console.log(`[DEBUG][D1] Activities for ${player.displayName} (${player.membershipId}) character ${charId} on ${month}-${day}:`, {
              count: activities.length,
              activities: activities.map(a => ({
                period: a.period,
                mode: a.activityDetails?.mode,
                referenceId: a.activityDetails?.referenceId,
                instanceId: a.activityDetails?.instanceId
              }))
            });
          }
          return activities;
        });
        const activitiesArrays = await Promise.all(activitiesPromises);
        playerActivities = activitiesArrays.flat();
      } else {
        // Get activities filtered by mode and date
        const startDate = new Date(Date.UTC(2014, month - 1, day, 0, 0, 0));
        const endDate = new Date(Date.UTC(2030, month - 1, day, 23, 59, 59));
        const mode = player.game === 'D1' ? this.selectedActivityType.d1Mode : this.selectedActivityType.d2Mode;
        console.log('[DEBUG][D1] Filtering by mode:', {
          player: player.displayName,
          game: player.game,
          mode,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        });
        
        playerActivities = await this.activityDb.getActivitiesByModeAndDate(
          player.membershipId,
          mode ?? 0,
          startDate,
          endDate
        );
      }

      // Keep only activities that belong to the same game as this player
      playerActivities = playerActivities.filter(a => {
        const g = (a as any).game as 'D1' | 'D2' | undefined;
        // Older cached rows may not include the `game` marker – treat them as belonging to this player's game
        return !g || g === player.game;
      });

      if (player.game === 'D1') {
        console.log(`[DEBUG][D1] Filtered D1 activities for ${player.displayName}:`, {
          count: playerActivities.length,
          activities: playerActivities.map(a => ({
            period: a.period,
            mode: a.activityDetails?.mode,
            referenceId: a.activityDetails?.referenceId,
            instanceId: a.activityDetails?.instanceId
          }))
        });
      }
      
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

    // Deduplicate by instanceId
    const dedupedMap = new Map<string, ActivityWithMembership>();
    for (const activity of allFilteredActivities) {
      const instanceId = activity.activityDetails?.instanceId;
      if (instanceId && !dedupedMap.has(instanceId)) {
        dedupedMap.set(instanceId, activity);
      }
    }

    const dedupedActivities = Array.from(dedupedMap.values());
    // Sort by period (descending)
    dedupedActivities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
    
    // Debug log: count of D1 activities for this date
    const d1Count = dedupedActivities.filter(a => a.game === 'D1').length;
    console.log(`[DEBUG][D1] Total deduped D1 activities for ${this.selectedDate}:`, d1Count);

    // Cache only after initial full sync completes so early partial lists don't persist
    if (this.firstFullSyncDone) {
      this.filteredActivitiesCache.set(cacheKey, { list: dedupedActivities, dirty: false });
    }
    
    this.filteredActivitiesForDate = dedupedActivities;
    return dedupedActivities;
  }

  // Helper for Guardian Firsts template
  getGuardianFirstsForGame(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    // Only show raids and dungeons
    return this.guardianFirsts.filter(f => f.game === game && (f.type === 'raid' || f.type === 'dungeon'));
  }

  getGuardianFirstRaidsForGame(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const raids = this.guardianFirsts.filter(f => f.type === 'raid' && f.game === game);

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

    return raids.sort((a, b) => {
      const aIndex = releaseOrder.indexOf(a.name);
      const bIndex = releaseOrder.indexOf(b.name);
      return aIndex - bIndex;
    });
  }

  getGuardianFirstDungeonsForGame(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    if (game === 'D1') return [];
    const dungeons = this.guardianFirsts.filter(f => f.type === 'dungeon' && f.game === game);
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
    return dungeons.sort((a, b) => {
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

  groupActivitiesByType(activities: any[]): ActivityGroup[] {
    const groups = new Map<string, ActivityGroup>();
    
    activities.forEach(activity => {
      const key = `${activity.activityDetails?.referenceId}-${activity.game}`;
      if (!groups.has(key)) {
        groups.set(key, {
          type: activity.activityDetails?.mode || 0,
          game: activity.game,
          activities: []
        });
      }
      groups.get(key)?.activities.push(activity);
    });

    // Sort activities within each group by time
    groups.forEach(group => {
      group.activities.sort((a, b) => 
        new Date(b.period).getTime() - new Date(a.period).getTime()
      );
    });

    return Array.from(groups.values());
  }

  getAverageDuration(activities: any[]): number {
    if (!activities.length) return 0;
    const totalDuration = activities.reduce((sum, activity) => 
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
      const perName = new Map<string, ActivityFirstCompletion>();
      for (const f of allFirsts) {
        const key = `${f.game}|${f.type}|${f.name}`;
        const existing = perName.get(key);
        if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
          perName.set(key, f);
        }
      }
      const sorted = Array.from(perName.values()).sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime());
      // store per-player list (keyed by game+membershipId)
      const pKey = this.getPlayerKey(player);
      this.guardianFirstsMap[pKey] = sorted;
      // recompute aggregate list (dedup by name + game + type)
      const aggregate: ActivityFirstCompletion[] = [];
      const seen = new Set<string>();
      Object.values(this.guardianFirstsMap).forEach(list => {
        for (const f of list) {
          const key = `${f.game}|${f.type}|${f.name}`;
          const existing = aggregate.find(x => `${x.game}|${x.type}|${x.name}` === key);
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

  /** Aggregate helpers */
  getAggregateRaids(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const earliest = this.getEarliestFirsts(this.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'raid'));
    return this.sortRaids(earliest, game);
  }

  getAggregateDungeons(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const earliest = this.getEarliestFirsts(this.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'dungeon'));
    return this.sortDungeons(earliest);
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
    return list.slice().sort((a, b) => releaseOrder.indexOf(a.name) - releaseOrder.indexOf(b.name));
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

  handleImageError(event: Event, isD1: boolean): void {
    const imgElement = event.target as HTMLImageElement;
    // Prevent infinite loop: only set if not already the fallback
    if (!imgElement.src.includes('/assets/icons/activities/ghost.png')) {
      imgElement.src = '/assets/icons/activities/ghost.png';
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
      testBungieProfileRecords(this.bungieService, player.membershipType, player.membershipId);
    } else {
      console.warn('[TEST] No player selected for test.');
    }
  }

  /**
   * Returns the first-ever activity for a player for the specified game (D1 or D2).
   * No need to filter by activity.game, as all activities for the player are for the correct game.
   */
  async getFirstEverActivity(player: PlayerSearchDisplay, game: 'D1' | 'D2'): Promise<ActivityHistory | undefined> {
    console.log('[DEBUG][FirstEver] Starting getFirstEverActivity for:', {
      player: player.displayName,
      game,
      membershipId: player.membershipId
    });

    const charIds = (this.characters[this.getPlayerKey(player)] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);
    
    console.log('[DEBUG][FirstEver] Found character IDs:', charIds);

    let allActivities: ActivityHistory[] = [];
    for (const charId of charIds) {
      const activities = await this.activityDb.getAllActivitiesForCharacter(player.membershipId, charId);
      console.log(`[DEBUG][FirstEver] Activities for character ${charId}:`, {
        count: activities.length,
        sample: activities.slice(0, 3).map(a => ({
          period: a.period,
          mode: a.activityDetails?.mode,
          referenceId: a.activityDetails?.referenceId
        }))
      });
      allActivities = allActivities.concat(activities);
    }

    // Filter out activities with a period in the future
    const now = new Date();
    const validActivities = allActivities.filter(a => {
      const periodDate = new Date(a.period);
      return periodDate <= now;
    });

    console.log('[DEBUG][FirstEver] Total valid activities found (not in future):', {
      count: validActivities.length,
      periods: validActivities.slice(0, 5).map(a => a.period)
    });

    if (validActivities.length === 0) {
      console.log('[DEBUG][FirstEver] No valid activities found');
      return undefined;
    }

    const firstActivity = validActivities.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())[0];
    console.log('[DEBUG][FirstEver] First valid activity found:', {
      period: firstActivity.period,
      mode: firstActivity.activityDetails?.mode,
      referenceId: firstActivity.activityDetails?.referenceId
    });

    return firstActivity;
  }

  // Replace the helper function with an async DB version
  async computeFirstEverActivityForSelectedPlayerFromDb(): Promise<ActivityHistory | undefined> {
    if (this.selectedPlayers.length === 0) return undefined;
    const player = this.selectedPlayers[0];
    const charIds = (this.characters[this.getPlayerKey(player)] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);

    let allActivities: ActivityHistory[] = [];
    for (const charId of charIds) {
      const activities = await this.activityDb.getAllActivitiesForCharacter(player.membershipId, charId);
      allActivities = allActivities.concat(activities);
    }
    const now = new Date();
    const validActivities = allActivities.filter(a => {
      const d = new Date(a.period);
      return d instanceof Date && !isNaN(d.getTime()) && d <= now;
    });
    if (validActivities.length === 0) return undefined;
    return validActivities.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())[0];
  }

  // Add a debug method to log the earliest activity from the DB for the selected player
  async debugLogEarliestActivity() {
    if (this.selectedPlayers.length === 0) {
      console.log('[DEBUG] No player selected');
      return;
    }
    const player = this.selectedPlayers[0];
    const charIds = (this.characters[this.getPlayerKey(player)] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);

    let allActivities: ActivityHistory[] = [];
    for (const charId of charIds) {
      const activities = await this.activityDb.getAllActivitiesForCharacter(player.membershipId, charId);
      allActivities = allActivities.concat(activities);
    }
    allActivities.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());
    if (allActivities.length === 0) {
      console.log('[DEBUG] No activities found in DB for player', player.displayName);
    } else {
      console.log('[DEBUG] Earliest activity from DB:', allActivities[0]);
    }
  }

  // Add a helper to set firstEverActivity from the async DB function
  private async setFirstEverActivityFromDb() {
    this.firstEverActivity = await this.computeFirstEverActivityForSelectedPlayerFromDb();
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
            console.log('[TITLES DEBUG] All player record hashes:', recordKeys);
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
   * Returns the DungeonSoloFirst entry whose family name is contained within the provided label.
   * This tolerates labels like "Pit of Heresy: Normal" by fuzzy-matching against the canonical
   * family name ("Pit of Heresy").
   */
  getDungeonSoloFirstForPlayer(player: PlayerSearchDisplay, label: string): DungeonSoloFirst | undefined {
    const list = this.dungeonSoloFirsts[player.membershipId];
    if (!list) return undefined;
    const lower = label.toLowerCase();
    return list.find(d => lower.includes(d.family.toLowerCase()));
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

  /** Returns cached first ever activity for player */
  getFirstEverForPlayer(player: PlayerSearchDisplay): ActivityHistory | undefined {
    return this.firstEverActivities[this.getPlayerKey(player)];
  }

  /** Compute first-ever activity per player */
  private async computeFirstEverActivityForPlayer(player: PlayerSearchDisplay): Promise<ActivityHistory | undefined> {
    const charIds = (this.characters[this.getPlayerKey(player)] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);

    let allActivities: ActivityHistory[] = [];
    for (const charId of charIds) {
      const activities = await this.activityDb.getAllActivitiesForCharacter(player.membershipId, charId);
      allActivities = allActivities.concat(activities);
    }
    const now = new Date();
    const valid = allActivities.filter(a => new Date(a.period) <= now && (a as any).game === player.game);
    if (valid.length === 0) return undefined;
    return valid.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())[0];
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
  onIncludeLinkedChange(): void {
    if (this.selectedPlayers.length === 0) return;

    const primary = this.selectedPlayers.find(p => p.isPrimary) || this.selectedPlayers[0];

    if (this.includeLinkedAccounts) {
      this.bungieService
        .getLinkedProfiles(primary.membershipType as any, primary.membershipId)
        .pipe(
          map((resp: any) => resp?.Response?.profiles ?? []),
          catchError(err => {
            console.warn('[LinkedProfiles] Failed to load linked profiles on toggle:', err);
            return of([]);
          })
        )
        .subscribe(profiles => {
          let changed = false;
          for (const prof of profiles) {
            if (prof.isCrossSavePrimary) continue;
            if (this.selectedPlayers.some(p => p.membershipId === prof.membershipId)) continue;
            const linked: PlayerSearchDisplay = {
              displayName: primary.displayName,
              membershipId: prof.membershipId,
              membershipType: prof.membershipType,
              game: 'D2',
              platform: this.getPlatformName(prof.membershipType),
              isPrimary: false
            } as any;
            this.selectedPlayers.push(linked);
            this.selectedCharacterIds[linked.membershipId] = undefined;
            changed = true;
          }
          if (changed) {
            this.updatePlatformTabs();
            this.cdr.detectChanges();
          }
        });
    } else {
      const beforeCount = this.selectedPlayers.length;
      this.selectedPlayers = this.selectedPlayers.filter(p => p.isPrimary);
      if (this.selectedPlayers.length !== beforeCount) {
        this.updatePlatformTabs();
        this.cdr.detectChanges();
      }
    }
  }

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

    // Use the first as primary (re-use existing flow)
    const [primary, ...rest] = selectedPlayers;
    await this.selectPlayer(primary);

    // Load the rest in parallel
    const tasks = rest.map(displayPlayer =>
      this.runWithPlayerSyncLimit(async () => {
        try {
          await this.loadCharacterHistory(displayPlayer);
          await this.loadGuardianFirsts(displayPlayer);
          await this.loadDungeonSoloFirsts(displayPlayer);
          await this.loadWastedTime(displayPlayer);
        } catch (err) {
          console.warn('[LoadSelected] skipped player due to error', displayPlayer.membershipId, err);
        }
      })
    );

    if (tasks.length) {
      await Promise.all(tasks);
    }

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
  setActiveFirstsGame(game: 'D1' | 'D2'): void {
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
      const existing = map.get(first.name);
      if (!existing) {
        map.set(first.name, first);
        continue;
      }
      // Keep the earliest based on completionDate (ISO string)
      if (new Date(first.completionDate) < new Date(existing.completionDate)) {
        map.set(first.name, first);
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



  // ------------------------------------------------------------------
  // Export helpers
  // ------------------------------------------------------------------
  async exportActivities(): Promise<void> {
    if (!this.selectedDate) {
      console.warn('[Export] No date selected');
      return;
    }

    const [month, day] = this.selectedDate.split('-').map(Number);
    const year = new Date().getFullYear();
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
  modalSelectedPlayers: Set<string> = new Set(); // Track selected players in modal

  openExportOptionsDialog() {
    this.showExportDialog = true;
  }

  async handleExportOptions(options: any) {
    console.log('Received export options:', options);
    this.showExportDialog = false;
    // Convert selectedDate (e.g., '7-18') to a valid ISO date string if needed
    if (options.from && typeof options.from === 'string' && options.from.match(/^\d{1,2}-\d{1,2}$/)) {
      const [month, day] = options.from.split('-').map(Number);
      const year = new Date().getFullYear();
      options.from = new Date(Date.UTC(year, month - 1, day)).toISOString();
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
            console.log('[TITLES DEBUG] All player record hashes:', recordKeys);
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
    const state = { d: dateStr, p: players, l: this.includeLinkedAccounts };
    const link = this.shareService.buildLink(state);
    try {
      await navigator.clipboard.writeText(link);
      alert('Share link copied to clipboard!');
    } catch {
      prompt('Copy link', link);
    }
  }
}