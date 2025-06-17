import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BungieApiService, PlayerSearchResult } from '../../services/bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { DestinyManifestService } from '../../services/destiny-manifest.service';
import { ActivityCacheService } from '../../services/activity-cache.service';
import { PGCRCacheService } from '../../services/pgcr-cache.service';
import { LoadingProgressComponent, LoadingProgress } from '../loading-progress/loading-progress.component';
import { ActivityHistory, Character } from '../../models/activity-history.model';
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption, ActivityMode, ACTIVITY_MODE_MAP } from '../../models/activity-types';
import { ActivityDbService, StoredActivity, FavoriteAccount } from '../../services/activity-db.service';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { map, shareReplay, switchMap, catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TimezoneService } from '../../services/timezone.service';
import { ActivityIconService } from '../../services/activity-icon.service';
import { ActivityFirstCompletion, GuardianFirsts, RAID_NAMES } from '../../models/guardian-firsts.model';
import type { ActivityIconType } from '../../services/activity-icon.service';
import { SafeHtml } from '@angular/platform-browser';
import { isPvP } from '../../utils/activity-utils';
import { getActivityName } from '../../utils/activity-utils';
import { DungeonSoloFirst } from '../../models/dungeon-solo-first.model';
import { WastedOnDestinyService } from '../../services/wasted-on-destiny.service';

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
};

// Aggregated statistics per platform (e.g., Xbox, PlayStation, Steam)
interface PlatformStats {
  platform: string;
  totalTime: number;
  totalActivities: number;
  totalSeals: number;
}

@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingProgressComponent],
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
  private filteredActivitiesCache: Map<string, ActivityWithMembership[]> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  private filteredActivities$ = new BehaviorSubject<ActivityHistory[]>([]);
  private searchTerm$ = new Subject<string>();
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
  /** Cached seconds played per membershipId (from Wasted on Destiny or Bungie fallback) */
  private wastedTimes: { [membershipId: string]: number } = {};
  /** Running count of how many activities have been processed in the current load session */
  private overallActivitiesProcessed: number = 0;
  /** Helper to get earliest first per activity name across all players */
  private getEarliestFirsts(list: ActivityFirstCompletion[]): ActivityFirstCompletion[] {
    const map = new Map<string, ActivityFirstCompletion>();
    for (const first of list) {
      const key = first.name;
      if (!map.has(key) || new Date(first.completionDate).getTime() < new Date(map.get(key)!.completionDate).getTime()) {
        map.set(key, first);
      }
    }
    return Array.from(map.values());
  }
  /** Aggregated solo/flawless lookup for aggregated first cards */
  getSoloFirstForFirst(first: ActivityFirstCompletion): DungeonSoloFirst | undefined {
    if (!first?.membershipId) return undefined;
    const player = this.selectedPlayers.find(p => p.membershipId === first.membershipId);
    if (!player) return undefined;
    return this.getDungeonSoloFirstForPlayer(player, first.name);
  }
  private wastedSeals: { [membershipId: string]: number } = {};
  perPlatformStats: PlatformStats[] = [];
  firstEverActivities: { [membershipId: string]: ActivityHistory | undefined } = {};
  aggregatedTitles: any[] = [];
  // UI state for title view
  titleSort: 'alpha' | 'release' = 'alpha';
  titleFilter: 'all' | 'current' | 'legacy' = 'all';
  loadingTitlesOverall = false;

  get displayTitles(): any[] {
    let list = this.aggregatedTitles;
    if (this.titleFilter !== 'all') {
      const wantLegacy = this.titleFilter === 'legacy';
      list = list.filter(t => t.legacy === wantLegacy);
    }
    if (this.titleSort === 'release') {
      return [...list].sort((a: any, b: any) => (b.releaseRank ?? 0) - (a.releaseRank ?? 0));
    }
    return [...list].sort((a: any, b: any) => a.name.localeCompare(b.name));
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
    private wastedService: WastedOnDestinyService
  ) {
    (window as any).activityDbService = this.activityDb;
    this.updatePlatformTabs();

    // Debounce username input changes (300 ms). No API hit yet; prepares for future live suggestions.
    this.searchTerm$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(term => {
        this.searchUsername = term;
      });
  }

  private updatePlatformTabs() {
    this.platformTabs = Array.from(new Set(this.selectedPlayers.map(p => p.platform)));
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
    await this.loadFavorites();
    this.dbReady = true;
    this.cdr.detectChanges();
  }

  async loadFavorites() {
    this.favoriteAccounts = await this.activityDb.getFavorites();
    this.cdr.detectChanges();
  }

  isFavorite(player: PlayerSearchDisplay): boolean {
    return this.favoriteAccounts.some(f => f.membershipId === player.membershipId && f.game === player.game);
  }

  async toggleFavorite(player: PlayerSearchDisplay) {
    if (this.isFavorite(player)) {
      await this.activityDb.removeFavorite(player.membershipId, player.game);
    } else {
      await this.activityDb.addFavorite({
        membershipId: player.membershipId,
        membershipType: player.membershipType,
        displayName: player.displayName,
        game: player.game,
        platform: player.platform,
        lastUpdated: new Date().toISOString()
      });
    }
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

  getPlatforms(game: string): string[] {
    const platforms = new Set<string>();
    this.selectedPlayers.forEach(player => {
      if ((game === 'D1' && this.isD1Player(player)) || 
          (game === 'D2' && !this.isD1Player(player))) {
        platforms.add(this.getPlatformName(player.membershipType));
      }
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
      const response = await firstValueFrom(this.bungieService.searchD2Player(searchTerm));
      console.log('D2 search response:', response);
      
      if (!response || response.ErrorCode !== 1) {
        this.errorMessage = 'No Destiny 2 player found with that username.';
        return;
      }

      if (!response.Response || response.Response.length === 0) {
        this.errorMessage = 'No Destiny 2 player found with that username.';
        return;
      }

      // Find cross-save primary if available
      const crossSave = response.Response.find((profile: any) => profile.crossSaveOverride && profile.crossSaveOverride > 0);
      if (crossSave) {
        this.crossSavePlayer = {
          ...crossSave,
          game: 'D2',
          platform: this.getPlatformName(crossSave.membershipType)
        };
        console.log('[DEBUG] Found crossSavePlayer:', this.crossSavePlayer);
      }

      // Store all returned memberships for platform selection
      this.d2SearchResults = response.Response.map((player: PlayerSearchResult) => ({
        ...player,
        game: 'D2',
        platform: this.getPlatformName(player.membershipType)
      }));
      console.log('[DEBUG] d2SearchResults:', this.d2SearchResults);

      // Show platform picker if more than one membership or cross-save is available
      if (this.d2SearchResults.length > 1 || this.crossSavePlayer) {
        this.showPlatformPicker = true;
        console.log('[DEBUG] showPlatformPicker set to true');
      } else if (this.d2SearchResults.length === 1) {
        // Only one result, auto-select
        await this.selectPlayer(this.d2SearchResults[0]);
      }
    } catch (error: any) {
      console.error('Error searching D2 player:', error);
      if (error.status === 503) {
        this.errorMessage = 'Bungie API is temporarily unavailable. Please try again in a few minutes.';
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
    // Hide the platform picker
    this.showPlatformPicker = false;

    // Check if player is already selected
    if (this.selectedPlayers.some(p => p.membershipId === player.membershipId)) {
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
            membershipType: prof.membershipType,
            game: 'D2',
            platform: this.getPlatformName(prof.membershipType),
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
        // Load character history first, then guardian firsts for that character
        loadPromises.push(
          this.loadCharacterHistory(pl)
            .then(() => this.loadGuardianFirsts(pl))
            .then(() => this.loadDungeonSoloFirsts(pl))
            .catch(err => {
              console.warn('[LoadCharacterHistory/Firsts] Skipped due to error for', pl.membershipId, err);
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
        await this.loadAllFilteredActivities();
      }
      await this.calculateAccountStats();
    } catch (error) {
      this.selectedPlayers = [];
      delete this.selectedCharacterIds[player.membershipId];
      throw error;
    } finally {
      this.loadingActivities[this.selectedDate] = false;
      this.cdr.detectChanges();
    }
  }

  async loadCharacterHistory(player: PlayerSearchResult | PlayerSearchDisplay) {
    console.log('loadCharacterHistory called', { player });
    const key = `characters-${player.membershipId}`;
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
        this.characters[player.membershipId] = profile.Response.data?.characters || [];
        // Set the first character as selected if we have characters
        if (this.characters[player.membershipId].length > 0) {
          // D1: characterBase.characterId
          this.selectedCharacterIds[player.membershipId] = getCharacterId(this.characters[player.membershipId][0]) || '';
        }
        for (const char of this.characters[player.membershipId]) {
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
        this.characters[player.membershipId] = characters;
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
      
      return {
        promise: firstValueFrom(this.bungieService.getPGCR(
          instanceId,
          character.game === 'D1'
        )),
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
            this.bungieService.getActivityHistory(
              character.membershipType,
              character.membershipId,
              character.characterId,
              page,
              character.mode
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
      this.calculateAccountStats();
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
      
      // Fetch activities for all relevant modes
      const modes = [
        0,   // None (PvE)
        1,   // Story
        2,   // Strike
        3,   // Raid
        4,   // AllPvP
        5,   // Patrol
        6,   // AllPvE
        7,   // Reserved7
        8,   // Reserved8
        9,   // Reserved9
        10,  // Control
        12,  // Clash
        15,  // Iron Banner
        16,  // Nightfall
        17,  // PrestigeNightfall
        18,  // AllStrikes
        19,  // TrialsOfOsiris
        22,  // Survival
        24,  // Rumble
        25,  // AllMayhem
        31,  // Supremacy
        32,  // PrivateMatchesAll
        37,  // Survival
        38,  // Countdown
        39,  // TrialsOfTheNine
        40,  // Breakthrough
        41,  // Doubles
        42,  // PrivateMatchesClash
        43,  // PrivateMatchesControl
        44,  // PrivateMatchesSupremacy
        45,  // Gambit
        46,  // AllPvECompetitive
        48,  // Showdown
        49,  // Lockdown
        50,  // Momentum
        51,  // CountdownClassic
        52,  // Elimination
        53   // Rift
      ];

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
          }

          // Emit progress before heavy processing so user sees immediate feedback
          this.updateLoadingProgress(
            character.characterId,
            ((page + 1) / (page + 2)) * 100
          );
          
          page++;
        }
      }

      this.processAndGroupActivities();
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
    characterId: string,
    progress: number
  ): void {
    this.loadingProgress = {
      characterId,
      progress,
      message: `Processed ${this.overallActivitiesProcessed} activities...`
    };
    this.cdr.detectChanges();
  }

  private async processAndGroupActivities(): Promise<void> {
    if (!this.filteredActivitiesForDate.length) {
      this.groupedActivitiesByAccount = [];
      this.firstEverActivity = undefined;
      this.cdr.detectChanges();
      await this.setFirstEverActivityFromDb();
      this.debugLogEarliestActivity();
      return;
    }
    const accountGroups = new Map<string, AccountGroup>();
    for (const activity of this.filteredActivitiesForDate) {
      const accountKey = activity.membershipId;
      if (!accountGroups.has(accountKey)) {
        accountGroups.set(accountKey, {
          displayName: activity.displayName,
          platform: activity.platform,
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
    }

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

  public async loadAllFilteredActivities() {
    const loadToken = ++this.currentLoadToken;
    this.loadingActivities[this.selectedDate] = true;
    this.cdr.detectChanges();

    try {
      const activities = await this.getAllFilteredActivitiesForDate();
      if (loadToken !== this.currentLoadToken) return; // Abort if a newer load started

      // Ensure Destiny manifest has finished loading so that activity names/types resolve properly
      if (!this.manifest.isLoadedSync) {
        await this.manifest.isLoaded().toPromise();
      }

      this.processAndGroupActivities();
      this.updateActivityDisplay();
      // Recalculate account-level statistics now that filtered activities are available
      await this.calculateAccountStats();
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
        const charIds = (this.characters[player.membershipId] || [])
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
        const charIds = (this.characters[player.membershipId] || [])
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
        totalTime += this.wastedTimes[pl.membershipId] || 0;
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
        totalSeals += this.wastedSeals[pl.membershipId] || 0;
      }

      // Build per-platform stats
      const platformStatsMap: { [platform: string]: PlatformStats } = {};
      for (const pl of this.selectedPlayers) {
        const platformName = pl.platform;
        const time = this.wastedTimes[pl.membershipId] || 0;
        const seals = this.wastedSeals[pl.membershipId] || 0;
        const acts = await this.activityDb.countActivitiesForMemberships([pl.membershipId]);

        if (!platformStatsMap[platformName]) {
          platformStatsMap[platformName] = { platform: platformName, totalTime: 0, totalActivities: 0, totalSeals: 0 };
        }
        const s = platformStatsMap[platformName];
        s.totalTime += time;
        s.totalActivities += acts;
        s.totalSeals += seals;
      }
      this.perPlatformStats = Object.values(platformStatsMap);

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
      this.loadingAccountStats = false;
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
    this.selectedMonth = parseInt(month);
    this.selectedDay = parseInt(day);
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
    if (!this.searchUsername || !this.selectedGame) {
      this.errorMessage = 'Please enter a username and select a game.';
      return;
    }

    this.errorMessage = '';
    this.loading['search'] = true;
    try {
      if (this.selectedGame === 'D2') {
        await this.searchD2Player(this.searchUsername);
      } else {
        // For D1, we need to know which platform to search
        if (!this.selectedPlatform) {
          this.errorMessage = 'Please select a platform for Destiny 1.';
          this.loading['search'] = false;
          this.cdr.detectChanges();
          return;
        }
        // Map platform string to BungieMembershipType for D1
        let membershipType = 0;
        switch (this.selectedPlatform) {
          case 'Xbox': membershipType = 1; break;
          case 'PlayStation': membershipType = 2; break;
          default: membershipType = 0;
        }
        await this.searchD1Player(this.searchUsername, membershipType);
      }
    } catch (error: any) {
      this.errorMessage = 'Error searching for player.';
      console.error(error);
    } finally {
      this.loading['search'] = false;
      this.cdr.detectChanges();
    }
  }

  removePlayer(index: number) {
    this.selectedPlayers.splice(index, 1);
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
  private async getAllFilteredActivitiesForDate(): Promise<ActivityWithMembership[]> {
    if (!this.selectedDate) {
      return [];
    }

    // Check filtered activities cache first
    const cacheKey = `filtered-${this.selectedDate}-${this.selectedActivityType.label}`;
    const cachedFiltered = this.filteredActivitiesCache.get(cacheKey);
    if (cachedFiltered) {
      console.log('[DEBUG] Using cached filtered activities for date:', this.selectedDate);
      return cachedFiltered;
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
        const charIds = (this.characters[player.membershipId] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);
        console.log('[DEBUG][D1] Found character IDs:', { 
          player: player.displayName, 
          charIds,
          characters: this.characters[player.membershipId]
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

      if (player.game === 'D1') {
        console.log(`[DEBUG][D1] All filtered D1 activities before grouping for ${player.displayName}:`, {
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

    // Cache the filtered activities
    this.filteredActivitiesCache.set(cacheKey, dedupedActivities);
    
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
      const charIds = (this.characters[player.membershipId] || [])
        .map(getCharacterId)
        .filter((id): id is string => !!id);
      const allFirsts: ActivityFirstCompletion[] = [];
      for (const characterId of charIds) {
        const firsts = await this.activityDb.getFirstCompletions(player.membershipId, characterId, player.game);
        allFirsts.push(...firsts.firstCompletions);
      }
      const sorted = allFirsts.sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime());
      // store per-player list
      this.guardianFirstsMap[player.membershipId] = sorted;
      // recompute aggregate list (dedup by name + game + type)
      const aggregate: ActivityFirstCompletion[] = [];
      const seen = new Set<string>();
      Object.values(this.guardianFirstsMap).forEach(list => {
        for (const f of list) {
          const key = `${f.game}|${f.type}|${f.name}`;
          if (!seen.has(key)) {
            seen.add(key);
            aggregate.push(f);
          }
        }
      });
      this.aggregateGuardianFirsts = aggregate.sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime());
      // Default existing property points to aggregate so legacy helpers keep working
      this.guardianFirsts = this.aggregateGuardianFirsts;
      // Compute first-ever activity for this specific player once firsts are loaded
      this.firstEverActivities[player.membershipId] = await this.computeFirstEverActivityForPlayer(player);
    } catch (error) {
      console.error('[Firsts] Error loading guardian firsts:', error);
      this.guardianFirstsMap[player.membershipId] = [];
      this.aggregateGuardianFirsts = [];
      this.guardianFirsts = [];
      this.firstEverActivities[player.membershipId] = undefined;
    } finally {
      this.loadingGuardianFirsts = false;
      this.updatePlatformTabs();
      this.cdr.detectChanges();
    }
  }

  /** Per-player helper variants (platform-specific) */
  private getFirstsForPlayer(player: PlayerSearchDisplay): ActivityFirstCompletion[] {
    return this.guardianFirstsMap[player.membershipId] || [];
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

    const charIds = (this.characters[player.membershipId] || [])
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
    const charIds = (this.characters[player.membershipId] || [])
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
    const charIds = (this.characters[player.membershipId] || [])
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

  async onTabChange(tab: 'activities' | 'firsts' | 'titles') {
    this.activeTab = tab;
    if (tab === 'titles' && this.selectedPlayers.length > 0) {
      this.loadingTitlesOverall = true;
      for (const player of this.selectedPlayers) {
        if (!this.playerTitles[player.membershipId]) {
          this.loadingTitles[player.membershipId] = true;
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
                };
              }
            }
            // Split into completed and locked, then sort
            const allTitles = Object.values(titleMap);
            const completed = allTitles.filter(t => t.completed).sort((a, b) => a.name.localeCompare(b.name));
            const locked = allTitles.filter(t => !t.completed).sort((a, b) => a.name.localeCompare(b.name));
            this.playerTitles[player.membershipId] = [...completed, ...locked];
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
            this.playerTitles[player.membershipId] = { current: [], legacy: [] };
          } finally {
            this.loadingTitles[player.membershipId] = false;
            this.cdr.markForCheck();
          }
        }
      }
      // After fetching titles for all players, create aggregatedTitles based on main/cross-save account.
      const mainPlayer = this.selectedPlayers.find(p => p.isPrimary) || this.crossSavePlayer || this.selectedPlayers[0];
      const mainList = this.playerTitles[mainPlayer.membershipId] || [];

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

      // Merge in completions from linked accounts (only if the title is completed on that account)
      for (const p of this.selectedPlayers) {
        if (p.membershipId === mainPlayer.membershipId) continue;
        const list = this.playerTitles[p.membershipId] || [];
        for (const t of list as any[]) {
          if (!t.completed) continue; // only completed titles contribute holders
          const existing = aggMap.get(t.hash);
          if (existing) {
            addHolder(existing, { displayName: p.displayName, platform: p.platform });
          }
        }
      }

      this.aggregatedTitles = Array.from(aggMap.values()).sort((a,b)=>a.name.localeCompare(b.name));
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
    const id = player.membershipId;
    if (this.wastedTimes[id] !== undefined) return; // already fetched
    try {
      const response = await firstValueFrom(this.wastedService.getProfile(id));
      let seconds = 0;
      let sealCount = 0;
      // Attempt common response shapes
      if (response?.data?.characters) {
        const chars = Object.values(response.data.characters) as any[];
        for (const ch of chars) {
          if (typeof ch.timePlayedSeconds === 'number') seconds += ch.timePlayedSeconds;
          else if (typeof ch.minutesPlayed === 'number') seconds += ch.minutesPlayed * 60;
          else if (typeof ch.minutesPlayedTotal === 'number') seconds += ch.minutesPlayedTotal * 60;
        }
      }
      if (!seconds && typeof response?.timePlayed === 'number') {
        seconds = response.timePlayed;
      }
      // Fallback to Bungie profile if API didn't give anything usable
      if (!seconds) {
        try {
          const bungieProfile = await firstValueFrom(this.bungieService.getProfile(player.membershipType, id));
          const charsData = Object.values(bungieProfile?.Response?.characters?.data || {}) as any[];
          for (const ch of charsData) {
            if (ch.minutesPlayedTotal) seconds += Number(ch.minutesPlayedTotal) * 60;
          }
        } catch (e) {
          console.warn('[loadWastedTime] Bungie fallback failed', e);
        }
      }
      // Try activity count fields that WoD returns
      if (typeof response?.seals === 'number') {
        sealCount = response.seals;
      }

      this.wastedTimes[id] = seconds;
      this.wastedSeals[id] = sealCount;
    } catch (err) {
      console.warn('[loadWastedTime] Failed for', id, err);
      this.wastedTimes[id] = 0;
    } finally {
      // Recompute stats now that we may have new data
      this.calculateAccountStats();
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
    return this.firstEverActivities[player.membershipId];
  }

  /** Compute first-ever activity per player */
  private async computeFirstEverActivityForPlayer(player: PlayerSearchDisplay): Promise<ActivityHistory | undefined> {
    const charIds = (this.characters[player.membershipId] || [])
      .map(getCharacterId)
      .filter((id): id is string => !!id);

    let allActivities: ActivityHistory[] = [];
    for (const charId of charIds) {
      const activities = await this.activityDb.getAllActivitiesForCharacter(player.membershipId, charId);
      allActivities = allActivities.concat(activities);
    }
    const now = new Date();
    const valid = allActivities.filter(a => new Date(a.period) <= now);
    if (valid.length === 0) return undefined;
    return valid.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())[0];
  }

  /** Called on every keystroke in the username box */
  onSearchInput(value: string): void {
    this.searchTerm$.next(value);
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
}