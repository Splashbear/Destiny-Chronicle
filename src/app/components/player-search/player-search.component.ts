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
import { ArchiveService } from '../../services/archive.service';
import { ArchiveRuntimeService } from '../../services/archive-runtime.service';
import { AssetUrlService } from '../../services/asset-url.service';
import { ArchiveAccount } from '../../models/archive.types';

import { ActivityHistory, Character } from '../../models/activity-history.model';
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption, ActivityMode, ACTIVITY_MODE_MAP } from '../../models/activity-types';
import { ActivityDbService, StoredActivity, FavoriteAccount } from '../../services/activity-db.service';
import { FirstActivityService } from '../../services/first-activity.service';
import { BehaviorSubject, Observable, of, Subject, debounceTime, from } from 'rxjs';
import { map, shareReplay, switchMap, catchError, distinctUntilChanged, exhaustMap } from 'rxjs/operators';
import { TimezoneService } from '../../services/timezone.service';
import { ActivityIconService } from '../../services/activity-icon.service';
import { ActivityFirstCompletion, GuardianFirsts, RAID_NAMES } from '../../models/guardian-firsts.model';
import { getStoryAnchorSortOrder } from '../../config/story-first-missions';
import {
  PantheonEventId,
  getPantheonConfig,
  isLegacyPantheonActivity,
  isMotPantheonActivity,
  isAnyPantheonActivity,
  LEGACY_PANTHEON_CONFIG,
  MOT_PANTHEON_CONFIG
} from '../../config/pantheon.config';
import { DatePickerComponent } from '../date-picker/date-picker.component';
import { PlayerSearchActivitiesTabComponent } from './player-search-activities-tab.component';
import { PlayerSearchBreakdownTabComponent } from './player-search-breakdown-tab.component';
import { PlayerSearchFirstsTabComponent } from './player-search-firsts-tab.component';
import { PlayerSearchTitlesTabComponent } from './player-search-titles-tab.component';
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
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { ActivityBreakdownService, ActivityCountRow } from '../../services/activity-breakdown.service';
import { SeasonService } from '../../services/season.service';
import { PGCRModalService } from '../../services/pgcr-modal.service';
import { pgcrPeriodMatches, pgcrPeriodMatchesForD1, resolvePgcrPeriod } from '../../utils/pgcr-prune';
import { UiI18nService } from '../../services/ui-i18n.service';
import { LocaleService } from '../../services/locale.service';
// Chart.js imports – load only what we use (pie + bar)
import {
  Chart as ChartJS,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  Tooltip,
  Legend,
  type ChartConfiguration,
  type ChartData,
  type ChartType
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
ChartJS.register(
  PieController,
  BarController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

const HIDE_GET_STARTED_KEY = 'destiny-chronicle-hide-get-started';
const ACTIVITY_COLLAPSE_GAMES_KEY = 'destiny-chronicle-collapsed-activity-games';
const ACTIVITY_COLLAPSE_YEARS_KEY = 'destiny-chronicle-collapsed-activity-years';
const ACTIVITIES_VIEW_MODE_KEY = 'destinyChronicle.activitiesViewMode';
const ACTIVITIES_CHRON_SORT_KEY = 'destinyChronicle.activitiesChronSort';

export type ActivitiesViewMode = 'cards' | 'chronological';
export type ActivitiesChronologicalSort = 'oldest' | 'newest';

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

interface ChronologicalActivityRow {
  activity: ActivityWithMembership;
  activityName: string;
  activityType: string;
  version: string;
  isD1: boolean;
  game: 'D1' | 'D2';
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
  iconPath?: string;
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



/**
 * Bungie D1 Account Summary often returns `characters` as an object map (like D2), not an array.
 * Normalizing avoids `.map is not a function` and ensures we iterate every character for sync/firsts.
 */
function normalizeD1ProfileCharacters(raw: unknown): any[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    return Object.values(raw as object);
  }
  return [];
}

// Utility function to extract characterId for both D1 and D2 character objects
// D1: character.characterBase.characterId
// D2: character.characterId
// Always return string — D1 ids are 64-bit; never rely on JSON number precision.
function getCharacterId(char: any): string | undefined {
  const raw = char?.characterId ?? char?.characterBase?.characterId;
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  return String(raw);
}

// Helper: minutes played per character, handling D1 vs D2 profile shapes.
function getCharacterMinutesPlayed(char: any, game: 'D1' | 'D2'): number {
  if (!char) return 0;
  if (game === 'D1') {
    const base = char.characterBase || char;
    const raw = Number(base?.minutesPlayedTotal ?? base?.minutesPlayed ?? 0);
    return isNaN(raw) ? 0 : raw;
  }
  const raw = Number(char.minutesPlayedTotal ?? char.minutesPlayed ?? 0);
  return isNaN(raw) ? 0 : raw;
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

// Explicit release order mapping (higher = newer).
// IMPORTANT: keys are normalized via normalizeTitleName(). We keep a readable
// raw list and normalize it once so lookups match `normalizedName`.
// Organized chronologically by release date from Google Sheet, with same-date titles alphabetized.
const RELEASE_ORDER_RAW: { [name: string]: number } = {
  // Rank 1: 9/4/2018 - Forsaken launch (alphabetical: chronicler, cursebreaker, dredgen, rivensbane, wayfarer)
  'chronicler': 1,
  'cursebreaker': 1,
  'dredgen': 1,
  'rivensbane': 1,
  'wayfarer': 1,
  
  // Rank 2: 12/7/2018 - Black Armory
  'blacksmith': 2,
  
  // Rank 3: 3/5/2019 - Season of the Drifter
  'reckoner': 3,
  
  // Rank 4: 6/4/2019 - Season of Opulence
  'shadow': 4,
  
  // Rank 5: 7/9/2019 - Moments of Triumph 2019
  'mmxix mot': 5,
  'mmxix': 5, // Alternative format without "MoT"
  
  // Rank 6: 10/1/2019 - Shadowkeep launch
  'undying': 6,
  
  // Rank 7: 10/5/2019 - Season of Opulence
  'enlightened': 7,
  
  // Rank 8: 10/29/2019 - Season of the Undying
  'harbinger': 8,
  
  // Rank 9: 12/10/2019 - Season of Dawn
  'savior': 9,
  
  // Rank 10: 3/10/2020 - Season of the Worthy (alphabetical: almighty, conqueror)
  'almighty': 10,
  'conqueror': 10,
  
  // Rank 11: 6/9/2020 - Season of Arrivals
  'forerunner': 11,
  
  // Rank 12: 7/7/2020 - Moments of Triumph 2020
  'mmxx mot': 12,
  'mmxx': 12, // Alternative format without "MoT"
  
  // Rank 13: 11/10/2020 - Beyond Light launch (alphabetical: splintered, warden)
  'splintered': 13,
  'warden': 13,
  
  // Rank 14: 11/21/2020 - Season of the Hunt
  'descendant': 14,
  
  // Rank 15: 2/9/2021 - Season of the Chosen
  'chosen': 15,
  
  // Rank 16: 5/11/2021 - Season of the Splicer
  'splicer': 16,
  
  // Rank 17: 5/22/2021 - Season of the Splicer
  'fatebreaker': 17,
  
  // Rank 18: 8/24/2021 - Season of the Lost (alphabetical: deadeye, realmwalker)
  'deadeye': 18,
  'realmwalker': 18,
  
  // Rank 19: 12/7/2021 - Moments of Triumph 2021 (alphabetical: mmxxi mot, vidmaster)
  'mmxxi mot': 19,
  'mmxxi': 19, // Alternative format without "MoT"
  'vidmaster': 19,
  
  // Rank 20: 2/22/2022 - The Witch Queen launch (alphabetical: disciple-slayer, gumshoe, risen)
  'disciple-slayer': 20,
  'gumshoe': 20,
  'risen': 20,
  
  // Rank 21: 5/24/2022 - Season of the Haunted (alphabetical: iron lord, reaper)
  'iron lord': 21,
  'reaper': 21,
  
  // Rank 22: 5/27/2022 - Season of the Haunted
  'discerptor': 22,
  
  // Rank 23: 7/19/2022 - Season of the Haunted
  'reveler': 23,
  
  // Rank 24: 7/20/2022 - Season of the Haunted
  'flamekeeper': 24,
  
  // Rank 25: 8/23/2022 - Season of Plunder
  'scallywag': 25,
  
  // Rank 26: 8/26/2022 - Season of Plunder
  'kingslayer': 26,
  
  // Rank 27: 9/1/2023 - Season of the Witch
  'swordbearer': 27,
  
  // Rank 28: 10/18/2022 - Season of the Seraph
  'ghost writer': 28,
  
  // Rank 29: 12/6/2022 - Season of the Seraph (alphabetical: glorious, mmxxii mot, seraph)
  'glorious': 29,
  'mmxxii mot': 29,
  'mmxxii': 29, // Alternative format without "MoT"
  'seraph': 29,
  
  // Rank 30: 12/9/2022 - Season of the Seraph
  'wanted': 30,
  
  // Rank 31: 12/13/2022 - Season of the Seraph
  'star baker': 31,
  
  // Rank 32: 2/8/2023 - Lightfall launch (alphabetical: queensguard, virtual fighter)
  'queensguard': 32,
  'virtual fighter': 32,
  
  // Rank 33: 3/10/2023 - Season of Defiance
  'dream warrior': 33,
  
  // Rank 34: 5/2/2023 - Season of the Deep
  'champ': 34,
  
  // Rank 35: 5/23/2023 - Season of the Deep
  'aquanaut': 35,
  
  // Rank 36: 5/26/2023 - Season of the Deep
  'ghoul': 36,
  
  // Rank 37: 8/22/2023 - Season of the Witch
  'haruspex': 37,
  
  // Rank 38: 11/28/2023 - Season of the Wish
  'wishbearer': 38,
  
  // Rank 39: 12/1/2023 - Season of the Wish
  'wrathbearer': 39,
  
  // Rank 40: 1/30/2024 - Moments of Triumph 2023
  'mmxxiii mot': 40,
  'mmxxiii': 40, // Alternative format without "MoT"
  
  // Rank 41: 4/9/2024 - The Final Shape launch
  'brave': 41,
  
  // Rank 42: 4/30/2024 - The Final Shape
  'godslayer': 42,
  
  // Rank 43: 6/4/2024 - The Final Shape (alphabetical: intrepid, transcendent)
  'intrepid': 43,
  'transcendent': 43,
  
  // Rank 44: 6/7/2024 - The Final Shape
  'iconoclast': 44,
  
  // Rank 45: 9/9/2024 - The Final Shape
  'legend': 45,
  
  // Rank 46: 10/8/2024 - Post-Final Shape
  'slayer baron': 46,
  
  // Rank 47: 10/11/2024 - Post-Final Shape
  'unleashed': 47,
  
  // Rank 48: 2/4/2025 - Post-Final Shape
  'heretic': 48,
  
  // Rank 49: 2/7/2025 - Post-Final Shape
  'delver': 49,
  
  // Rank 50: 3/4/2025 - Moments of Triumph 2024
  'mmxxiv mot': 50,
  'mmxxiv': 50, // Alternative format without "MoT"
  
  // Rank 51: 5/6/2025 - Post-Final Shape
  'eternal': 51,
  
  // Rank 52: 5/9/2025 - Post-Final Shape
  'heavy metal': 52,
  
  // Rank 53: 7/15/2025 - Post-Final Shape
  'fated weapon': 53,
  
  // Rank 54: 7/19/2025 - Post-Final Shape
  'atemporal': 54,
  
  // Rank 55: 7/29/2025 - Post-Final Shape
  'sharpshooter': 55,
  
  // Rank 56: 11/11/2025 - Post-Final Shape
  'avant garde': 56,
  
  // Rank 57: 12/2/2025 - Post-Final Shape (alphabetical: renegade, undertaker)
  'renegade': 57,
  'undertaker': 57,
  
  // Rank 58: 12/13/2025 - Most recent
  'praxic': 58,
};

const RELEASE_ORDER: { [normalized: string]: number } = Object.fromEntries(
  Object.entries(RELEASE_ORDER_RAW).map(([k, v]) => [normalizeTitleName(k), v])
);

// Aggregated statistics per platform (e.g., Xbox, PlayStation, Steam)
interface PlatformStats {
  accountKey: string;   // unique key for filtering: game-platform-membershipId
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
    ExportOptionsDialogComponent,
    DatePickerComponent,
    PlayerSearchActivitiesTabComponent,
    PlayerSearchBreakdownTabComponent,
    PlayerSearchFirstsTabComponent,
    PlayerSearchTitlesTabComponent
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
  searchChips: string[] = [];
  // Removed selectedPlatform - no longer needed without game picker
  // Removed selectedGame - now searches both D1 and D2 automatically
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
  private processedActivities: any[] = [];
  loadingProgress: LoadingProgress | null = null;
  /** True when user returns to tab after it was hidden during loading; show explanatory message. */
  showBackgroundLoadingTip = false;
  /** Page Visibility: we were loading when the tab went hidden (so we can show tip on return). */
  private wasLoadingWhileTabHidden = false;
  private visibilityChangeHandler = () => this.onVisibilityChange();
  /** Running total of activity reports fetched per account (accountKey -> count). Updated as API returns pages; "Done!" when account fetch completes. */
  private activityCountByAccount = new Map<string, number>();
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

  /** Offline archive export/import UI */
  archiveExporting = false;
  archiveProgressMessage = '';
  archiveProgressPercent = 0;
  showArchiveBackupOptions = false;
  showOfflineDeviceReady = false;
  dismissOfflineDeviceReady = false;

  get isOfflineArchiveMode(): boolean {
    return this.archiveRuntime.isOfflineMode;
  }

  get isArchiveSyncing(): boolean {
    return this.archiveRuntime.isOnlineSyncSession;
  }

  get showInstallAppHint(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    return !standalone && (this.showOfflineDeviceReady || this.isOfflineArchiveMode);
  }

  get offlineFrozenLabel(): string | null {
    return this.archiveRuntime.frozenAtLabel;
  }

  /** Sync month/day from the picker only; user clicks Search Date to load activities. */
  onDatePickerChange(dateInfo: {month: number, day: number}) {
    const newMonth = Number(dateInfo.month);
    let newDay = Number(dateInfo.day);
    if (!newMonth || !newDay) {
      return;
    }
    const daysInMonth = new Date(2000, newMonth, 0).getDate();
    newDay = Math.min(newDay, daysInMonth);
    this.selectedMonth = newMonth;
    this.selectedDay = newDay;
    this.cdr.markForCheck();
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
  activeTab: 'activities' | 'firsts' | 'titles' | 'breakdown' = 'activities';
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
  /** True when user has selected one or more account cards on the Breakdown tab. */
  get hasBreakdownAccountFilter(): boolean {
    return this.selectedAccountKeysForBreakdown.size > 0;
  }
  /** Whether the Breakdown game dropdown should be shown (hidden when selection is single-game only). */
  get showBreakdownGameDropdown(): boolean {
    const games = this.getBreakdownSelectedGames();
    // No selection or multi-game selection → keep dropdown visible
    if (games.length === 0 || games.length > 1) return true;
    // Exactly one game across selected accounts → dropdown is redundant
    return false;
  }
  /** Chart category: 'all' = by activity type, or category name (e.g. 'Raid', 'Dungeon') for drill-down by activity name */
  breakdownChartCategory = 'all';
  /** Chart game filter: 'all' = D1+D2, 'D1' or 'D2' to limit */
  breakdownChartGame = 'all';

  // Chart configuration for Activity Breakdown
  breakdownChartType: ChartType = 'pie';
  /** Cached chart data to avoid recomputing on every change-detection tick. */
  private breakdownChartDataState: ChartData<'pie' | 'bar'> = { labels: [], datasets: [] };
  breakdownChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { top: 8, right: 8, bottom: 8, left: 8 }
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        align: 'start',
        labels: {
          color: '#e2e8f0',
          font: { size: 12 },
          padding: 10,
          boxWidth: 14,
          usePointStyle: true,
          pointStyle: 'circle',
          textAlign: 'left'
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a: any, b: any) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${this.formatSecondsToHoursMinutes(value)} (${percentage}%)`;
          }
        }
      }
    }
  };

  breakdownBarChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `${this.formatSecondsToHoursMinutes(context.parsed.x)}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#e2e8f0',
          callback: (value) => {
            return this.formatSecondsToHoursMinutes(value as number);
          }
        },
        grid: { color: '#334155' }
      },
      y: {
        ticks: { color: '#e2e8f0' },
        grid: { color: '#334155' }
      }
    }
  };

  /** Display names for chart category dropdown (combines service groupings: Gambit, Nightfall, PvP, Seasonal Arenas, etc.) */
  private readonly categoryDisplayNames: Record<string, string> = {
    'Story': 'Story missions',
    'Raid': 'Raids',
    'Dungeon': 'Dungeons',
    'Strike': 'Strikes',
    'Patrol': 'Patrol',
    'Nightfall': 'Nightfall',
    'Gambit': 'Gambit',
    'PvP': 'PvP',
    'Seasonal Arena': 'Seasonal Arenas',
    'Seasonal Arenas': 'Seasonal Arenas',
    'Prison of Elders': 'Prison of Elders',
    'Renegade Activities': 'Renegade Activities',
    'Vehicle PVP': 'Vehicle PVP',
    'D1 Crucible': 'D1 Crucible',
    'Sparrow Racing League': 'Sparrow Racing League',
    'Battlegrounds': 'Battlegrounds',
    'Story Strikes': 'Story Strikes',
    'Exotic Story Missions': 'Exotic Story Missions',
    'LostSector': 'Lost Sectors',
    'Relic': 'Relic'
  };

  /** Category options: All, or each unique category (Raid, Dungeon, Strike, etc.) */
  get breakdownChartCategoryOptions(): { value: string; label: string }[] {
    const base = [{ value: 'all', label: 'All activity types' }];
    const groups = this.filteredActivityBreakdownGroups;
    if (!groups?.length) return base;
    const seen = new Set<string>();
    for (const g of groups) {
      const cat = this.getBreakdownCategoryFromLabel(g.label) || g.label;
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        const displayLabel = this.categoryDisplayNames[cat] ?? (cat.endsWith('s') ? cat : cat + 's');
        base.push({ value: cat, label: displayLabel });
      }
    }
    return base;
  }

  /** Game filter options */
  readonly breakdownChartGameOptions: { value: 'all' | 'D1' | 'D2'; label: string }[] = [
    { value: 'all', label: 'All (D1 + D2)' },
    { value: 'D1', label: 'Destiny 1' },
    { value: 'D2', label: 'Destiny 2' }
  ];

  /** Chart data input for the template – returns cached value. */
  get breakdownChartData(): ChartData<'pie' | 'bar'> {
    return this.breakdownChartDataState;
  }

  /** Normalize group label to category (e.g. "Raid – D1" → "Raid") for chart filtering. Handles en-dash, hyphen, and spacing. */
  private getBreakdownCategoryFromLabel(label: string): string {
    if (!label) return '';
    const parts = label.split(/\s*[–-]\s*/);
    return (parts[0] ?? label).trim();
  }

  /** Recompute chart data based on current breakdown groups, filters, and chart type. */
  private recomputeBreakdownChartData(): void {
    const groups = this.filteredActivityBreakdownGroups;
    const hasTileSelection = this.selectedBreakdownCardLabels.size > 0;

    // When tiles are selected, always show drill-down (individual activities) even if chart dropdown is "All"
    if (hasTileSelection && groups.length > 0) {
      const allRows: ActivityCountRow[] = [];
      for (const g of groups) allRows.push(...g.rows);
      if (!allRows.length) {
        this.breakdownChartDataState = { labels: [], datasets: [] };
        return;
      }
      const items = allRows.map(r => ({
        label: r.variantName ? `${r.baseName} (${r.variantName})` : r.baseName,
        timeSeconds: r.timeSeconds
      }));
      this.breakdownChartDataState = this.buildChartDataFromItems(items);
      return;
    }

    // When "All" and no tiles selected: show summary (each group as a slice), respecting game filter
    if (this.breakdownChartCategory === 'all') {
      let cards = this.filteredActivityBreakdownSummaryCards;
      if (this.breakdownChartGame !== 'all') {
        const gameSuffix = ' – ' + this.breakdownChartGame;
        const gameSuffixAlt = ' - ' + this.breakdownChartGame;
        cards = cards.filter(c => c.label.endsWith(gameSuffix) || c.label.endsWith(gameSuffixAlt));
      }
      this.breakdownChartDataState = cards.length ? this.buildChartDataFromCards(cards) : { labels: [], datasets: [] };
      return;
    }

    // When specific category selected in dropdown: drill-down to individual activities in that category
    const matchingGroups = this.filteredActivityBreakdownGroups.filter(g => {
      const cat = this.getBreakdownCategoryFromLabel(g.label);
      if (cat !== this.breakdownChartCategory) return false;
      if (this.breakdownChartGame === 'all') return true;
      return g.game === this.breakdownChartGame;
    });

    const allRows: ActivityCountRow[] = [];
    for (const g of matchingGroups) allRows.push(...g.rows);

    if (!allRows.length) {
      this.breakdownChartDataState = { labels: [], datasets: [] };
      return;
    }

    const items = allRows.map(r => ({
      label: r.variantName ? `${r.baseName} (${r.variantName})` : r.baseName,
      timeSeconds: r.timeSeconds
    }));
    this.breakdownChartDataState = this.buildChartDataFromItems(items);
  }

  private buildChartDataFromCards(cards: { label: string; timeSeconds: number }[]): ChartData<'pie' | 'bar'> {
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#0ea5e9'];
    if (this.breakdownChartType === 'pie') {
      return {
        labels: cards.map(c => c.label),
        datasets: [{ data: cards.map(c => c.timeSeconds), backgroundColor: colors }]
      };
    }
    const sorted = [...cards].sort((a, b) => b.timeSeconds - a.timeSeconds).slice(0, 30);
    return {
      labels: sorted.map(c => c.label),
      datasets: [{ label: 'Time Spent', data: sorted.map(c => c.timeSeconds), backgroundColor: '#10b981' }]
    };
  }

  private buildChartDataFromItems(items: { label: string; timeSeconds: number }[]): ChartData<'pie' | 'bar'> {
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#0ea5e9'];
    const sorted = [...items].sort((a, b) => b.timeSeconds - a.timeSeconds);
    if (this.breakdownChartType === 'pie') {
      return {
        labels: sorted.map(i => i.label),
        datasets: [{ data: sorted.map(i => i.timeSeconds), backgroundColor: colors }]
      };
    }
    const top = sorted.slice(0, 30);
    return {
      labels: top.map(i => i.label),
      datasets: [{ label: 'Time Spent', data: top.map(i => i.timeSeconds), backgroundColor: '#10b981' }]
    };
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

  /** Set chart category and trigger change detection */
  setBreakdownChartCategory(value: string) {
    this.breakdownChartCategory = value;
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
    // Filtered view: sum of selected cards only
    if (this.selectedBreakdownCardLabels.size > 0) {
      const cards = this.activityBreakdownSummaryCards.filter(c =>
        this.selectedBreakdownCardLabels.has(c.label)
      );
      if (!cards?.length) return 0;
      return cards.reduce((sum, c) => sum + (c.timeSeconds ?? 0), 0);
    }

    // Unfiltered view: sum across all cards
    const cards = this.activityBreakdownSummaryCards;
    if (!cards?.length) return 0;
    return cards.reduce((sum, c) => sum + (c.timeSeconds ?? 0), 0);
  }

  /** Total playtime in seconds for the current Breakdown view, from profile data. */
  private getBreakdownProfileTotalTimeSeconds(): number {
    // Prefer per-platform stats when available
    if (this.perPlatformStats && this.perPlatformStats.length) {
      if (!this.hasBreakdownAccountFilter) {
        return this.perPlatformStats.reduce(
          (sum, s) => sum + (s.totalTime ?? 0),
          0
        );
      }
      return this.perPlatformStats
        .filter(s => this.selectedAccountKeysForBreakdown.has(s.accountKey))
        .reduce((sum, s) => sum + (s.totalTime ?? 0), 0);
    }

    // Fallback: use overall accountStats when perPlatformStats is not yet populated
    return this.accountStats?.totalTime ?? 0;
  }

  /** Debug helper: log where Breakdown total time is coming from. */
  private logBreakdownDebug(context: string): void {
    try {
      const headerSeconds = this.activityBreakdownTotalTimeSeconds;
      const headerFormatted = this.formatSecondsToHoursMinutes(headerSeconds);

      const cardTotalSeconds = this.activityBreakdownSummaryCards.reduce(
        (sum, c) => sum + (c.timeSeconds ?? 0),
        0
      );
      const cardTotalFormatted = this.formatSecondsToHoursMinutes(cardTotalSeconds);

      const profileSeconds = this.getBreakdownProfileTotalTimeSeconds();
      const profileFormatted = this.formatSecondsToHoursMinutes(profileSeconds);

      const perPlatformDebug = (this.perPlatformStats || []).map(s => ({
        platform: s.platform,
        game: s.game,
        hours: (s.totalTime ?? 0) / 3600
      }));

      // eslint-disable-next-line no-console
      console.log('[BreakdownDebug]', {
        context,
        activeBreakdownTab: this.hasBreakdownAccountFilter ? 'filtered' : 'all',
        headerSeconds,
        headerFormatted,
        cardTotalSeconds,
        cardTotalFormatted,
        profileSeconds,
        profileFormatted,
        accountStatsTotalSeconds: this.accountStats?.totalTime ?? 0,
        perPlatform: perPlatformDebug
      });
    } catch (err) {
      console.warn('[BreakdownDebug] Failed to log breakdown debug info', err);
    }
  }

  /** Total time in seconds for the selected date (from filteredActivitiesForDate). When account cards are selected, only sums time for those accounts. */
  get totalTimeForSelectedDate(): number {
    if (!this.filteredActivitiesForDate || this.filteredActivitiesForDate.length === 0) return 0;
    const list = this.selectedAccountKeysForActivities.size > 0
      ? this.filteredActivitiesForDate.filter((act: any) => this.selectedAccountKeysForActivities.has(this.getActivityAccountKey(act)))
      : this.filteredActivitiesForDate;
    return list.reduce((sum, act) => sum + this.getActivityDurationSeconds(act), 0);
  }

  /** Formats the selected date for display (e.g. "April 23, 2024") */
  formatSelectedDateLabel(): string {
    const year = this.selectedYear ?? new Date().getFullYear();
    const month = this.selectedMonth;
    const day = this.selectedDay;
    const date = new Date(year, month - 1, day);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
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
    if (first.type === 'story' && first.storyReleaseId) {
      return `story_${first.game}_${first.storyReleaseId}_${first.instanceId || first.referenceId || index}`;
    }
    return `${first.type}_${first.game}_${first.instanceId || first.referenceId || index}`;
  };

  trackByStoryMilestone: TrackByFunction<ActivityFirstCompletion> = (index: number, s: ActivityFirstCompletion): string =>
    `${s.storyReleaseId || 'unknown'}_${s.referenceId}_${s.completionDate}_${index}`;

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
    private activityBreakdownService: ActivityBreakdownService,
    private seasonService: SeasonService,
    private pgcrModalService: PGCRModalService,
    public uiI18n: UiI18nService,
    private locale: LocaleService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private archiveService: ArchiveService,
    public archiveRuntime: ArchiveRuntimeService,
    private assetUrl: AssetUrlService
  ) {
    (window as any).activityDbService = this.activityDb;
    this.hideGetStartedBanner = typeof localStorage !== 'undefined' && localStorage.getItem(HIDE_GET_STARTED_KEY) === 'true';
    this.loadActivityCollapseState();
    this.loadActivitiesViewPreferences();
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

  /**
   * Formats a duration in seconds as Hh Mm (e.g. 7098h 08m).
   */
  formatSecondsToHoursMinutes(totalSeconds: number | undefined | null): string {
    const seconds = totalSeconds ?? 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${hours}h ${pad(minutes)}m`;
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

    if (this.isOfflineArchiveMode) {
      await this.hydrateFromOfflineArchive();
      this.showOfflineDeviceReady = this.archiveService.isDevicePreparedForOffline();
    }

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

    // Page Visibility: show tip if user returns after switching away during loading
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    // Clean up any subscriptions or timers
    this.statsDebounce$.complete();
    this.filteredActivities$.complete();
  }

  /** Page Visibility API: track when user leaves during loading so we can show a tip on return. */
  private onVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      if (this.showLoadingModal || this.loadingProgress) {
        this.wasLoadingWhileTabHidden = true;
      }
    } else {
      if (this.wasLoadingWhileTabHidden) {
        this.wasLoadingWhileTabHidden = false;
        this.showBackgroundLoadingTip = true;
        this.cdr.markForCheck();
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
          this.showBackgroundLoadingTip = false;
          this.cdr.markForCheck();
        }, 10000);
      }
    }
  }

  dismissBackgroundLoadingTip(): void {
    this.showBackgroundLoadingTip = false;
    this.cdr.markForCheck();
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
    
    // When first account enters fetch phase, init phase progress so modal shows "fetch" step immediately
    if (status === 'fetching-activities' && !this.loadingProgress) {
      this.updateLoadingProgress('fetch', 0, 100, message);
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

  /** Returns the profile currently being loaded (not complete) for display in the loading modal */
  public getCurrentLoadingProfile(): { displayName: string; platform: string } | null {
    const loading = this.accountLoadingStatuses.find(s => s.status !== 'complete' && s.status !== 'error');
    return loading ? { displayName: loading.displayName, platform: loading.platform } : null;
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
   * Automatically load and display favorite profiles on app startup.
   * Uses the full load path (same as "Load All Favorites" button) so the process
   * actually runs with proper loading UI - no fake or misleading loading states.
   */
  async loadAndDisplayFavorites() {
    await this.loadFavorites();
    
    // If we have favorites and no currently selected players, load them automatically
    if (this.favoriteAccounts.length > 0 && this.selectedPlayers.length === 0) {
      await this.loadMultipleFavorites(this.favoriteAccounts);
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
    this.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');
    this.cdr.detectChanges();

    try {
      // Pre-populate loading status for each account so user sees which profiles are loading
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
          `Loading ${game} profile for ${player.displayName}...`
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
              console.warn('[LoadFavorites] Skipped due to error for', player.membershipId, err);
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
            console.warn('[LoadFavorites] WastedTime skipped for', player.membershipId, err);
          })
        );

        // Proactively load titles in parallel so Account Summary has
        // accurate seal counts without requiring a Titles tab visit.
        if (!this.isD1Player(player)) {
          loadPromises.push(
            this.loadTitlesForPlayer(player).catch((err: any) => {
              console.warn('[LoadFavorites] Title load skipped for', player.membershipId, err);
            })
          );
        }
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
    this.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');
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

        // Proactively load titles so Account Summary has seals from
        // Bungie title data for permalink-loaded players.
        if (!this.isD1Player(player)) {
          loadPromises.push(
            this.loadTitlesForPlayer(player).catch((err: any) => {
              console.warn('[LoadURLPlayers] Title load skipped for', player.membershipId, err);
            })
          );
        }
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
      if (!prefixResp || prefixResp.ErrorCode !== 1) {
        const status = prefixResp?.ErrorStatus || 'Unknown';
        const message = prefixResp?.Message || 'No additional details.';
        this.errorMessage = `Bungie API error while searching. Status: ${status}. ${message}`;
        this.bungieUnavailable = true;
        return;
      }
      if (!results || results.length === 0) {
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

    // Sync selected account for multi-account consumers
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
    this.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');
    this.cdr.detectChanges();

    try {
      // Pre-populate loading status for every selected account (D1 and D2) so the progress
      // modal and "X reports for ... found" appear immediately, including for a single account.
      for (const pl of this.selectedPlayers) {
        const accountKey = this.getPlayerKey(pl);
        const isD1 = this.isD1Player(pl);
        const game = isD1 ? 'D1' : 'D2';
        const platform = this.getPlatformName(pl.membershipType);
        this.updateAccountLoadingStatus(
          accountKey,
          pl.displayName,
          platform,
          game,
          pl.membershipType,
          'fetching-profile',
          `Loading ${game} profile for ${pl.displayName}...`
        );
      }

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

        // Proactively load titles in parallel for all Destiny 2 accounts
        // when we run the character-history/firsts loader.
        if (!this.isD1Player(pl)) {
          loadPromises.push(
            this.loadTitlesForPlayer(pl).catch((err: any) => {
              console.warn('[LoadTitles] Skipped due to error for', pl.membershipId, err);
            })
          );
        }
      }
      await Promise.all(loadPromises);
      // After loading character history, trigger activity loading if we have a date selected
      if (this.selectedDate) {
        if (environment.debug) {
          console.log('[Load] Character history sync done, loading activities for date', this.selectedDate);
        }
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
    if (this.activeTab === 'firsts') {
      this.syncActiveFirstsGameWithPlayers();
    }
    this.updatePlatformTabs();
    this.cdr.detectChanges();
    
    // When appending a new player, keep existing loading statuses and any
    // activities already displayed for the current date so the UI doesn't
    // flicker back to an empty state. New data will be merged in as it
    // arrives and the per-date view will be refreshed incrementally.
    try {
      await this.runWithPlayerSyncLimit(async () => {
        await this.loadCharacterHistory(displayPlayer);
        await this.loadGuardianFirsts(displayPlayer);
        await this.loadDungeonSoloFirsts(displayPlayer);
      });

      // Wasted-on-Destiny can run in parallel and isn't bound to the
      // concurrency semaphore because it hits a different host.
      this.loadWastedTime(displayPlayer).catch(err => console.warn('[appendPlayer] WastedTime skipped', err));

      // Proactively load titles in the background for Account Summary accuracy
      // This ensures titles are available even if the Titles tab hasn't been clicked
      if (!this.isD1Player(displayPlayer)) {
        this.loadTitlesForPlayer(displayPlayer).catch((err: any) => 
          console.warn('[appendPlayer] Background title load skipped', err)
        );
      }

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
        
        this.characters[this.getPlayerKey(player)] = normalizeD1ProfileCharacters(
          profile.Response.data?.characters
        );
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
        
        // Running total: init so we can show "X reports for ... found" as API returns pages
        this.activityCountByAccount.set(accountKey, 0);
        
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
        
        // All reports for this account fetched; show "Done!"
        this.reportActivityCountDelta(accountKey, player.displayName, platform, game, player.membershipType, 0, true);
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
        
        this.activityCountByAccount.set(accountKey, 0);
        
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
        
        this.reportActivityCountDelta(accountKey, player.displayName, platform, game, player.membershipType, 0, true);
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
            ? await this.pgcrCacheService.getD1PGCR(instanceId, activity.period)
            : await this.pgcrCacheService.getD2PGCR(instanceId);

          if (cached) {
            return cached as any;
          }

          // Not cached – fetch from Bungie and persist.
          const fetched = await firstValueFrom(
            this.bungieService.getPGCR(instanceId, character.game === 'D1')
          );

          if (character.game === 'D1') {
            await this.pgcrCacheService.cacheD1PGCR(
              instanceId,
              fetched,
              character.membershipId,
              activity.period
            );
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
        
        const hasEntries = Array.isArray(pgcr.entries) && pgcr.entries.length > 0;
        const hasPrunedPlayers = Array.isArray(pgcr.players) && pgcr.players.length > 0;
        if (!hasEntries && !hasPrunedPlayers) {
          if (environment.debug) {
          console.warn(`[DEBUG] PGCR ${instanceId} has no entries (undefined or empty). Marking as unavailable.`);
          }
          validatedActivities.push({
            ...activity,
            pgcrUnavailable: true
          });
          return;
        }

        const pgcrPeriod = resolvePgcrPeriod(pgcr);
        const periodMatches =
          character.game === 'D1'
            ? pgcrPeriodMatchesForD1(activity.period, pgcrPeriod)
            : pgcrPeriodMatches(activity.period, pgcrPeriod);
        if (activity.period && !periodMatches) {
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

        const playerInPgcr = hasPrunedPlayers
          ? pgcr.players.some((p: { id?: string }) => String(p.id) === String(character.membershipId))
          : pgcr.entries.some((entry: PGCREntry) => {
              return entry.player?.destinyUserInfo?.membershipId === character.membershipId;
            });

        if (playerInPgcr) {
          if (environment.debug) {
            console.log(`[DEBUG] Successfully validated activity ${instanceId} for player ${character.membershipId}`);
          }
          validatedActivities.push({
            ...activity,
            validated: true,
            validatedAt: new Date().toISOString(),
            // Attach character class of the matching entry so the UI can render the icon
            characterClass: hasPrunedPlayers
              ? pgcr.players.find((p: { id?: string; class?: string }) =>
                  String(p.id) === String(character.membershipId)
                )?.class
              : (pgcr.entries.find((entry: PGCREntry) => (
                  (entry.player?.destinyUserInfo?.membershipId === character.membershipId && entry.characterId === character.characterId) ||
                  (entry.player?.destinyUserInfo?.membershipId === character.membershipId) ||
                  (entry.characterId === character.characterId) ||
                  (entry.player?.destinyUserInfo?.membershipType === character.membershipType && entry.player?.destinyUserInfo?.membershipId === character.membershipId)
                ))?.player?.characterClass) || activity.characterClass
          });
        } else {
          if (environment.debug) {
            console.warn(`[DEBUG] Player ${character.membershipId} not found in PGCR ${instanceId}`);
          }
        }
      } else {
        const error = result.status === 'rejected' ? result.reason : 'Unknown error';
        if (environment.debug) {
          console.warn(`[DEBUG] Failed to fetch PGCR ${instanceId}:`, error);
        }

        // If it's a D1 activity and we got a 500 error, we might want to try the D2 endpoint
        if (environment.debug && character.game === 'D1' && error.status === 500) {
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
            if (environment.debug) {
              console.warn('[DEBUG] Invalid D1 activity response structure:', response);
            }
            return [];
          }

          // D1: same persistence rule as D2 — Bungie must supply activityDetails.instanceId.
          const validStructureActivities = response.data.activities.filter((activity: ActivityHistory) => {
            const inst = activity.activityDetails?.instanceId;
            if (!activity.period || inst == null || String(inst).trim() === '' || String(inst).trim() === '0') {
              if (environment.debug) {
                console.warn('[DEBUG] D1 activity missing period or instanceId:', activity);
              }
              return false;
            }
            const ref =
              activity.activityDetails?.referenceId ??
              (activity as any).referenceId ??
              (activity as any).activityHash;
            if (ref == null || String(ref).trim() === '') {
              if (environment.debug) {
                console.warn('[DEBUG] D1 activity missing referenceId:', activity);
              }
              return false;
            }
            return true;
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
              if (environment.debug) {
                console.warn('[DEBUG] D2 activity missing required fields:', activity);
              }
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
        console.error(`Activity fetch error (attempt ${retries + 1}/${maxRetries}):`, error);
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
      if (isNew && environment.debug) {
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

      if (environment.debug) {
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
      }

      await this.activityDb.addActivities(storedActivities);
      // Update totals in background (no await to avoid slowing batch loop)
      this.statsDebounce$.next();
      if (environment.debug) {
        console.log(`[DEBUG] Stored ${storedActivities.length} new activities for character ${character.characterId} (${character.game})`);
      }
      this.cdr.detectChanges();
    }
  }

  private validateDateRanges(activities: ActivityHistory[], character: CharacterWithGame): void {
    if (!environment.debug) {
      return;
    }
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
    
    const accountKey = this.getPlayerKey(character);
    const existingStatus = accountKey ? this.accountLoadingStatus.get(accountKey) : undefined;
    
    // Update account loading status for this character
    if (character.game && existingStatus) {
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
    
    try {
      const dbActivities = await this.activityDb.getAllActivitiesForCharacter(
        character.membershipId,
        character.characterId
      );

      let newActivities: StoredActivity[] = [];
      
      // Select mode list based on game.
      // Destiny 1 requires individual mode pagination; include Story (2) so
      // campaign first missions are ingested for Guardian Firsts.
      // Destiny 2 can use a single aggregated request (mode undefined).
      const modes: (number | undefined)[] = character.game === 'D1'
        ? [2, 6, 4]       // Story, PvE, PvP
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

          // Running total: report as reports are found so user sees progress
          if (accountKey && existingStatus) {
            this.reportActivityCountDelta(
              accountKey,
              existingStatus.displayName,
              existingStatus.platform,
              character.game as 'D1' | 'D2',
              character.membershipType,
              storedActivities.length,
              false
            );
          }

          // Legacy overall count for any other UI
          this.overallActivitiesProcessed += storedActivities.length;
          
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
            // clear the per-date filtered cache and trigger a refresh so the user sees them.
            // Applies to both D1 and D2: loadActivityHistoryForCharacter runs per character
            // (D1 or D2), and this path triggers the same full-date refresh for either game.
            // Do NOT mark accounts complete here — full sync (more pages, Guardian Firsts, etc.) may still be running.
            if (this.selectedDate && uniqueNewActivities.some(act => this.isActivityOnSelectedDate(act))) {
              const cacheKey = `filtered-${this.selectedDate}-${this.selectedActivityType.label}`;
              const entry = this.filteredActivitiesCache.get(cacheKey);
              if (entry) {
                entry.dirty = true;
              }
              // Fire-and-forget background refresh — guarded by currentLoadToken inside the call.
              this.loadAllFilteredActivities(true, false);
            }
          }

          // Phase-A fast path: as soon as we have at least one activity for the selected date
          // (month/day match) we trigger a lightweight refresh so the user sees results instantly.
          if (!this.initialDisplayShown) {
        const foundToday = allActivities.some(act => this.isActivityOnSelectedDate(act));
            if (foundToday) {
              this.initialDisplayShown = true;
              // Fire-and-forget – we don't await to avoid stalling further page fetches.
              this.loadAllFilteredActivities(true, false);
        }
      }

      this.processAndGroupActivities();
    } catch (error) {
      console.error('Error loading activity history for character:', error);
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

  /**
   * Update running total of activity reports for an account as the API returns pages.
   * Call with isDone: true only when all characters for that account have finished fetching.
   */
  private reportActivityCountDelta(
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    delta: number,
    isDone: boolean
  ): void {
    const prev = this.activityCountByAccount.get(accountKey) ?? 0;
    const count = prev + delta;
    this.activityCountByAccount.set(accountKey, count);
    const msg = count === 0 && !isDone
      ? `Fetching ${game} activities for ${displayName}...`
      : `${count} report${count === 1 ? '' : 's'} for ${displayName} ${platform} found${isDone ? '. Done!' : ''}`;
    this.updateAccountLoadingStatus(
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      'fetching-activities',
      msg
    );
    this.cdr.detectChanges();
  }

  /**
   * Build a user-visible message: "X reports for username platform found. Done!" (or per-player list).
   */
  private buildReportCountMessage(activities: ActivityHistory[]): string {
    const players = (this.selectedPlayers || []).filter(Boolean);
    if (players.length === 0) {
      const n = activities.length;
      return n === 0 ? 'No reports found. Done!' : `${n} report${n === 1 ? '' : 's'} found. Done!`;
    }
    const countByMember = new Map<string, number>();
    for (const a of activities) {
      const mid = (a as any).membershipId as string | undefined;
      if (mid) {
        countByMember.set(mid, (countByMember.get(mid) ?? 0) + 1);
      }
    }
    const parts: string[] = [];
    for (const player of players) {
      const count = countByMember.get(player.membershipId) ?? 0;
      const platform = this.getPlatformName(player.membershipType);
      const name = player.displayName || 'Unknown';
      parts.push(`${count} report${count === 1 ? '' : 's'} for ${name} ${platform}`);
    }
    return parts.join('. ') + '. Done!';
  }

  /** One line for "Total number of reports for X is N": e.g. "splashbear PlayStation" or "splashbear PlayStation, otheruser Xbox". */
  private getReportSummaryLine(activities: ActivityHistory[]): string {
    const players = (this.selectedPlayers || []).filter(Boolean);
    if (players.length === 0) return 'selected profiles';
    const countByMember = new Map<string, number>();
    for (const a of activities) {
      const mid = (a as any).membershipId as string | undefined;
      if (mid) countByMember.set(mid, (countByMember.get(mid) ?? 0) + 1);
    }
    const parts = players
      .filter(p => (countByMember.get(p.membershipId) ?? 0) > 0)
      .map(p => `${p.displayName || 'Unknown'} ${this.getPlatformName(p.membershipType)}`);
    return parts.length > 0 ? parts.join(', ') : 'selected profiles';
  }

  private async processAndGroupActivities(progressMessage?: string): Promise<void> {
    const totalToProcess = this.filteredActivitiesForDate.length;
    if (totalToProcess === 0) {
      this.groupedActivitiesByAccount = [];
      this.firstEverActivity = undefined;
      this.cdr.detectChanges();
      await this.setFirstEverActivityFromDb();
      return;
    }
    // Initialise process-phase progress bar
    const processLabel = progressMessage ?? 'Processing activities…';
    this.updateLoadingProgress('process', 0, totalToProcess, processLabel);
    let processedCount = 0;
    // Group by account+game combination first, then by year
    // Internal working structure uses Maps for easy grouping
    // First level: game -> year -> activityName -> aggregated ActivityWithMembership[] (multiple accounts)
    const gameGroups = new Map<'D1' | 'D2', Map<string, { year: string; typeGroups: Map<string, TypeGroup> }>>();
    
    for (const activity of this.filteredActivitiesForDate) {
      const game = activity.game;
      if (!gameGroups.has(game)) {
        gameGroups.set(game, new Map<string, { year: string; typeGroups: Map<string, TypeGroup> }>());
      }
      const gameGroup = gameGroups.get(game)!;
      const year = new Date(activity.period).getFullYear().toString();
      if (!gameGroup.has(year)) {
        gameGroup.set(year, {
          year,
          typeGroups: new Map<string, TypeGroup>()
        });
      }
      const yearGroup = gameGroup.get(year)!;
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
        const pct = ((processedCount / totalToProcess) * 100).toFixed(0);
        this.updateLoadingProgress(
          'process',
          processedCount,
          totalToProcess,
          progressMessage ? `${progressMessage} (${pct}%)` : `Processing activities (${pct}%)…`
        );
        // Trigger partial change detection so the UI can start filling
        this.cdr.detectChanges();
      }
    }

    // Final update: processing complete
    this.updateLoadingProgress('process', totalToProcess, totalToProcess, progressMessage ?? 'Processing complete');

    // Sort activities within each group by time (descending)
    for (const yearMap of gameGroups.values()) {
      for (const yearGroup of yearMap.values()) {
        for (const typeGroup of yearGroup.typeGroups.values()) {
          typeGroup.activities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
        }
      }
    }

    // Convert Maps to Arrays for template (avoids NG0900/NG0200 map errors)
    this.groupedActivitiesByAccount = Array.from(gameGroups.entries()).map(([game, years]) => ({
      game,
      yearGroups: Array.from(years.values()).map(yg => ({
        year: yg.year,
        typeGroups: Array.from(yg.typeGroups.values())
      }))
    }));
    this.cdr.detectChanges();
    await this.setFirstEverActivityFromDb();

  }
  getActivityDurationSeconds(activity: ActivityHistory): number {
    const values = activity.values as any;
    let seconds = values?.timePlayedSeconds?.basic?.value ?? values?.secondsPlayed?.basic?.value ?? values?.activityDurationSeconds?.basic?.value;
    if (typeof values?.secondsPlayed === 'number') seconds = values.secondsPlayed;
    if (typeof values?.timePlayedSeconds === 'number') seconds = values.timePlayedSeconds;
    
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return 0;
    if (seconds > 86400) return 86400; // Cap at 24 hours
    return seconds;
  }

  /**
   * Start background processing for activities
   */
  private startBackgroundProcessing(activities: any[], manifest: any) {
    if (activities.length === 0) return;

    // Only start background processing for large datasets
    if (activities.length < 100) return;

    
    // Show notification that processing continues in background
    this.showBackgroundProcessingIndicator = true;
  }

  /**
   * Resume processing when user returns to tab
   */

  /**
   * Load and display filtered activities for the selected date.
   * @param forceRefresh - Bypass cache when fetching from DB.
   * @param markAccountsComplete - If true, set account status to 'complete' when done (use false when
   *   called from incremental refresh during sync so the progress modal stays until the full sync finishes).
   */
  public async loadAllFilteredActivities(forceRefresh: boolean = false, markAccountsComplete: boolean = true) {
    const loadToken = ++this.currentLoadToken;
    const playerNames = (this.selectedPlayers || []).map(p => p.displayName).join(', ');
    if (environment.debug) {
      console.log('[Load] Start', { forceRefresh, players: playerNames });
    }

    // Update status for all accounts to show activities are being displayed (skip when incremental refresh)
    if (markAccountsComplete) {
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
    }

    // Kick off fetch-phase progress (phases: fetch → pgcr → process → render)
    this.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');

    try {
      const activities = await this.getAllFilteredActivitiesForDate(forceRefresh);
      if (environment.debug) {
        console.log('[Load] Fetch done', { activityCount: activities?.length ?? 0 });
      }
      if (loadToken !== this.currentLoadToken) {
        this.loadingProgress = null;
        this.cdr.detectChanges();
        return;
      }

      // Build user-visible report count message: "X reports for username platform found. Done!"
      const reportCountMessage = this.buildReportCountMessage(activities);
      this.updateLoadingProgress('fetch', 1, 1, reportCountMessage);
      await new Promise(r => setTimeout(r, 800)); // Brief pause so user can read "found. Done!"
      if (loadToken !== this.currentLoadToken) {
        this.loadingProgress = null;
        this.cdr.detectChanges();
        return;
      }

      const totalReports = activities.length;
      const reportSummary = this.getReportSummaryLine(activities);
      const organizeMessage = totalReports === 0
        ? 'No reports for selected date. Organizing and displaying….'
        : `Total number of reports for ${reportSummary} is ${totalReports}. Organizing and displaying….`;
      this.updateLoadingProgress('pgcr', 0, 1, organizeMessage);
      // Ensure class icons can render by enriching activities with character class from PGCRs
      await this.enrichActivitiesWithCharacterClass(activities);
      if (environment.debug) {
        console.log('[Load] PGCR enrich done');
      }
      if (loadToken !== this.currentLoadToken) {
        this.loadingProgress = null;
        this.cdr.detectChanges();
        return;
      }
      this.updateLoadingProgress('process', 0, 1, organizeMessage);

      this.filteredActivitiesForDate = activities;
      if (activities.length > 0) {
        this.scheduleBatchedUpdate();
      }

      // Ensure Destiny manifest has finished loading so that activity names/types resolve properly
      if (!this.manifest.isLoadedSync) {
        await this.manifest.isLoaded().toPromise();
      }

      // PROCESS phase handled separately—ensure groups are ready before rendering slices
      if (environment.debug) {
        console.log('[Load] Process start');
      }
      this.processAndGroupActivities(organizeMessage);
      if (environment.debug) {
        console.log('[Load] Process done');
      }

      // Start background processing for heavy operations
      this.startBackgroundProcessing(activities, this.manifest);

      // ---------- RENDER PHASE ----------
      const sliceSize = 250;
      const totalSlices = Math.max(1, Math.ceil(this.filteredActivitiesForDate.length / sliceSize));
      if (environment.debug) {
        console.log('[Load] Render start', { totalSlices });
      }
      for (let i = 0; i < totalSlices; i++) {
        if (loadToken !== this.currentLoadToken) return; // Abort if newer load started

        // Nothing special: activities already grouped; we just trigger change detection so list updates
        this.updateActivityDisplay();

        // Progress update: keep "Organizing and displaying" with percentage
        this.updateLoadingProgress(
          'render',
          i + 1,
          totalSlices,
          totalReports === 0
            ? `Organizing and displaying… (${Math.round(((i + 1) / totalSlices) * 100)}%)`
            : `Total ${totalReports} reports. Organizing and displaying… (${Math.round(((i + 1) / totalSlices) * 100)}%)`
        );

        // Give the UI a chance to paint between large batches
        await new Promise(requestAnimationFrame);
      }

      // Show "Done!" before fading out
      if (loadToken === this.currentLoadToken) {
        const doneMessage = totalReports === 0
          ? 'No reports for selected date. Organizing and displaying…. Done!'
          : `Total number of reports for ${reportSummary} is ${totalReports}. Organizing and displaying…. Done!`;
        this.updateLoadingProgress('render', totalSlices, totalSlices, doneMessage);
        this.cdr.detectChanges();
        if (environment.debug) {
          console.log('[Load] Complete');
        }
        setTimeout(() => {
          this.loadingProgress = null;
          this.cdr.detectChanges();
        }, 1200);
      }
    } catch (error) {
      if (environment.debug) {
        console.warn('[Load] Error', error);
      }
      if (loadToken === this.currentLoadToken) {
        this.loadingProgress = null;
        this.cdr.detectChanges();
      }
    } finally {
      if (loadToken === this.currentLoadToken) {
        this.loadingActivities[this.selectedDate] = false;
        
        // Mark all accounts as complete only when this is the final load (after full sync).
        // When called from incremental refresh during activity fetch, do not mark complete
        // so the progress modal stays until all API calls (all reports, Guardian Firsts, etc.) finish.
        if (markAccountsComplete) {
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
        }
        
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
      let totalBatches = 0;
      for (const player of players) {
        const actsForPlayer = activities.filter(a => !a.characterClass && (a as any).membershipId === player.membershipId);
        if (actsForPlayer.length > 0) {
          totalBatches += Math.ceil(actsForPlayer.length / this.PGCR_BATCH_SIZE);
        }
      }
      if (totalBatches === 0) return;

      this.updateLoadingProgress('pgcr', 0, totalBatches, 'Loading post-game reports (PGCRs)…');
      let currentBatch = 0;

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
          if (environment.debug) {
            console.log('[Load] PGCR batch', {
              displayName: (player as any).displayName,
              platform: this.getPlatformName(player.membershipType),
              batch: currentBatch + 1,
              of: totalBatches,
              startIdx: idx
            });
          }
          const validated = await this.validatePGCRBatch(actsForPlayer, character, idx);
          currentBatch += 1;
          this.updateLoadingProgress(
            'pgcr',
            currentBatch,
            totalBatches,
            `Loading post-game reports (PGCRs)… ${currentBatch} of ${totalBatches}`
          );
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
        return D1_RAID_HASHES.includes(referenceId);
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
    let totalTime = 0;
    let totalActivityTime = 0;
    const perType: { [type: string]: { count: number, time: number } } = {};
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
      
      // Guardian Firsts: keep guardianFirstsMap + aggregateGuardianFirsts in sync with getFirstCompletions.
      // The Firsts tab reads story/raid aggregates via aggregateGuardianFirsts (not guardianFirsts alone).
      // Previously we only set guardianFirsts here, so story milestones never appeared after stats refresh.
      const selectedKeys = new Set(this.selectedPlayers.map((p) => this.getPlayerKey(p)));
      for (const k of Object.keys(this.guardianFirstsMap)) {
        if (!selectedKeys.has(k)) {
          delete this.guardianFirstsMap[k];
        }
      }

      for (const player of this.selectedPlayers) {
        const statsGame = this.isD1Player(player) ? 'D1' : 'D2';
        const charIds = (this.characters[this.getPlayerKey(player)] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);
        const allFirsts: ActivityFirstCompletion[] = [];
        for (const characterId of charIds) {
          const firsts = await this.activityDb.getFirstCompletions(
            player.membershipId,
            characterId,
            statsGame
          );
          allFirsts.push(...firsts.firstCompletions);
        }
        const perName = new Map<string, ActivityFirstCompletion>();
        for (const f of allFirsts) {
          const c: unknown = f.completed;
          if (!(c === 1 || c === true || Number(c) === 1)) continue;
          const key = this.guardianFirstsDedupKey(f);
          const existing = perName.get(key);
          if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
            perName.set(key, f);
          }
        }
        const sorted = Array.from(perName.values()).sort(
          (a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime()
        );
        const pKeyStats = this.getPlayerKey(player);
        this.guardianFirstsMap[pKeyStats] = sorted;
      }

      const aggregate: ActivityFirstCompletion[] = [];
      for (const player of this.selectedPlayers) {
        const list = this.guardianFirstsMap[this.getPlayerKey(player)] || [];
        for (const f of list) {
          const key = this.guardianFirstsDedupKey(f);
          const existing = aggregate.find((x) => this.guardianFirstsDedupKey(x) === key);
          if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
            if (existing) {
              const idx = aggregate.indexOf(existing);
              aggregate[idx] = f;
            } else {
              aggregate.push(f);
            }
          }
        }
      }
      this.aggregateGuardianFirsts = aggregate.sort(
        (a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime()
      );
      this.guardianFirsts = this.aggregateGuardianFirsts;

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

      // Pull total playtime (seconds) from Bungie character data only.
      // We sum `minutesPlayedTotal` / `minutesPlayed` (or D1 equivalents) across all characters
      // for all selected players – no WastedOnDestiny fallback.
      for (const pl of this.selectedPlayers) {
        const chars = this.characters[this.getPlayerKey(pl)] as any[] | undefined;
        if (!chars || chars.length === 0) continue;
        const minutes = chars.reduce((sum, c) => {
          return sum + getCharacterMinutesPlayed(c, pl.game as 'D1' | 'D2');
        }, 0);
        totalTime += minutes * 60; // convert to seconds
      }

      // Total activity time: if we have actual duration from stored activities use it, otherwise fall back to totalTime
      totalActivityTime = Object.values(perType).reduce((sum, s) => sum + s.time, 0);
      if (!totalActivityTime) {
        totalActivityTime = totalTime;
      }

      // Total activities — count directly from IndexedDB for accuracy, per account/game
      let totalActivities = 0;
      for (const pl of this.selectedPlayers) {
        totalActivities += await this.activityDb.countActivitiesForMembershipAndGame(
          pl.membershipId,
          pl.game as 'D1' | 'D2'
        );
      }

      // Aggregate total seals / titles from Bungie title data only.
      // Count earned titles only – i.e. completed/unlocked titles – so
      // Account Summary matches the Titles tab. No WastedOnDestiny fallback.
      let totalSeals = 0;
      if (this.aggregatedTitles && this.aggregatedTitles.length > 0) {
        totalSeals = this.unlockedTitlesDisplay.length;
      }

      // Build per-platform stats
      const platformStatsMap: { [key: string]: PlatformStats } = {};
      for (const pl of this.selectedPlayers) {
        const platformName = pl.platform;
        // Use game as part of the key so Destiny 1 and Destiny 2 accounts on the same platform don't overwrite each other
        // Also include membershipId so each account gets its own card in the summary
        const key = `${pl.game}-${platformName}-${pl.membershipId}`;
        // Compute playtime from character profiles only (no WastedOnDestiny).
        let time = 0;
        const chars = this.characters[this.getPlayerKey(pl)] as any[] | undefined;
        if (chars && chars.length > 0) {
          const minutes = chars.reduce((sum, c) => {
            return sum + getCharacterMinutesPlayed(c, pl.game as 'D1' | 'D2');
          }, 0);
          time = minutes * 60; // convert to seconds to keep units consistent
        }

        // Compute per-platform seal count from Bungie titles.
        let sealsForPlatform = 0;
        if (this.aggregatedTitles && this.aggregatedTitles.length > 0) {
          const displayName = pl.displayName;
          const platform = pl.platform;
          for (const t of this.aggregatedTitles as any[]) {
            if (t.locked) continue; // only count earned titles
            if (Array.isArray(t.holders) &&
                t.holders.some((h: any) => h.displayName === displayName && h.platform === platform)) {
              sealsForPlatform++;
            }
          }
        }

        const acts = await this.activityDb.countActivitiesForMembershipAndGame(
          pl.membershipId,
          pl.game as 'D1' | 'D2'
        );

        if (!platformStatsMap[key]) {
          platformStatsMap[key] = {
            accountKey: key,
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
        s.totalSeals += sealsForPlatform;

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
      if (environment.debug) {
        console.error('Could not find player for activity:', {
          activityId: activity.activityDetails?.instanceId,
          period: activity.period,
          mode: activity.activityDetails?.mode,
          referenceId: activity.activityDetails?.referenceId,
          availablePlayers: this.selectedPlayers.map(p => ({
            membershipId: p.membershipId,
            displayName: p.displayName
          }))
        });
      }
      throw new Error('Activity has no associated player');
    }

    if (environment.debug) {
      console.log('[DEBUG] Found player for activity:', {
        playerName: player.displayName,
        membershipId: player.membershipId,
        activityId: activity.activityDetails?.instanceId
      });
    }

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
    const newMonth = parseInt(month, 10);
    const newDay = parseInt(day, 10);
    if (!newMonth || !newDay) {
      return;
    }

    this.selectedYear = this.selectedYear || new Date().getFullYear();
    const paddedMonth = String(newMonth).padStart(2, '0');
    const paddedDay = String(newDay).padStart(2, '0');
    const newSelectedDate = `${this.selectedYear}-${paddedMonth}-${paddedDay}`;

    // Search Date on the same month/day: refresh only (skip cache reset).
    const sameDate =
      this.selectedMonth === newMonth &&
      this.selectedDay === newDay &&
      this.selectedDate === newSelectedDate;
    if (sameDate) {
      await this.loadAllFilteredActivities(true);
      return;
    }

    // Date actually changed – reset fast-load state so the first slice renders quickly.
    this.currentLoadToken++;
    this.initialDisplayShown = false;
    this.filteredActivitiesForDate = [];
    this.groupedActivitiesByAccount = [];
    this.clearFilteredActivitiesCache();
    this.selectedMonth = newMonth;
    this.selectedDay = newDay;
    this.selectedDate = newSelectedDate;
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
    this.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');
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
        this.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');
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
    
    // Accept only valid yyyy-MM-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // Convert input date to local midnight
      const inputDate = new Date(value);
      inputDate.setHours(0, 0, 0, 0);
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
    if (this.isOfflineArchiveMode) {
      this.errorMessage = this.uiI18n.t('archive.offlineSearchDisabled');
      return;
    }
    console.log('addPlayer called with searchUsername:', this.searchUsername);
    
    const pending = (this.searchUsername || '').trim();
    if (!pending && this.searchChips.length === 0) {
      this.errorMessage = 'Please enter a username.';
      return;
    }

    if (this.searchChips.length > 0) {
      const names = [...this.searchChips];
      if (pending) {
        names.push(pending);
      }
      const uniqueNames = Array.from(new Set(names.map(n => n.trim()).filter(Boolean)));
      this.searchChips = [];
      this.searchUsername = '';

      if (uniqueNames.length > 1) {
        if (!this.addMode) {
          console.log('[CLEAR] Bulk initial search – clearing all data for replace mode');
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

        this.d1SearchResults = [];
        this.d2SearchResults = [];
        this.crossSavePlayer = null;
        this.showPlatformPicker = false;

        for (const name of uniqueNames) {
          await this.addPlayerByName(name, { accumulate: true });
        }

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

        return;
      }

      if (uniqueNames.length === 1) {
        this.searchUsername = uniqueNames[0];
      }
    }

    // Bulk add: allow comma/newline-separated usernames for BOTH add mode and initial (replace) search
    if (this.searchUsername.includes(',') || this.searchUsername.includes('\n')) {
      const raw = this.searchUsername.trim();
      console.log('[FullStringFallback] Input contains comma/newline, checking if full string is single user:', raw);

      // First try full-string fallback: if Bungie returns matches for the entire raw input,
      // treat it as a single username (covers unquoted names that contain commas).
      const isSingleUser = await this.fullStringFallbackLooksLikeSingleUser(raw);
      console.log('[FullStringFallback] Result:', isSingleUser ? 'TREATING AS SINGLE USER' : 'WILL SPLIT');
      if (isSingleUser) {
        // Leave this.searchUsername as the single raw value and fall through to the single-name search flow
        this.searchUsername = raw;
      } else {
        // No full-string match: fall back to splitting into multiple names (legacy behavior)
        const names = this.parseUsernames(this.searchUsername);
        if (names.length > 1) {
          // If not in add mode, run a one-time clear just like a normal replace search
          if (!this.addMode) {
            console.log('[CLEAR] Bulk initial search – clearing all data for replace mode');
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

          // Deduplicate merged arrays
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

    // If not in add mode, clear all existing data first
    if (!this.addMode) {
      console.log('[CLEAR] Not in add mode, clearing all data for replace mode');
      
      // AGGRESSIVE CLEARING: Clear ALL activities from database
      // This ensures no leftover activities from any previous searches (current session or old sessions)
      console.log('[CLEAR] Clearing ALL activities from database to ensure clean state');
      await this.activityDb.clearAllActivities();
      
      // Verify the database is actually empty
      const remainingCount = await this.activityDb.activities.count();
      if (remainingCount > 0) {
        console.error(`[CLEAR] CRITICAL: ${remainingCount} activities still in database after clearing!`);
      } else {
        console.log('[CLEAR] Database completely cleared - verified 0 activities remaining');
      }
      
      // Clear UI state
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
    
    // Clear any previous search errors
    this.error = {};
    
    // Reset search input to ensure clean state
    this.searchUsername = this.searchUsername.trim();
    
    console.log('Starting search for:', this.searchUsername);

    // Check if input is a numeric membership ID (all digits, typically 17-19 digits)
    const trimmedSearch = this.searchUsername.trim();
    const isNumericId = /^\d{15,20}$/.test(trimmedSearch);
    
    if (isNumericId) {
      // Use GetMembershipsById endpoint for membership ID lookup
      console.log('[Search] Detected membership ID, using GetMembershipsById');
      try {
        const membershipResp = await firstValueFrom(
          this.bungieService.getMembershipData(trimmedSearch)
        );
        
        if (membershipResp && membershipResp.ErrorCode === 1 && membershipResp.Response) {
          const destinyMemberships = membershipResp.Response.destinyMemberships || [];
          const bungieNetUser = membershipResp.Response.bungieNetUser;
          
          if (destinyMemberships.length > 0) {
            // Process all memberships from the response
            this.d1SearchResults = [];
            this.d2SearchResults = [];
            
            for (const membership of destinyMemberships) {
              const effectiveType = (membership.membershipType === 254 && membership.crossSaveOverride && membership.crossSaveOverride > 0)
                ? membership.crossSaveOverride
                : membership.membershipType;
              
              // Determine if this is D1 or D2 based on membership type and cross-save
              // D1 platforms are 1 (Xbox) and 2 (PlayStation) without cross-save
              const isD1 = (membership.membershipType === 1 || membership.membershipType === 2) && 
                          !membership.crossSaveOverride;
              
              const player: PlayerSearchDisplay = {
                displayName: bungieNetUser?.displayName || membership.displayName || 'Unknown',
                membershipId: membership.membershipId,
                membershipType: effectiveType,
                game: isD1 ? 'D1' : 'D2',
                platform: this.getPlatformName(effectiveType),
                isCrossSavePrimary: membership.isCrossSavePrimary || false,
                crossSaveOverride: membership.crossSaveOverride || 0
              };
              
              if (isD1) {
                this.d1SearchResults.push(player);
              } else {
                this.d2SearchResults.push(player);
              }
            }
            
            // Identify cross-save primary
            this.crossSavePlayer = this.d2SearchResults.find(p => p.isCrossSavePrimary) || null;
            
            // Determine next action
            const total = this.d1SearchResults.length + this.d2SearchResults.length;
            if (total === 0) {
              this.errorMessage = 'No Destiny accounts found for that membership ID.';
            } else if (total === 1) {
              const player = this.crossSavePlayer || this.d2SearchResults[0] || this.d1SearchResults[0];
              await this.selectPlayer(player);
            } else {
              this.showPlatformPicker = true;
              this.focusFirstElementInModal('.modal.show');
            }
            
            this.loading['search'] = false;
            this.cdr.detectChanges();
            return;
          } else {
            this.errorMessage = 'No Destiny accounts found for that membership ID.';
            this.loading['search'] = false;
            this.cdr.detectChanges();
            return;
          }
        } else {
          this.errorMessage = 'Invalid membership ID or account not found.';
          this.loading['search'] = false;
          this.cdr.detectChanges();
          return;
        }
      } catch (error: any) {
        console.error('[Search] Membership ID lookup error:', error);
        this.errorMessage = error?.error?.Message || 'Error looking up membership ID.';
        this.loading['search'] = false;
        this.cdr.detectChanges();
        return;
      }
    }

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
      console.log('[Search] D2 Response:', d2Resp);
      if (this.searchUsername.includes('#')) {
        // Bungie Name exact match flow uses helper that already populates d2SearchResults
        await this.processExactD2SearchResponse(d2Resp);
      } else if (d2Resp && d2Resp.ErrorCode === 1) {
        // SearchDestinyPlayer response (array of PlayerSearchResult)
        console.log('[Search] D2 Response is array?', Array.isArray(d2Resp.Response), 'Length:', d2Resp.Response?.length);
        if (Array.isArray(d2Resp.Response) && d2Resp.Response.length > 0) {
          console.log('[Search] Processing D2 results:', d2Resp.Response);
          this.d2SearchResults = d2Resp.Response.map((player: any) => ({
            ...player,
            game: 'D2',
            platform: this.getPlatformName(player.membershipType)
          })) as PlayerSearchDisplay[];
          console.log('[Search] Mapped D2 results:', this.d2SearchResults);
          this.crossSavePlayer = this.d2SearchResults.find(p => p.crossSaveOverride && p.crossSaveOverride > 0) || null;
        } else {
          // Legacy searchUsersPrefix response (Response.searchResults)
          const results = d2Resp?.Response?.searchResults as any[] | undefined;
          if (results && results.length > 0) {
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
            const unique = players.filter((p, idx, arr) => {
              const key = `${(p as any).game || 'D2'}|${p.membershipId}`;
              return arr.findIndex(x => `${(x as any).game || 'D2'}|${x.membershipId}` === key) === idx;
            });
            this.d2SearchResults = unique;
            this.crossSavePlayer = this.d2SearchResults.find(p => p.isCrossSavePrimary) || null;
          }
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

  /** Split input by comma/newline, trim and dedupe */
  private parseUsernames(input: string): string[] {
    const raw = (input || '').split(/[\n,]+/g).map(s => s.trim()).filter(Boolean);
    return Array.from(new Set(raw));
  }

  /**
   * If the full raw input is a single Bungie name, do not split it.
   * This protects names that contain commas.
   * 
   * Simple approach: If input contains a comma, try it as a single username first.
   * The main search will handle finding the user or showing an error.
   */
  private async fullStringFallbackLooksLikeSingleUser(raw: string): Promise<boolean> {
    const value = raw.trim();
    if (!value) {
      return false;
    }

    // If the input contains a comma, assume it might be a single username with a comma
    // and let the main search handle it. This is simpler and more reliable than
    // trying to pre-validate with API calls that may not handle commas well.
    if (value.includes(',')) {
      console.log('[FullStringFallback] Input contains comma, will try as single user:', value);
      return true;
    }

    // For inputs without commas, check if it looks like a single Bungie Name (has #)
    if (value.includes('#')) {
      return true;
    }

    // For other inputs, let the normal flow handle it (will split if needed)
    return false;
  }

  /**
   * Add a single player by name without clearing existing selections (used for bulk add)
   */
  private async addPlayerByName(name: string, options?: { accumulate?: boolean }): Promise<void> {
    const originalAddMode = this.addMode;
    const accumulate = options?.accumulate === true;
    try {
      if (!accumulate) {
        this.addMode = true; // ensure append behavior
        this.errorMessage = '';
        this.d1SearchResults = [];
        this.d2SearchResults = [];
        this.crossSavePlayer = null;
        this.showPlatformPicker = false;
        this.loading['search'] = true;
      }
      this.error = {};
      const query = name.trim();
      if (!query) return;

      const [d2Resp, d1Xbox, d1Psn] = await firstValueFrom(
        this.bungieService.searchAllGames(query)
      );

      // D2 results
      if (query.includes('#')) {
        if (accumulate) {
          if (d2Resp && d2Resp.ErrorCode === 1 && Array.isArray(d2Resp.Response)) {
            const exactPlayers = (d2Resp.Response as any[]).map((player: any) => ({
              ...player,
              game: 'D2',
              platform: this.getPlatformName(player.membershipType)
            })) as PlayerSearchDisplay[];
            this.d2SearchResults.push(...exactPlayers);
          }
        } else {
          await this.processExactD2SearchResponse(d2Resp);
        }
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
          const unique = players.filter((p, idx, arr) => {
            const key = `${(p as any).game || 'D2'}|${p.membershipId}`;
            return arr.findIndex(x => `${(x as any).game || 'D2'}|${x.membershipId}` === key) === idx;
          });
          if (accumulate) {
            this.d2SearchResults.push(...unique);
          } else {
            this.d2SearchResults = unique;
            this.crossSavePlayer = this.d2SearchResults.find(p => p.isCrossSavePrimary) || null;
          }
        }
      }

      // D1 results
      const d1Players = [...(d1Xbox || []), ...(d1Psn || [])];
      const d1Mapped: PlayerSearchDisplay[] = d1Players.map((pl: any) => ({
        ...pl,
        game: 'D1' as 'D1',
        platform: this.getPlatformName(pl.membershipType)
      }));
      if (accumulate) {
        this.d1SearchResults.push(...d1Mapped);
      } else {
        this.d1SearchResults = d1Mapped;
      }

      // Handle results for this individual name
      if (!accumulate) {
        const total = this.d1SearchResults.length + this.d2SearchResults.length;
        if (total === 1) {
          const player = this.d2SearchResults[0] || this.d1SearchResults[0];
          await this.selectPlayer(player);
        } else if (total === 0) {
          console.warn(`[BulkAdd] No accounts found for "${name}"`);
        } else {
          // Ambiguous – open multi-select modal to let user choose accounts
          this.showPlatformPicker = true;
          this.focusFirstElementInModal('.modal.show');
        }
      } else {
        // In accumulate mode, just log ambiguous results but don't interrupt the flow
        // The platform picker will be shown at the end after processing all names
        const total = this.d1SearchResults.length + this.d2SearchResults.length;
        if (total === 0) {
          console.warn(`[BulkAdd] No accounts found for "${name}"`);
        } else if (total > 1) {
          console.log(`[BulkAdd] Multiple accounts found for "${name}" - will show in platform picker`);
        }
      }
    } catch (err) {
      console.warn(`[BulkAdd] Failed to add "${name}":`, err);
    } finally {
      if (!accumulate) {
        this.loading['search'] = false;
        this.addMode = originalAddMode;
        this.cdr.detectChanges();
      }
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
    console.log('[CLEAR] Starting clearAllPlayers - current state:', {
      selectedPlayers: this.selectedPlayers.length,
      filteredActivities: this.filteredActivitiesForDate.length,
      processedActivities: this.processedActivities.length,
      cacheSize: this.filteredActivitiesCache.size,
      activityCacheSize: this.activityCache.size
    });

    // Cancel any ongoing background operations first
    this.cancelBackgroundOperations();
    
    // Clear player-specific caches before clearing player data
    this.clearPlayerSpecificCaches();
    
    // Clear core player data
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
    
    this.showBackgroundProcessingIndicator = false;
    
    // Clear ALL caches more thoroughly
    this.clearCache();
    this.invalidateMemoCaches();
    
    // Clear filtered activities cache completely
    this.filteredActivitiesCache.clear();
    
    // Clear activity cache completely
    this.activityCache.clear();
    
    // Clear database service caches
    this.activityDb.clearAllCaches();
    
    // Reset all observables
    this.filteredActivities$.next([]);
    this.statsDebounce$.next();
    
    // Clear selected accounts service
    this.selectedAccounts.clear();
    
    // Reset sync tracking
    this.syncedPlayers.clear();
    this.firstFullSyncDone = false;
    this.initialDisplayShown = false;
    
    console.log('[CLEAR] clearAllPlayers completed - new state:', {
      selectedPlayers: this.selectedPlayers.length,
      filteredActivities: this.filteredActivitiesForDate.length,
      processedActivities: this.processedActivities.length,
      cacheSize: this.filteredActivitiesCache.size,
      activityCacheSize: this.activityCache.size
    });
    
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
    this.selectedAccountKeysForActivities = new Set();
    this.selectedAccountKeysForBreakdown = new Set();
    this.selectedAccountKeysForFirsts = new Set();
    // Recalculate account stats when a player is removed
    this.calculateAccountStats();
    this.cdr.detectChanges();
    if (this.activeTab === 'firsts') {
      this.syncActiveFirstsGameWithPlayers();
    }
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
      console.error('Error getting filtered activities:', error);
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
      return cachedActivities;
    }

    // Get all characters for the player
    const characters = this.characters[membershipId] || [];
    if (characters.length === 0) {
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
      return cachedEntry.list;
    }

    // Parse selectedDate (format: "YYYY-MM-DD")
    const dateParts = this.selectedDate.split('-');
    if (dateParts.length !== 3) {
      if (environment.debug) {
        console.warn('Invalid selectedDate format:', this.selectedDate);
      }
      return [];
    }
    const [, month, day] = dateParts.map(Number);

    const allFilteredActivities: ActivityWithMembership[] = [];

    // Get all activities for selected players in parallel
    const playerActivitiesPromises = this.selectedPlayers.map(async player => {
      // Verify that this player's activities were actually cleared from database
      const totalActivitiesForPlayer = await this.activityDb.activities
        .where('membershipId')
        .equals(player.membershipId)
        .count();
      
      if (totalActivitiesForPlayer > 0) {
        console.log(`[CLEAR] Database verification: ${totalActivitiesForPlayer} activities found for ${player.displayName} - this should be 0 after clearing`);
      }
      
      // Use the new optimized query methods based on activity type
      let playerActivities: StoredActivity[] = [];
      
      if (this.selectedActivityType.label === 'All') {
        // Get all activities for the date
        const charIds = (this.characters[this.getPlayerKey(player)] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);
        
        const activitiesPromises = charIds.map(async charId => {
          const activities = await this.activityDb.getActivitiesByDate(player.membershipId, charId, month, day);
          return activities;
        });
        const activitiesArrays = await Promise.all(activitiesPromises);
        playerActivities = activitiesArrays.flat();
      } else {
        const charIds = (this.characters[this.getPlayerKey(player)] || [])
          .map(getCharacterId)
          .filter((id): id is string => !!id);

        const activitiesPromises = charIds.map(async charId => {
          return this.activityDb.getActivitiesByDate(player.membershipId, charId, month, day);
        });
        playerActivities = (await Promise.all(activitiesPromises)).flat();

        let mode: number | undefined;
        if (this.selectedActivityType.label === 'Dungeon' && player.game === 'D2') {
          playerActivities = playerActivities.filter(a => {
            const referenceId = String(a.activityDetails?.referenceId ?? '');
            const activityType = this.manifest.getActivityType(referenceId, a.activityDetails?.mode);
            return activityType === 'dungeon';
          });
        } else {
          mode = player.game === 'D1' ? this.selectedActivityType.d1Mode : this.selectedActivityType.d2Mode;
          if (mode !== undefined) {
            playerActivities = playerActivities.filter(a => a.activityDetails?.mode === mode);
          }
        }
      }

      // Keep only activities that belong to the same game as this player
      playerActivities = playerActivities.filter(a => {
        const g = (a as any).game as 'D1' | 'D2' | undefined;
        // Older cached rows may not include the `game` marker – treat them as belonging to this player's game
        return !g || g === player.game;
      });

      // CRITICAL: Verify activities actually belong to this player before stamping displayName
      // This prevents one player's name from appearing on another player's activities
      playerActivities = playerActivities.filter(a => a.membershipId === player.membershipId);
      
      return playerActivities.map(activity => ({
        ...activity,
        // PRESERVE the stored membershipId - don't overwrite it
        membershipId: activity.membershipId,
        membershipType: player.membershipType,
        displayName: player.displayName,
        platform: player.platform,
        game: player.game,
        iconPath: this.manifest.getActivityIcon(activity.activityDetails?.referenceId, player.game === 'D1')
      }));
    });

    const playerFilteredActivities = await Promise.all(playerActivitiesPromises);
    allFilteredActivities.push(...playerFilteredActivities.flat());
    
    // Additional verification: check if there are any activities in database for other players
    const currentMembershipIds = this.selectedPlayers.map(p => p.membershipId);
    const allActivitiesInDb = await this.activityDb.activities.toArray();
    const activitiesForOtherPlayers = allActivitiesInDb.filter(activity => 
      !currentMembershipIds.includes(activity.membershipId)
    );
    
    if (activitiesForOtherPlayers.length > 0) {
      console.warn(`[CLEAR] WARNING: Found ${activitiesForOtherPlayers.length} activities in database for other players:`, 
        activitiesForOtherPlayers.map(a => a.membershipId));
    }

    // Deduplicate by membershipId + instanceId (per-account dedupe)
    const dedupedMap = new Map<string, ActivityWithMembership>();
    
    for (const activity of allFilteredActivities) {
      const instanceId = activity.activityDetails?.instanceId;
      const membershipId = (activity as any).membershipId as string | undefined;
      if (instanceId && membershipId) {
        const key = `${membershipId}|${instanceId}`;
        if (!dedupedMap.has(key)) {
          dedupedMap.set(key, activity);
        }
      }
    }

    const dedupedActivities = Array.from(dedupedMap.values());
    // Sort by period (descending)
    dedupedActivities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());

    // Cache only after initial full sync completes so early partial lists don't persist
    if (this.firstFullSyncDone) {
      this.filteredActivitiesCache.set(cacheKey, { list: dedupedActivities, dirty: false });
    }
    
    this.filteredActivitiesForDate = dedupedActivities;
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
      if (pgcrImage) {
        return this.assetUrl.resolve(pgcrImage);
      }
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
      if (pgcrImage) {
        return this.assetUrl.resolve(pgcrImage);
      }
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
  openExternalPGCRForFirst(first: ActivityFirstCompletion, _event?: MouseEvent) {
    if (!first.instanceId) return;
    const isD1 = first.game === 'D1';
    if (this.activeTab === 'firsts') {
      this.pgcrModalService.openPgcrLiteFromFirst(first);
      return;
    }
    this.openFullPgcrInNewTab(first.instanceId, isD1);
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

  /** Deduplication key for merging first completions across characters and accounts. */
  private guardianFirstsDedupKey(f: ActivityFirstCompletion): string {
    if (f.type === 'story' && f.storyReleaseId) {
      return `${f.game}|story|${f.storyReleaseId}`;
    }
    if ((f.game === 'D1' && f.type === 'raid') || (f.game === 'D2' && (f.type === 'raid' || f.type === 'dungeon'))) {
      return `${f.game}|${f.type}|${f.name}|${f.referenceId}`;
    }
    return `${f.game}|${f.type}|${f.name}`;
  }

  async loadGuardianFirsts(player: PlayerSearchDisplay): Promise<void> {
    this.loadingGuardianFirsts = true;
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
      'organizing-pgcrs',
      `Loading Guardian Firsts for ${player.displayName}…`
    );
    this.cdr.detectChanges();
    try {
      const charIds = (this.characters[this.getPlayerKey(player)] || [])
        .map(getCharacterId)
        .filter((id): id is string => !!id);
      if (environment.traceGuardianFirsts) {
        console.log('[Firsts·trace]', 'ui:loadGuardianFirsts_start', {
          displayName: player.displayName,
          game,
          membershipIdTail: player.membershipId?.slice(-8),
          characterCount: charIds.length,
          characterIdsTail: charIds.map((id) => id.slice(-8)),
        });
      }
      const allFirsts: ActivityFirstCompletion[] = [];
      for (const characterId of charIds) {
        const firsts = await this.activityDb.getFirstCompletions(player.membershipId, characterId, game);
        if (environment.traceGuardianFirsts) {
          const story = firsts.firstCompletions.filter((x) => x.type === 'story');
          console.log('[Firsts·trace]', 'ui:after_character_getFirstCompletions', {
            characterIdTail: characterId.slice(-8),
            totalRows: firsts.firstCompletions.length,
            storyCount: story.length,
            storyReleases: story.map((s) => s.storyReleaseId),
          });
        }
        allFirsts.push(...firsts.firstCompletions);
      }
      if (game === 'D1' && player.membershipId) {
        const membershipStoryFirsts = await this.activityDb.getStoryMilestoneFirstCompletionsForMembership(
          player.membershipId,
          'D1'
        );
        if (environment.traceGuardianFirsts) {
          console.log('[Firsts·trace]', 'ui:membership_story_firsts_merge', {
            membershipIdTail: player.membershipId.slice(-8),
            storyCount: membershipStoryFirsts.length,
            storyReleases: membershipStoryFirsts.map((s) => s.storyReleaseId),
          });
        }
        allFirsts.push(...membershipStoryFirsts);
      }
      // Deduplicate within the account so we keep only the earliest completion for each (game,type,name)
      // For D1 raids and D2 raids/dungeons, use referenceId to keep variants separate
      const perName = new Map<string, ActivityFirstCompletion>();
      for (const f of allFirsts) {
        const key = this.guardianFirstsDedupKey(f);
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
      if (environment.traceGuardianFirsts) {
        const story = sorted.filter((f) => f.type === 'story');
        console.log('[Firsts·trace]', 'ui:after_account_dedupe', {
          playerKey: pKey,
          totalFirsts: sorted.length,
          storyCount: story.length,
          storySummary: story.map((f) => ({
            storyReleaseId: f.storyReleaseId,
            name: f.name,
            instanceId: f.instanceId,
            period: f.completionDate,
          })),
        });
      }
      // recompute aggregate list (dedup by name + game + type)
      // For D1 raids and D2 raids/dungeons, use referenceId to keep variants separate
      const aggregate: ActivityFirstCompletion[] = [];
      const seen = new Set<string>();
      Object.values(this.guardianFirstsMap).forEach(list => {
        for (const f of list) {
          const key = this.guardianFirstsDedupKey(f);
          const existing = aggregate.find(x => this.guardianFirstsDedupKey(x) === key);
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
    return this.filterPantheonEventFirsts(this.getFirstsForPlayer(player), 'legacy-pantheon');
  }

  getPlayerRegularRaids(player: PlayerSearchDisplay, game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const list = this.getFirstsForPlayer(player).filter(f =>
      f.type === 'raid' && f.game === game &&
      (game !== 'D2' || !isAnyPantheonActivity(f.referenceId, f.name))
    );
    return this.sortRaids(list, game);
  }

  private filterPantheonEventFirsts(
    list: ActivityFirstCompletion[],
    eventId: PantheonEventId
  ): ActivityFirstCompletion[] {
    const match = eventId === 'mot-pantheon' ? isMotPantheonActivity : isLegacyPantheonActivity;
    return list.filter(
      (f) => f.type === 'raid' && f.game === 'D2' && match(f.referenceId, f.name)
    );
  }

  private sortPantheonEventRaids(
    list: ActivityFirstCompletion[],
    eventId: PantheonEventId
  ): ActivityFirstCompletion[] {
    const order = getPantheonConfig(eventId).versionSortOrder;
    if (!order.length) {
      return list.slice().sort((a, b) => a.name.localeCompare(b.name));
    }
    return list.slice().sort((a, b) => {
      const ia = order.findIndex((p) => a.name.includes(p));
      const ib = order.findIndex((p) => b.name.includes(p));
      return (ib === -1 ? 999 : ib) - (ia === -1 ? 999 : ia);
    });
  }

  private sortPantheonEventGroupsByReleaseOrder(
    groups: Array<{ baseName: string; versions: ActivityFirstCompletion[] }>,
    eventId: PantheonEventId
  ): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const order = getPantheonConfig(eventId).versionSortOrder;
    if (!order.length) {
      return [...groups].sort((a, b) => a.baseName.localeCompare(b.baseName));
    }
    const index = new Map<string, number>();
    order.forEach((name, i) => index.set(name, i));
    return [...groups].sort((a, b) => {
      const ia = order.findIndex((p) => a.baseName.includes(p));
      const ib = order.findIndex((p) => b.baseName.includes(p));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }

  getGroupedPantheonEvent(
    eventId: PantheonEventId
  ): Array<{ baseName: string; versions: ActivityFirstCompletion[]; cardTitle: string }> {
    const config = getPantheonConfig(eventId);
    const pantheonRaids = this.filterPantheonEventFirsts(this.aggregateGuardianFirsts, eventId);
    if (!pantheonRaids.length) {
      return [];
    }
    const sorted = this.sortPantheonEventRaids(pantheonRaids, eventId);
    const groups = this.groupActivitiesByBaseName(sorted);
    const ordered = this.sortPantheonEventGroupsByReleaseOrder(groups, eventId);
    return ordered.map((g) => ({ ...g, cardTitle: config.cardTitle }));
  }

  getGroupedLegacyPantheonRaids(): Array<{ baseName: string; versions: ActivityFirstCompletion[]; cardTitle: string }> {
    return this.getGroupedPantheonEvent('legacy-pantheon');
  }

  getGroupedMotPantheonRaids(): Array<{ baseName: string; versions: ActivityFirstCompletion[]; cardTitle: string }> {
    return this.getGroupedPantheonEvent('mot-pantheon');
  }

  getGroupedPantheonRaidsForPlayer(
    player: PlayerSearchDisplay,
    eventId: PantheonEventId = 'legacy-pantheon'
  ): Array<{ baseName: string; versions: ActivityFirstCompletion[]; cardTitle: string }> {
    const config = getPantheonConfig(eventId);
    const list = this.filterPantheonEventFirsts(this.getFirstsForPlayer(player), eventId);
    if (!list.length) {
      return [];
    }
    const sorted = this.sortPantheonEventRaids(list, eventId);
    const groups = this.groupActivitiesByBaseName(sorted);
    const ordered = this.sortPantheonEventGroupsByReleaseOrder(groups, eventId);
    return ordered.map((g) => ({ ...g, cardTitle: config.cardTitle }));
  }

  /** @deprecated Use getGroupedLegacyPantheonRaids */
  getGroupedPantheonRaids(): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    return this.getGroupedLegacyPantheonRaids();
  }

  /** Aggregate helpers */
  getAggregateRaids(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const raids = this.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'raid');
    // Note: getEarliestFirsts is redundant here since loadGuardianFirsts already aggregates
    // by keeping the earliest completion for each activity across all players.
    // However, we keep it for safety in case there are edge cases.
    const filteredRaids =
      game === 'D2'
        ? raids.filter((r) => !isAnyPantheonActivity(r.referenceId, r.name))
        : raids;
    const earliest = this.getEarliestFirsts(filteredRaids);
    return this.sortRaids(earliest, game);
  }

  getAggregateDungeons(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const dungeonFirsts = this.aggregateGuardianFirsts.filter(f => f.game === game && f.type === 'dungeon');
    
    // For D2, exclude Rite of the Nine variants (they have their own card)
    const filteredDungeons = game === 'D2'
      ? dungeonFirsts.filter(d => {
          const isRiteOfTheNine = (d.name.includes('Ghosts of the Deep') ||
                                   d.name.includes('Spire of the Watcher') ||
                                   d.name.includes('Prophecy')) &&
                                  (d.name.includes('Explorer') ||
                                   d.name.includes('Eternity') ||
                                   d.name.includes('Ultimatum'));
          return !isRiteOfTheNine;
        })
      : dungeonFirsts;
    
    // Note: getEarliestFirsts is redundant here since loadGuardianFirsts already aggregates
    // by keeping the earliest completion for each activity across all players.
    // However, we keep it for safety in case there are edge cases.
    const earliest = this.getEarliestFirsts(filteredDungeons);
    return this.sortDungeons(earliest);
  }

  /** Story milestone firsts (all platforms), timeline order */
  getAggregateStoryMilestones(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    return this.aggregateGuardianFirsts
      .filter((f) => f.game === game && f.type === 'story')
      .sort((a, b) => getStoryAnchorSortOrder(a.storyReleaseId) - getStoryAnchorSortOrder(b.storyReleaseId));
  }

  /** Story milestone firsts for one linked account */
  getPlayerStoryMilestones(player: PlayerSearchDisplay, game?: 'D1' | 'D2'): ActivityFirstCompletion[] {
    const g: 'D1' | 'D2' =
      game === 'D1' || game === 'D2' ? game : this.isD1Player(player) ? 'D1' : 'D2';
    return this.getFirstsForPlayer(player)
      .filter((f) => f.game === g && f.type === 'story')
      .sort((a, b) => getStoryAnchorSortOrder(a.storyReleaseId) - getStoryAnchorSortOrder(b.storyReleaseId));
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

  /** Wrapper to allow grouping from template */
  public groupActivitiesByBaseNamePublic(activities: ActivityFirstCompletion[]): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    return this.groupActivitiesByBaseName(activities);
  }

  /**
   * Gets regular D2 raids (excluding Pantheon events) grouped by base activity name with versions
   */
  getGroupedRegularRaids(): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const allRaids = this.getAggregateRaids('D2');
    return this.groupActivitiesByBaseName(allRaids);
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
    
    const allRaids = this.getAggregateRaids('D2');
    
    for (const raid of allRaids) {
      // Handle special case: "The Desert Perpetual (Epic): Contest" -> base: "The Desert Perpetual", version: "Epic: Contest"
      let baseName = this.getBaseActivityName(raid.name);
      let version = this.getActivityVersion(raid.name);
      
      // Normalize "The Desert Perpetual (Epic): Contest" to base "The Desert Perpetual" with version "Epic: Contest"
      if (baseName.includes('The Desert Perpetual') && baseName.includes('(Epic)')) {
        baseName = 'The Desert Perpetual';
        version = `Epic: ${version}`;
      }
      
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
      ['Root of Nightmares', ['Normal', 'Master']],
      ['Crota\'s End', ['Standard', 'Normal', 'Master', 'Legend']],
      ['Salvation\'s Edge', ['Standard', 'Master']],
      ['Last Wish', ['Standard', 'Normal']],
      ['The Desert Perpetual', ['Standard', 'Normal', 'Contest', 'Epic: Contest', 'Epic: Standard']]
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

    // Sort by release order (most recent first)
    return this.sortGroupsByReleaseOrder(result, 'D2', 'raid');
  }

  /** Per-player: D2 raids with variants */
  getAllD2RaidVariantsForPlayer(player: PlayerSearchDisplay): Array<{
    baseName: string;
    variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }>;
  }> {
    const raidVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    const all = this.getFirstsForPlayer(player).filter(
      (f) => f.type === 'raid' && f.game === 'D2' && !isAnyPantheonActivity(f.referenceId, f.name)
    );
    for (const raid of all) {
      // Handle special case: "The Desert Perpetual (Epic): Contest" -> base: "The Desert Perpetual", version: "Epic: Contest"
      let baseName = this.getBaseActivityName(raid.name);
      let version = this.getActivityVersion(raid.name);
      
      // Normalize "The Desert Perpetual (Epic): Contest" to base "The Desert Perpetual" with version "Epic: Contest"
      if (baseName.includes('The Desert Perpetual') && baseName.includes('(Epic)')) {
        baseName = 'The Desert Perpetual';
        version = `Epic: ${version}`;
      }
      
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
      ['Root of Nightmares', ['Normal', 'Master']],
      ["Crota's End", ['Standard', 'Normal', 'Master', 'Legend']],
      ["Salvation's Edge", ['Standard', 'Master']],
      ['Last Wish', ['Standard', 'Normal']],
      ['The Desert Perpetual', ['Standard', 'Normal', 'Contest', 'Epic: Contest', 'Epic: Standard']]
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
    
    // Sort by release order (most recent first)
    return this.sortGroupsByReleaseOrder(result, 'D2', 'raid');
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
        return this.assetUrl.resolve(pgcrImage);
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
    
    // Collect all completed dungeons, excluding Rite of the Nine variants (they have their own card)
    const allDungeons = this.getAggregateDungeons('D2').filter(dungeon => {
      // Exclude Rite of the Nine variants (Explorer, Eternity, Ultimatum) for Ghosts, Spire, and Prophecy
      const isRiteOfTheNine = (dungeon.name.includes('Ghosts of the Deep') ||
                                dungeon.name.includes('Spire of the Watcher') ||
                                dungeon.name.includes('Prophecy')) &&
                               (dungeon.name.includes('Explorer') ||
                                dungeon.name.includes('Eternity') ||
                                dungeon.name.includes('Ultimatum'));
      return !isRiteOfTheNine;
    });
    
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
      ['Pit of Heresy', ['Normal']],
      ['Prophecy', ['Normal']],
      ['Grasp of Avarice', ['Normal', 'Master']],
      ['Duality', ['Normal', 'Master']],
      ['Spire of the Watcher', ['Normal', 'Master']],
      ['Ghosts of the Deep', ['Normal', 'Master']],
      ['Warlord\'s Ruin', ['Normal', 'Master']],
      ['Vesper\'s Host', ['Normal', 'Master']],
      ['Sundered Doctrine', ['Normal', 'Master']],
      ['Equilibrium', ['Normal', 'Master']]
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

    // Sort by release order (most recent first)
    return this.sortGroupsByReleaseOrder(result, 'D2', 'dungeon');
  }

  /** Per-player: D2 dungeons with variants */
  getAllD2DungeonVariantsForPlayer(player: PlayerSearchDisplay): Array<{
    baseName: string;
    variants: Array<{ version: string; first?: ActivityFirstCompletion; hasClear: boolean; }>;
  }> {
    const dungeonVariants = new Map<string, Map<string, ActivityFirstCompletion>>();
    // Exclude Rite of the Nine variants (they have their own card)
    const all = this.getFirstsForPlayer(player).filter(f => {
      if (f.type !== 'dungeon' || f.game !== 'D2') return false;
      // Exclude Rite of the Nine variants
      const isRiteOfTheNine = (f.name.includes('Ghosts of the Deep') ||
                                f.name.includes('Spire of the Watcher') ||
                                f.name.includes('Prophecy')) &&
                               (f.name.includes('Explorer') ||
                                f.name.includes('Eternity') ||
                                f.name.includes('Ultimatum'));
      return !isRiteOfTheNine;
    });
    for (const d of all) {
      const baseName = this.getBaseActivityName(d.name);
      const version = this.getActivityVersion(d.name);
      if (!dungeonVariants.has(baseName)) dungeonVariants.set(baseName, new Map());
      dungeonVariants.get(baseName)!.set(version, d);
    }
    const defs = new Map<string, string[]>([
      ['The Shattered Throne', ['Standard']],
      ['Pit of Heresy', ['Normal']],
      ['Prophecy', ['Normal']],
      ['Grasp of Avarice', ['Normal', 'Master']],
      ['Duality', ['Normal', 'Master']],
      ['Spire of the Watcher', ['Normal', 'Master']],
      ['Ghosts of the Deep', ['Normal', 'Master']],
      ["Warlord's Ruin", ['Normal', 'Master']],
      ["Vesper's Host", ['Normal', 'Master']],
      ['Sundered Doctrine', ['Normal', 'Master']],
      ['Equilibrium', ['Normal', 'Master']]
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
    
    // Sort by release order (most recent first)
    return this.sortGroupsByReleaseOrder(result, 'D2', 'dungeon');
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

    for (const raid of allRaids) {
      const baseName = this.getBaseActivityName(raid.name);
      // For D1 raids, use referenceId to determine variant type since all variants have the same name
      const version = this.getD1RaidVariantName(raid.referenceId, raid.name);

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

    // Sort by release order (most recent first)
    return this.sortGroupsByReleaseOrder(result, 'D1', 'raid');
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
    // Order: oldest to newest (index 0 = oldest). Sort uses b - a for newest first.
    const pantheonOrder = [
      'The Pantheon: Atraks Sovereign',
      'The Pantheon: Oryx Exalted',
      'The Pantheon: Rhulk Indomitable',
      'The Pantheon: Nezarec Sublime'
    ];
    return list.slice().sort((a, b) => pantheonOrder.indexOf(b.name) - pantheonOrder.indexOf(a.name));
  }

  /** Sorts Pantheon groups so newest (Nezarec) is first; groupActivitiesByBaseName sorts alphabetically so we override. */
  private sortPantheonGroupsByReleaseOrder(groups: Array<{ baseName: string; versions: ActivityFirstCompletion[] }>): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
    const order = [
      'The Pantheon: Nezarec Sublime',
      'The Pantheon: Rhulk Indomitable',
      'The Pantheon: Oryx Exalted',
      'The Pantheon: Atraks Sovereign'
    ];
    const index = new Map<string, number>();
    order.forEach((name, i) => index.set(name, i));
    return [...groups].sort((a, b) => {
      const ia = index.get(a.baseName) ?? 999;
      const ib = index.get(b.baseName) ?? 999;
      return ia - ib;
    });
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
      'Sundered Doctrine',
      'Equilibrium'
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
    if (baseName.includes('The Desert Perpetual')) return 'The Desert Perpetual';
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
    if (!this.isD1Player(player)) {
      const accountKey = this.getPlayerKey(player);
      const platform = this.getPlatformName(player.membershipType);
      this.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        'D2',
        player.membershipType,
        'organizing-pgcrs',
        `Loading Dungeon Solo Firsts for ${player.displayName}…`
      );
      this.cdr.detectChanges();
    }
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

  openExternalPGCR(activity: ActivityHistory, isD1: boolean, event?: MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) return;
    if (this.activeTab === 'activities' || this.activeTab === 'firsts') {
      this.pgcrModalService.openPgcrLiteFromActivity(activity, isD1);
      return;
    }
    this.openFullPgcrInNewTab(instanceId, isD1);
  }

  private openFullPgcrInNewTab(instanceId: string | number, isD1: boolean): void {
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
                  icon: (isGilded && gildedIcon) ? gildedIcon : (node.displayProperties?.icon ? this.assetUrl.resolve(node.displayProperties.icon) : null),
                  completed: isCompleted,
                  isGilded,
                  timesGilded: (isCompleted && timesGilded > 0) ? timesGilded : undefined,
                  gildedIcon: (isGilded && gildedIcon) ? gildedIcon : undefined,
                  locked: !isCompleted,
                  missingRecord: !record,
                  altIcon: (() => {
                    const frames = node.iconSequences && node.iconSequences[1] && node.iconSequences[1].frames;
                    if (frames && frames.length > 0) {
                      return this.assetUrl.resolve(frames[frames.length - 1]); // grey/silver variant
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
      // Trigger Account Summary recalculation now that titles are loaded
      this.statsDebounce$.next();
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

  openExternalPGCRFromStored(activity: any, _event?: MouseEvent) {
    if (!activity) return;
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) return;
    if (this.activeTab === 'firsts') {
      this.pgcrModalService.openPgcrLiteFromStored(activity, false);
      return;
    }
    this.openExternalPGCR(activity as any, false);
  }

  activityYearCollapseKey(game: 'D1' | 'D2', year: string): string {
    return `${game}-${year}`;
  }

  isActivityGameCollapsed(game: 'D1' | 'D2'): boolean {
    return this.collapsedActivityGames.has(game);
  }

  toggleActivityGameCollapsed(game: 'D1' | 'D2'): void {
    if (this.collapsedActivityGames.has(game)) {
      this.collapsedActivityGames.delete(game);
    } else {
      this.collapsedActivityGames.add(game);
    }
    this.persistActivityCollapseState();
    this.refreshActivitiesTabView();
  }

  isActivityYearCollapsed(game: 'D1' | 'D2', year: string): boolean {
    return this.collapsedActivityYears.has(this.activityYearCollapseKey(game, year));
  }

  toggleActivityYearCollapsed(game: 'D1' | 'D2', year: string): void {
    const key = this.activityYearCollapseKey(game, year);
    if (this.collapsedActivityYears.has(key)) {
      this.collapsedActivityYears.delete(key);
    } else {
      this.collapsedActivityYears.add(key);
    }
    this.persistActivityCollapseState();
    this.refreshActivitiesTabView();
  }

  private loadActivityCollapseState(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const games = localStorage.getItem(ACTIVITY_COLLAPSE_GAMES_KEY);
      if (games) {
        const parsed = JSON.parse(games) as ('D1' | 'D2')[];
        this.collapsedActivityGames = new Set(parsed.filter(g => g === 'D1' || g === 'D2'));
      }
      const years = localStorage.getItem(ACTIVITY_COLLAPSE_YEARS_KEY);
      if (years) {
        this.collapsedActivityYears = new Set(JSON.parse(years) as string[]);
      }
    } catch {
      // ignore corrupt storage
    }
  }

  private persistActivityCollapseState(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ACTIVITY_COLLAPSE_GAMES_KEY, JSON.stringify([...this.collapsedActivityGames]));
    localStorage.setItem(ACTIVITY_COLLAPSE_YEARS_KEY, JSON.stringify([...this.collapsedActivityYears]));
  }

  private loadActivitiesViewPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const mode = localStorage.getItem(ACTIVITIES_VIEW_MODE_KEY);
      if (mode === 'cards' || mode === 'chronological') {
        this.activitiesViewMode = mode;
      }
      const sort = localStorage.getItem(ACTIVITIES_CHRON_SORT_KEY);
      if (sort === 'oldest' || sort === 'newest') {
        this.activitiesChronologicalSort = sort;
      }
    } catch {
      // ignore corrupt storage
    }
  }

  private persistActivitiesViewPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(ACTIVITIES_VIEW_MODE_KEY, this.activitiesViewMode);
    localStorage.setItem(ACTIVITIES_CHRON_SORT_KEY, this.activitiesChronologicalSort);
  }

  setActivitiesViewMode(mode: ActivitiesViewMode): void {
    if (this.activitiesViewMode === mode) {
      return;
    }
    this.activitiesViewMode = mode;
    this.persistActivitiesViewPreferences();
    this.refreshActivitiesTabView();
  }

  setActivitiesChronologicalSort(sort: ActivitiesChronologicalSort): void {
    if (this.activitiesChronologicalSort === sort) {
      return;
    }
    this.activitiesChronologicalSort = sort;
    this.persistActivitiesViewPreferences();
    this.refreshActivitiesTabView();
  }

  /** OnPush parent + tab child components need an explicit detectChanges for toolbar toggles. */
  private refreshActivitiesTabView(): void {
    this.cdr.detectChanges();
  }

  getChronologicalRowsForYear(yearGroup: YearGroup, game: 'D1' | 'D2'): ChronologicalActivityRow[] {
    const rows: ChronologicalActivityRow[] = [];
    for (const typeGroup of yearGroup.typeGroups ?? []) {
      const isD1 = typeGroup.isD1 ?? game === 'D1';
      for (const activity of typeGroup.activities ?? []) {
        const refId = activity.activityDetails?.referenceId;
        let activityName = this.manifest.getActivityName(refId, isD1);
        if (!activityName || activityName === 'Unknown Activity') {
          activityName =
            this.getMappedActivityName(String(refId)) || typeGroup.name || 'Unknown Activity';
        }
        const version = this.getActivityVersion(activityName);
        const displayName = activityName.includes(': ')
          ? activityName.substring(0, activityName.indexOf(': '))
          : activityName;
        rows.push({
          activity,
          activityName: displayName,
          activityType: typeGroup.type || '',
          version,
          isD1,
          game: activity.game ?? game,
        });
      }
    }
    const dir = this.activitiesChronologicalSort === 'oldest' ? 1 : -1;
    rows.sort((a, b) => {
      const ta = new Date(a.activity.period).getTime();
      const tb = new Date(b.activity.period).getTime();
      if (Number.isNaN(ta) && Number.isNaN(tb)) {
        return 0;
      }
      if (Number.isNaN(ta)) {
        return 1;
      }
      if (Number.isNaN(tb)) {
        return -1;
      }
      return (ta - tb) * dir;
    });
    return rows;
  }

  trackByChronologicalRow(_index: number, row: ChronologicalActivityRow): string {
    const inst = row.activity.activityDetails?.instanceId ?? '';
    return `${row.activity.membershipId}|${inst}|${row.activity.period}`;
  }

  private collectActivityYearKeys(): string[] {
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
    for (const key of this.collectActivityYearKeys()) {
      this.collapsedActivityYears.add(key);
    }
    this.persistActivityCollapseState();
    this.refreshActivitiesTabView();
  }

  expandAllActivityYears(): void {
    for (const key of this.collectActivityYearKeys()) {
      this.collapsedActivityYears.delete(key);
    }
    this.persistActivityCollapseState();
    this.refreshActivitiesTabView();
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

  formatBreakdownLastPlayed(iso?: string): string {
    if (!iso) return '—';
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '—';
      const now = Date.now();
      const diffMs = now - date.getTime();
      if (diffMs < 0) {
        return this.formatDateTime(iso);
      }
      const rtf = new Intl.RelativeTimeFormat(this.locale.intlLocale, { numeric: 'auto' });
      const minutes = Math.floor(diffMs / 60000);
      if (minutes < 60) {
        return rtf.format(-Math.max(1, minutes), 'minute');
      }
      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return rtf.format(-hours, 'hour');
      }
      const days = Math.floor(hours / 24);
      if (days < 14) {
        return rtf.format(-days, 'day');
      }
      const weeks = Math.floor(days / 7);
      if (weeks < 8) {
        return rtf.format(-weeks, 'week');
      }
      const months = Math.floor(days / 30);
      if (months < 24) {
        return rtf.format(-months, 'month');
      }
      const years = Math.floor(days / 365);
      if (years < 3) {
        return rtf.format(-years, 'year');
      }
      return this.formatDateTime(iso);
    } catch {
      return '—';
    }
  }

  private sortBreakdownRows(rows: ActivityCountRow[]): ActivityCountRow[] {
    if (!this.breakdownLastPlayedSort) {
      return rows;
    }
    const dir = this.breakdownLastPlayedSort === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const ta = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
      const tb = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
      if (ta === tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return (ta - tb) * dir;
    });
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
      "Warlord's Ruin": "Warlord's Ruin: Standard",
      
      // Equilibrium variations
      "Equilibrium: Standard": "Equilibrium: Standard",
      "Equilibrium": "Equilibrium: Standard",
      "Equilibrium: Master": "Equilibrium: Master",
      "Equilibrium: Contest": "Equilibrium: Contest",
      "Equilibrium: Epic": "Equilibrium: Epic"
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
      "Vesper's Host", "Sundered Doctrine", "Equilibrium"
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
  getPlatformId(platform: string | undefined): number {
    if (!platform) return 0;
    const p = platform.toLowerCase();
    if (p.includes('xbox')) return 1;
    if (p.includes('playstation') || p.includes('psn') || p.includes('ps')) return 2;
    if (p.includes('steam') || p.includes('pc')) return 3;
    if (p.includes('blizzard') || p.includes('battlenet')) return 4;
    if (p.includes('stadia')) return 5;
    if (p.includes('epic')) return 6;
    return 0;
  }

  /** Short display name for platform tabs (mobile-friendly) */
  getPlatformShortName(platform: string): string {
    if (!platform) return '';
    const p = platform.toLowerCase();
    if (p.includes('xbox')) return 'Xbox';
    if (p.includes('playstation') || p.includes('psn')) return 'PS';
    if (p.includes('steam')) return 'Steam';
    if (p.includes('blizzard') || p.includes('battlenet')) return 'BNet';
    if (p.includes('stadia')) return 'Stadia';
    if (p.includes('epic')) return 'Epic';
    return platform;
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

  handleSearchEnter(event: Event): void {
    event.preventDefault();
    this.addSearchChip();
  }

  addSearchChip(): void {
    const value = (this.searchUsername || '').trim();
    if (!value) {
      return;
    }
    const exists = this.searchChips.some(c => c.toLowerCase() === value.toLowerCase());
    if (!exists) {
      this.searchChips = [...this.searchChips, value];
    }
    this.searchUsername = '';
    this.errorMessage = '';
  }

  removeSearchChip(index: number): void {
    if (index < 0 || index >= this.searchChips.length) return;
    const next = [...this.searchChips];
    next.splice(index, 1);
    this.searchChips = next;
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
   * Guardian Firsts sub-view: show everything or isolate one category to reduce scrolling.
   */
  firstsSectionFilter: 'all' | 'first-ever' | 'story' | 'pantheon-events' | 'raids' | 'dungeons' = 'all';

  get firstsSectionFilterOptions(): { value: string; label: string }[] {
    const base: { value: string; label: string }[] = [
      { value: 'all', label: 'All sections' },
      { value: 'first-ever', label: 'First ever only' },
      { value: 'story', label: 'Story milestones only' },
    ];
    if (this.activeFirstsGame === 'D2') {
      base.push({ value: 'pantheon-events', label: 'Pantheon Events only' });
      base.push({ value: 'raids', label: 'Raids only' });
      base.push({ value: 'dungeons', label: 'Dungeons only' });
    } else {
      base.push({ value: 'raids', label: 'Raids only' });
    }
    return base;
  }

  showFirstsSection(section: 'first-ever' | 'story' | 'pantheon-events' | 'raids' | 'dungeons'): boolean {
    return this.firstsSectionFilter === 'all' || this.firstsSectionFilter === section;
  }

  /**
   * If every selected account is D1 (or all D2), align the Firsts game tab so D1-only users
   * are not stuck on an empty Destiny 2 view.
   */
  syncActiveFirstsGameWithPlayers(): void {
    if (this.selectedPlayers.length === 0) return;
    const allD1 = this.selectedPlayers.every((p) => this.isD1Player(p));
    const allD2 = this.selectedPlayers.every((p) => !this.isD1Player(p));
    if (allD1) {
      this.activeFirstsGame = 'D1';
      if (this.firstsSectionFilter === 'dungeons') {
        this.firstsSectionFilter = 'all';
      }
    } else if (allD2) {
      this.activeFirstsGame = 'D2';
    }
  }

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
      if (game === 'D1' && this.firstsSectionFilter === 'dungeons') {
        this.firstsSectionFilter = 'all';
      }
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

  /** Returns grouped activities filtered by activityFilterPreset for display in Activities tab. When account cards are selected, only those accounts' activities are shown. */
  getDisplayedAccountGroupsForGame(game: 'D1' | 'D2') {
    const base = this.getAccountGroupsForGame(game);
    const preset = this.activityFilterPreset;
    const accountFilter = this.selectedAccountKeysForActivities.size > 0;
    return base.map((g: any) => ({
      ...g,
      yearGroups: g.yearGroups
        .map((yg: any) => ({
          ...yg,
          typeGroups: yg.typeGroups
            .filter((tg: any) => {
              if (preset === 'raids-dungeons') {
                const t = (tg.type || '').toLowerCase();
                return t === 'raid' || t === 'dungeon';
              }
              return true;
            })
            .map((tg: any) => {
              let activities = tg.activities;
              if (accountFilter) {
                activities = activities.filter((a: any) => this.selectedAccountKeysForActivities.has(this.getActivityAccountKey(a)));
              }
              if (preset === 'clears') {
                activities = activities.filter((a: any) => this.isActivityCompleted(a));
              }
              if (preset === 'fails') {
                activities = activities.filter((a: any) => !this.isActivityCompleted(a));
              }
              return activities.length ? { ...tg, activities } : null;
            })
            .filter(Boolean),
        }))
        .filter((yg: any) => yg.typeGroups.length > 0),
    })).filter((g: any) => g.yearGroups.length > 0);
  }

  private isActivityCompleted(activity: any): boolean {
    const v = activity?.values?.completed?.basic?.value;
    return v === 1 || v === true;
  }

  dismissGetStartedBanner(): void {
    this.hideGetStartedBanner = true;
    if (typeof localStorage !== 'undefined') localStorage.setItem(HIDE_GET_STARTED_KEY, 'true');
  }

  /**
   * Season/expansion for the activity list & On This Day sidebar: uses the selected month/day in that calendar year
   * (not July 1), so e.g. March 21 shows the correct season for that date.
   */
  getSeasonForYear(game: 'D1' | 'D2', year: number | string): string | null {
    const y = typeof year === 'string' ? parseInt(year, 10) : year;
    if (Number.isNaN(y)) return null;
    return this.seasonService.getSeasonForDate(game, y, this.selectedMonth, this.selectedDay);
  }

  /** Toggle selection of an activity breakdown card for filtering */
  toggleBreakdownCardSelection(label: string): void {
    if (this.selectedBreakdownCardLabels.has(label)) {
      this.selectedBreakdownCardLabels.delete(label);
    } else {
      this.selectedBreakdownCardLabels.add(label);
    }
    this.selectedBreakdownCardLabels = new Set(this.selectedBreakdownCardLabels);
    this.recomputeBreakdownChartData();
    this.cdr.markForCheck();
  }

  /** Toggle account summary card selection for filtering Activities tab by account. */
  onAccountSummaryCardToggle(accountKey: string): void {
    if (this.selectedAccountKeysForActivities.has(accountKey)) {
      this.selectedAccountKeysForActivities.delete(accountKey);
    } else {
      this.selectedAccountKeysForActivities.add(accountKey);
    }
    this.selectedAccountKeysForActivities = new Set(this.selectedAccountKeysForActivities);
    this.cdr.markForCheck();
  }

  /** Unique key for an activity (game-platform-membershipId) to match per-platform cards. */
  getActivityAccountKey(activity: { game?: string; membershipId?: string; membershipType?: number }): string {
    const game = activity.game || 'D2';
    const platform = this.getPlatformName(activity.membershipType ?? 0);
    const mid = activity.membershipId ?? '';
    return `${game}-${platform}-${mid}`;
  }

  /** Unique key for a player (game-platform-membershipId) to match per-platform account cards. */
  getAccountKeyForPlayer(pl: { game?: string; membershipId?: string; membershipType?: number }): string {
    const game = pl.game || 'D2';
    const platform = this.getPlatformName(pl.membershipType ?? 0);
    const mid = pl.membershipId ?? '';
    return `${game}-${platform}-${mid}`;
  }

  /** Whether the Activities tab is filtering by selected account cards (at least one card selected). */
  get hasAccountFilterForActivities(): boolean {
    return this.selectedAccountKeysForActivities.size > 0;
  }

  /** Whether a breakdown card is selected */
  isBreakdownCardSelected(label: string): boolean {
    return this.selectedBreakdownCardLabels.has(label);
  }

  /** Filtered groups for display: when cards are selected, only those; otherwise all */
  get filteredActivityBreakdownGroups(): { type: string; label: string; game?: 'D1' | 'D2'; rows: ActivityCountRow[] }[] {
    if (!this.activityBreakdownGroups?.length) return [];
    const base = this.selectedBreakdownCardLabels.size === 0
      ? this.activityBreakdownGroups
      : this.activityBreakdownGroups.filter(g => this.selectedBreakdownCardLabels.has(g.label));
    if (!this.breakdownLastPlayedSort) {
      return base;
    }
    return base.map(g => ({
      ...g,
      rows: this.sortBreakdownRows(g.rows)
    }));
  }

  /** Unique platform names across selected players for Breakdown tab (All vs per-account). */
  get breakdownPlatformTabs(): string[] {
    if (!this.selectedPlayers?.length) return [];
    const platforms = this.selectedPlayers.map(p => this.getPlatformName(p.membershipType));
    return Array.from(new Set(platforms));
  }

  /** Membership IDs to load for the current Breakdown view: when account cards are selected, only those; otherwise all. */
  getBreakdownMembershipIds(): string[] {
    if (!this.selectedPlayers?.length) return [];
    if (this.selectedAccountKeysForBreakdown.size > 0) {
      return Array.from(
        new Set(
          this.selectedPlayers
            .filter(p => this.selectedAccountKeysForBreakdown.has(this.getAccountKeyForPlayer(p)))
            .map(p => p.membershipId)
        )
      );
    }
    return Array.from(new Set(this.selectedPlayers.map(p => p.membershipId)));
  }

  /** Toggle account card selection for Breakdown tab; reloads breakdown data. */
  async onBreakdownAccountCardToggle(accountKey: string): Promise<void> {
    if (this.selectedAccountKeysForBreakdown.has(accountKey)) {
      this.selectedAccountKeysForBreakdown.delete(accountKey);
    } else {
      this.selectedAccountKeysForBreakdown.add(accountKey);
    }
    this.selectedAccountKeysForBreakdown = new Set(this.selectedAccountKeysForBreakdown);

    // When selection is single-game, lock chart game filter to that game; otherwise show all.
    const selectedGames = this.getBreakdownSelectedGames();
    if (selectedGames.length === 1) {
      this.breakdownChartGame = selectedGames[0];
    } else if (selectedGames.length === 0) {
      this.breakdownChartGame = 'all';
    } else {
      // Mixed selection across D1 and D2
      this.breakdownChartGame = 'all';
    }

    this.cdr.markForCheck();
    if (this.selectedPlayers.length > 0) {
      await this.loadActivityBreakdown();
    }
  }

  /** Toggle account card selection for Guardian Firsts tab. */
  onFirstsAccountCardToggle(accountKey: string): void {
    if (this.selectedAccountKeysForFirsts.has(accountKey)) {
      this.selectedAccountKeysForFirsts.delete(accountKey);
    } else {
      this.selectedAccountKeysForFirsts.add(accountKey);
    }
    this.selectedAccountKeysForFirsts = new Set(this.selectedAccountKeysForFirsts);
    this.cdr.markForCheck();
  }

  /** Players to show in Guardian Firsts view: all when no cards selected, else only selected accounts. */
  getFirstsFilteredPlayers(): PlayerSearchDisplay[] {
    if (!this.selectedPlayers?.length) return [];
    if (this.selectedAccountKeysForFirsts.size === 0) return this.selectedPlayers;
    return this.selectedPlayers.filter(p => this.selectedAccountKeysForFirsts.has(this.getAccountKeyForPlayer(p)));
  }

  /**
   * Rough "weight" of how much Guardian Firsts content a player has.
   * Used only for layout purposes to pick the primary (full-width) card.
   */
  getFirstsWeightForPlayer(player: PlayerSearchDisplay): number {
    if (!player) return 0;
    const list = this.guardianFirstsMap[this.getPlayerKey(player)] || [];
    return list.length;
  }

  /**
   * Split filtered players into a primary (most content) and secondary list.
   * When there is only one player, they become the primary and secondary is empty.
   */
  getFirstsPrimaryAndSecondary(): { primary: PlayerSearchDisplay | null; secondary: PlayerSearchDisplay[] } {
    const players = this.getFirstsFilteredPlayers();
    if (!players.length) {
      return { primary: null, secondary: [] };
    }
    const sorted = [...players].sort((a, b) => this.getFirstsWeightForPlayer(b) - this.getFirstsWeightForPlayer(a));
    const [primary, ...secondary] = sorted;
    return { primary, secondary };
  }

  /**
   * Comparison-friendly grouping for Guardian Firsts.
   * When a small number of accounts are selected (≤ 3), we want to lay them out
   * side-by-side by game (D2 first, then D1) and, within each game, by platform.
   */
  getFirstsComparisonGroups(): Array<{ game: 'D1' | 'D2'; players: PlayerSearchDisplay[] }> {
    const players = this.getFirstsFilteredPlayers();
    if (!players.length) return [];

    const byGame = new Map<'D1' | 'D2', PlayerSearchDisplay[]>();
    for (const p of players) {
      const game: 'D1' | 'D2' = p.game || 'D2';
      if (!byGame.has(game)) {
        byGame.set(game, []);
      }
      byGame.get(game)!.push(p);
    }

    const gameOrder: Array<'D1' | 'D2'> = ['D2', 'D1'];
    const result: Array<{ game: 'D1' | 'D2'; players: PlayerSearchDisplay[] }> = [];

    for (const game of gameOrder) {
      const groupPlayers = byGame.get(game);
      if (!groupPlayers || groupPlayers.length === 0) continue;

      const sortedPlayers = [...groupPlayers].sort((a, b) => {
        const platformA = a.platform || this.getPlatformName(a.membershipType);
        const platformB = b.platform || this.getPlatformName(b.membershipType);
        const platformCompare = platformA.localeCompare(platformB);
        if (platformCompare !== 0) return platformCompare;
        return a.displayName.localeCompare(b.displayName);
      });

      result.push({ game, players: sortedPlayers });
    }

    return result;
  }

  /** Games represented by the currently selected Breakdown account cards. Empty = both games allowed. */
  private getBreakdownSelectedGames(): ('D1' | 'D2')[] {
    if (!this.perPlatformStats?.length || this.selectedAccountKeysForBreakdown.size === 0) {
      return [];
    }
    const set = new Set<'D1' | 'D2'>();
    for (const s of this.perPlatformStats) {
      if (this.selectedAccountKeysForBreakdown.has(s.accountKey)) {
        set.add(s.game);
      }
    }
    return Array.from(set);
  }

  /** Summary cards for Activity Breakdown: aggregated stats per category */
  get activityBreakdownSummaryCards(): { label: string; runs: number; clears: number; timeSeconds: number; clearRate: number }[] {
    if (!this.activityBreakdownGroups?.length) return [];
    return this.activityBreakdownGroups.map(g => {
      const runs = g.rows.reduce((s, r) => s + (r.runs ?? 0), 0);
      const clears = g.rows.reduce((s, r) => s + (r.clears ?? 0), 0);
      const timeSeconds = g.rows.reduce((s, r) => s + (r.timeSeconds ?? 0), 0);
      return {
        label: g.label,
        runs,
        clears,
        timeSeconds,
        clearRate: runs > 0 ? (clears / runs) * 100 : 0,
      };
    });
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
   * Group a list of activities by account (membershipId + game) so the UI
   * can render clear subsections per account within each activity type.
   */
  getActivitiesGroupedByAccount(
    activities: ActivityWithMembership[]
  ): Array<{ membershipId: string; membershipType: number; displayName: string; platform: string; activities: ActivityWithMembership[] }> {
    const accountMap = new Map<string, { membershipId: string; membershipType: number; displayName: string; platform: string; activities: ActivityWithMembership[] }>();
    for (const activity of activities) {
      const key = `${activity.membershipId}|${activity.game}`;
      if (!accountMap.has(key)) {
        const displayName = (activity as any)?.displayName || 'Unknown Player';
        const platformName = activity.platform || this.getPlatformName(activity.membershipType || 0);
        accountMap.set(key, {
          membershipId: activity.membershipId,
          membershipType: activity.membershipType || 0,
          displayName,
          platform: platformName,
          activities: []
        });
      }
      accountMap.get(key)!.activities.push(activity);
    }
    // Stable ordering by display name, then platform
    const groups = Array.from(accountMap.values());
    groups.sort((a, b) => {
      const nameCmp = a.displayName.localeCompare(b.displayName);
      if (nameCmp !== 0) return nameCmp;
      return a.platform.localeCompare(b.platform);
    });
    return groups;
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
  async exportBreakdownToExcel(): Promise<void> {
    if (!this.activityBreakdownGroups?.length || !this.activityBreakdownSummaryCards?.length) {
      console.warn('[Export] No breakdown data to export');
      return;
    }
    try {
      await this.exportService.exportActivityBreakdownToExcel({
        summaryCards: this.filteredActivityBreakdownSummaryCards,
        groups: this.filteredActivityBreakdownGroups.map(g => ({
          label: g.label,
          rows: g.rows.map(r => ({
            baseName: r.baseName,
            variantName: r.variantName || '',
            game: r.game,
            runs: r.runs,
            clears: r.clears,
            fails: r.fails,
            timeSeconds: r.timeSeconds
          }))
        })),
        formatTime: (s: number) => this.formatSecondsToHoursMinutes(s)
      });
    } catch (err) {
      console.error('Failed to export activity breakdown:', err);
      alert('Failed to export. Please try again.');
    }
  }

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
      titleService: this.titleService,
      breakdownSummary: this.activityBreakdownSummaryCards,
      breakdownGroups: this.activityBreakdownGroups.map(g => ({
        label: g.label,
        rows: g.rows.map(r => ({
          baseName: r.baseName,
          variantName: r.variantName || '',
          game: r.game,
          runs: r.runs,
          clears: r.clears,
          fails: r.fails,
          timeSeconds: r.timeSeconds
        }))
      })),
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
  async loadActivityBreakdown(): Promise<void> {
    if (this.selectedPlayers.length === 0) return;
    this.loadingActivityBreakdown = true;
    this.activityBreakdownRows = null;
    this.activityBreakdownGroups = [];
    this.selectedBreakdownCardLabels = new Set();
    this.cdr.markForCheck();
    try {
      const membershipIds = this.getBreakdownMembershipIds();
      if (membershipIds.length === 0) return;
      this.activityBreakdownService.clearActivityCountsCache();
      const rows = await this.activityBreakdownService.getActivityCounts(membershipIds);

      // When specific account cards are selected, restrict Breakdown to the games (D1/D2)
      // represented by those accounts so a D1-only selection does not include D2 time.
      let effectiveRows = rows;
      const selectedGames = this.getBreakdownSelectedGames();
      if (selectedGames.length > 0) {
        const allowed = new Set(selectedGames);
        effectiveRows = rows.filter(r => !r.game || allowed.has(r.game));
      }

      this.activityBreakdownRows = effectiveRows;
      this.activityBreakdownGroups = this.activityBreakdownService.groupRowsByType(effectiveRows);
      this.recomputeBreakdownChartData();
      this.logBreakdownDebug('loadActivityBreakdown');
    } catch (err) {
      console.error('[ActivityBreakdown] Failed to load', err);
      this.activityBreakdownRows = [];
      this.activityBreakdownGroups = [];
    } finally {
      this.loadingActivityBreakdown = false;
      this.cdr.markForCheck();
    }
  }

  async onTabChange(tab: 'activities' | 'firsts' | 'titles' | 'breakdown') {
    this.activeTab = tab;
    if (tab === 'firsts' && this.selectedPlayers.length > 0) {
      this.syncActiveFirstsGameWithPlayers();
      this.updatePlatformTabs();
    }
    if (tab === 'breakdown' && this.selectedPlayers.length > 0) {
      await this.loadActivityBreakdown();
    }
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
                  icon: (isGilded && gildedIcon) ? gildedIcon : (node.displayProperties?.icon ? this.assetUrl.resolve(node.displayProperties.icon) : null),
                  completed: isCompleted,
                  isGilded,
                  timesGilded: (isCompleted && timesGilded > 0) ? timesGilded : undefined,
                  gildedIcon: (isGilded && gildedIcon) ? gildedIcon : undefined,
                  locked: !isCompleted,
                  missingRecord: !record,
                  altIcon: (() => {
                    const frames = node.iconSequences && node.iconSequences[1] && node.iconSequences[1].frames;
                    if (frames && frames.length > 0) {
                      return this.assetUrl.resolve(frames[frames.length - 1]); // grey/silver variant
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
      // Trigger Account Summary recalculation now that titles are loaded
      this.statsDebounce$.next();
      this.cdr.detectChanges();
    }
  }

  /**
   * Loads titles for a single player in the background (non-blocking).
   * Used to proactively populate titles for Account Summary accuracy.
   */
  private async loadTitlesForPlayer(player: PlayerSearchDisplay): Promise<void> {
    if (this.isD1Player(player)) return; // D1 has no titles
    
    const pKey = this.getPlayerKey(player);
    
    // Skip if already loaded
    if (this.playerTitles[pKey]) return;
    
    try {
      if (!this.manifest.isLoadedSync) {
        await this.manifest.isLoaded().toPromise();
      }
      
      const presentationNodes = this.manifest.getPresentationNodes();
      const titleParentHashes = [616318467, 1881970629]; // Current and Legacy Titles
      let allTitleNodes: any[] = [];
      for (const parentHash of titleParentHashes) {
        const parentNode = presentationNodes[parentHash];
        if (!parentNode?.children?.presentationNodes) continue;
        allTitleNodes.push(...parentNode.children.presentationNodes.map((n: any) => presentationNodes[n.presentationNodeHash]).filter(Boolean));
      }
      
      // Get player records
      const response = await firstValueFrom(this.bungieService.getPlayerTitles(player.membershipType, player.membershipId));
      const records = response.Response?.profileRecords?.data?.records || {};
      const charRecords = response.Response?.characterRecords?.data as { [characterId: string]: { records?: { [key: string]: TitleRecord } } } || {};
      
      // Build title list (same logic as onTabChange)
      const titleMap: { [key: string]: any } = {};
      for (const node of allTitleNodes) {
        if (!node?.completionRecordHash) continue;
        
        let record = records[node.completionRecordHash];
        if (!record) {
          for (const charId of Object.keys(charRecords)) {
            const charRecordObj = charRecords[charId];
            if (charRecordObj?.records && charRecordObj.records[node.completionRecordHash]) {
              record = charRecordObj.records[node.completionRecordHash];
              break;
            }
          }
        }
        
        const recordDef = this.manifest.getTitleDefs()[node.completionRecordHash];
        const special = SPECIAL_TITLES[node.completionRecordHash] || SPECIAL_TITLES[node.hash];
        let displayName = special ? special.name : (recordDef?.titleInfo?.titlesByGender?.Male || node.displayProperties?.name || 'Unknown');
        const normalizedName = this.normalizeTitleName(displayName);
        const isCompleted = record ? ((record.state & 1) !== 0) : false;
        
        // Gilding logic
        let isGilded = false;
        let timesGilded = 0;
        let gildedIcon: string | undefined;
        const gildingTrackingHash = special?.gildingTrackingRecordHash || recordDef?.titleInfo?.gildingTrackingRecordHash;
        if (gildingTrackingHash && isCompleted) {
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
            if (isGilded && this.GILDED_SEAL_IMAGE_MAP[normalizedName]) {
              gildedIcon = this.GILDED_SEAL_IMAGE_MAP[normalizedName];
            }
          }
        }
        
        // Progress calculation
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
        
        const uniqueKey = `${displayName}#${node.completionRecordHash}`;
        if (!titleMap[uniqueKey]) {
          titleMap[uniqueKey] = {
            hash: node.completionRecordHash,
            name: displayName,
            icon: (isGilded && gildedIcon) ? gildedIcon : (node.displayProperties?.icon ? this.assetUrl.resolve(node.displayProperties.icon) : null),
            completed: isCompleted,
            isGilded,
            timesGilded: (isCompleted && timesGilded > 0) ? timesGilded : undefined,
            gildedIcon: (isGilded && gildedIcon) ? gildedIcon : undefined,
            locked: !isCompleted,
            missingRecord: !record,
            altIcon: (() => {
              const frames = node.iconSequences && node.iconSequences[1] && node.iconSequences[1].frames;
              if (frames && frames.length > 0) {
                return this.assetUrl.resolve(frames[frames.length - 1]);
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
      
      const allTitles = Object.values(titleMap);
      const completed = allTitles.filter((t: any) => t.completed).sort((a: any, b: any) => a.name.localeCompare(b.name));
      const locked = allTitles.filter((t: any) => !t.completed).sort((a: any, b: any) => a.name.localeCompare(b.name));
      this.playerTitles[pKey] = [...completed, ...locked];
      
      // Rebuild aggregatedTitles and trigger stats recalculation
      this.aggregatedTitles = this.titleService.aggregateTitles(
        this.selectedPlayers as any,
        this.playerTitles as any
      );
      this.statsDebounce$.next();
      
    } catch (err) {
      console.warn('[loadTitlesForPlayer] Failed to load titles for player', player.membershipId, err);
      // Store empty list on failure so downstream code can safely iterate
      this.playerTitles[pKey] = [];
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
        activityBreakdown: {
          summaryCards: this.activityBreakdownSummaryCards,
          groups: this.activityBreakdownGroups,
          filters: {
            selectedAccountKeys: Array.from(this.selectedAccountKeysForBreakdown || []),
            selectedCardLabels: Array.from(this.selectedBreakdownCardLabels || []),
            chartGame: this.breakdownChartGame,
            chartCategory: this.breakdownChartCategory,
          }
        },
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
        includeBreakdown: true,
        showIconsInline: false
      };

      await this.exportService.exportMultiSheet(exportOptions, {
        selectedPlayers: this.selectedPlayers,
        activityDb: this.activityDb,
        manifestService: this.manifest,
        characters: this.characters,
        getPlayerKey: this.getPlayerKey.bind(this),
        titleService: this.titleService,
        breakdownSummary: this.activityBreakdownSummaryCards,
        breakdownGroups: this.activityBreakdownGroups.map(g => ({
          label: g.label,
          rows: g.rows.map(r => ({
            baseName: r.baseName,
            variantName: r.variantName || '',
            game: r.game,
            runs: r.runs,
            clears: r.clears,
            fails: r.fails,
            timeSeconds: r.timeSeconds
          }))
        })),
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

  /** Expose for template: show progress while D1 PGCR prefetch runs in the background. */
  get pgcrPrefetchProgress$() {
    return this.activityDb.pgcrPrefetchProgress$;
  }

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
    // Exclude Pantheon from the regular D2 raid list; it has its own card
    const raids = this.getPlayerRaids(player, 'D2').filter(raid =>
      !raid.name.includes('Pantheon')
    );
    const groups = this.groupRaidsByBaseName(raids, 'D2');
    return this.sortGroupsByReleaseOrder(groups, 'D2', 'raid');
  }

  getPlayerD2DungeonVariants(player: any): Array<{ 
    baseName: string; 
    variants: Array<{ 
      version: string; 
      first?: ActivityFirstCompletion; 
      hasClear: boolean;
    }>;
  }> {
    // Exclude Rite of the Nine variants; they have their own card
    const dungeons = this.getPlayerDungeons(player, 'D2').filter(dungeon =>
      !(
        (dungeon.name.includes('Ghosts of the Deep') ||
         dungeon.name.includes('Spire of the Watcher') ||
         dungeon.name.includes('Prophecy')) &&
        (dungeon.name.includes('Explorer') ||
         dungeon.name.includes('Eternity') ||
         dungeon.name.includes('Ultimatum'))
      )
    );
    const groups = this.groupRaidsByBaseName(dungeons, 'D2');
    return this.sortGroupsByReleaseOrder(groups, 'D2', 'dungeon');
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
    const groups = this.groupRaidsByBaseName(raids, 'D1');
    return this.sortGroupsByReleaseOrder(groups, 'D1', 'raid');
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
    // Get directly from aggregateGuardianFirsts since getAggregateDungeons filters them out
    const allDungeonFirsts = this.aggregateGuardianFirsts.filter(f => f.game === 'D2' && f.type === 'dungeon');
    const earliest = this.getEarliestFirsts(allDungeonFirsts);
    const dungeons = earliest.filter(dungeon =>
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

    if (!dungeons.length) {
      return [];
    }

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

  /** Desired release-order sequences for raids and dungeons, used for per-account ordering. */
  private readonly D1_RAID_RELEASE_ORDER: string[] = [
    'Vault of Glass',
    'Crota\'s End',
    'King\'s Fall',
    'Wrath of the Machine'
  ];

  private readonly D2_RAID_RELEASE_ORDER: string[] = [
    'Leviathan',
    'Leviathan, Eater of Worlds',
    'Leviathan, Spire of Stars',
    'Last Wish',
    'Scourge of the Past',
    'Crown of Sorrow',
    'Garden of Salvation',
    'Deep Stone Crypt',
    'Vault of Glass',
    'Vow of the Disciple',
    'King\'s Fall',
    'Root of Nightmares',
    'Crota\'s End',
    'Salvation\'s Edge',
    'The Desert Perpetual'
  ];

  private readonly D2_DUNGEON_RELEASE_ORDER: string[] = [
    'The Shattered Throne',
    'Pit of Heresy',
    'Prophecy',
    'Grasp of Avarice',
    'Duality',
    'Spire of the Watcher',
    'Ghosts of the Deep',
    'Warlord\'s Ruin',
    'Vesper\'s Host',
    'Sundered Doctrine',
    'Equilibrium'
  ];

  /**
   * Sorts grouped raids/dungeons into a specific release order for display.
   * Unknown names fall to the end, sorted alphabetically.
   */
  private sortGroupsByReleaseOrder(
    groups: Array<{ baseName: string; variants: any[] }>,
    game: 'D1' | 'D2',
    kind: 'raid' | 'dungeon'
  ): Array<{ baseName: string; variants: any[] }> {
    let order: string[] | null = null;
    if (game === 'D1' && kind === 'raid') {
      order = this.D1_RAID_RELEASE_ORDER;
    } else if (game === 'D2' && kind === 'raid') {
      order = this.D2_RAID_RELEASE_ORDER;
    } else if (game === 'D2' && kind === 'dungeon') {
      order = this.D2_DUNGEON_RELEASE_ORDER;
    }

    if (!order) {
      return groups;
    }

    const index = new Map<string, number>();
    order.forEach((name, i) => index.set(name, i));

    return [...groups].sort((a, b) => {
      const ia = index.has(a.baseName) ? index.get(a.baseName)! : -1;
      const ib = index.has(b.baseName) ? index.get(b.baseName)! : -1;

      const aKnown = ia !== -1;
      const bKnown = ib !== -1;

      // Known raids/dungeons (with explicit order) should come first,
      // with MOST RECENT (highest index) at the top.
      if (aKnown && bKnown) {
        if (ia !== ib) return ib - ia; // newer (larger index) first
        return a.baseName.localeCompare(b.baseName);
      }

      // If only one is known, put the known one first.
      if (aKnown && !bKnown) return -1;
      if (!aKnown && bKnown) return 1;

      // If both are unknown, fall back to alphabetical.
      return a.baseName.localeCompare(b.baseName);
    });
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

  private async hydrateFromOfflineArchive(): Promise<void> {
    const manifest = this.archiveRuntime.archiveManifest;
    if (!manifest?.accounts?.length) {
      return;
    }
    this.apiAvailable = false;
    this.bungieUnavailable = true;
    await this.archiveRuntime.preloadMedia();
    await this.loadFavorites();
    const players: PlayerSearchDisplay[] = manifest.accounts.map((acct) => ({
      membershipId: acct.membershipId,
      membershipType: acct.membershipType,
      displayName: acct.displayName,
      platform: acct.platform,
      game: acct.game,
      iconPath: acct.iconPath ? this.assetUrl.resolve(acct.iconPath) : undefined,
    }));
    for (const player of players) {
      const playerKey = this.getPlayerKey(player);
      await this.showCachedDataInstantly(player, playerKey);
    }
    this.selectedPlayers = players;
    this.loadingActivities[this.selectedDate] = false;
    this.cdr.detectChanges();
  }

  async saveForOfflineOnDevice(includePgcr = true): Promise<void> {
    if (this.selectedPlayers.length === 0) {
      this.errorMessage = this.uiI18n.t('archive.needProfiles');
      return;
    }
    this.archiveExporting = true;
    this.archiveProgressMessage = this.uiI18n.t('archive.exportStarting');
    this.archiveProgressPercent = 0;
    this.cdr.detectChanges();
    try {
      const accounts: ArchiveAccount[] = this.selectedPlayers.map((p) => ({
        membershipId: p.membershipId,
        membershipType: p.membershipType,
        displayName: p.displayName,
        platform: p.platform,
        game: p.game as 'D1' | 'D2',
        iconPath: p.iconPath,
      }));
      await this.archiveService.prepareDeviceForOffline(accounts, {
        includePgcr,
        onProgress: (message, percent) => {
          this.archiveProgressMessage = message;
          this.archiveProgressPercent = percent;
          this.cdr.detectChanges();
        },
      });
      await this.archiveRuntime.preloadMedia();
      this.apiAvailable = false;
      this.bungieUnavailable = true;
      this.showOfflineDeviceReady = true;
      this.dismissOfflineDeviceReady = false;
      await this.loadAllFilteredActivities(true);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[Archive] prepare device failed', err);
      this.errorMessage = this.uiI18n.t('archive.exportFailed');
    } finally {
      this.archiveExporting = false;
      this.cdr.detectChanges();
    }
  }

  async buildOfflineArchive(includePgcr = true): Promise<void> {
    if (this.selectedPlayers.length === 0) {
      this.errorMessage = this.uiI18n.t('archive.needProfiles');
      return;
    }
    this.archiveExporting = true;
    this.archiveProgressMessage = this.uiI18n.t('archive.exportStarting');
    this.archiveProgressPercent = 0;
    this.cdr.detectChanges();
    try {
      const accounts: ArchiveAccount[] = this.selectedPlayers.map((p) => ({
        membershipId: p.membershipId,
        membershipType: p.membershipType,
        displayName: p.displayName,
        platform: p.platform,
        game: p.game as 'D1' | 'D2',
        iconPath: p.iconPath,
      }));
      await this.archiveService.exportArchive(accounts, {
        includePgcr,
        onProgress: (message, percent) => {
          this.archiveProgressMessage = message;
          this.archiveProgressPercent = percent;
          this.cdr.detectChanges();
        },
      });
    } catch (err) {
      console.error('[Archive] export failed', err);
      this.errorMessage = this.uiI18n.t('archive.exportFailed');
    } finally {
      this.archiveExporting = false;
      this.cdr.detectChanges();
    }
  }

  async updateOfflineArchive(): Promise<void> {
    const manifest = this.archiveRuntime.archiveManifest;
    const accounts: ArchiveAccount[] = (manifest?.accounts?.length
      ? manifest.accounts
      : this.selectedPlayers.map((p) => ({
          membershipId: p.membershipId,
          membershipType: p.membershipType,
          displayName: p.displayName,
          platform: p.platform,
          game: p.game as 'D1' | 'D2',
          iconPath: p.iconPath,
        })));
    this.archiveExporting = true;
    try {
      await this.archiveService.updateArchive(accounts, manifest, {
        includePgcr: manifest?.includePgcr ?? true,
        onProgress: (message, percent) => {
          this.archiveProgressMessage = message;
          this.archiveProgressPercent = percent;
          this.cdr.detectChanges();
        },
      });
    } finally {
      this.archiveExporting = false;
      this.cdr.detectChanges();
    }
  }

  async onArchiveFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      this.archiveExporting = true;
      this.archiveProgressMessage = this.uiI18n.t('archive.importStarting');
      await this.archiveService.importArchive(file);
      await this.archiveRuntime.preloadMedia();
      await this.hydrateFromOfflineArchive();
      this.showOfflineDeviceReady = true;
      this.dismissOfflineDeviceReady = false;
    } catch (err) {
      console.error('[Archive] import failed', err);
      this.errorMessage = this.uiI18n.t('archive.importFailed');
    } finally {
      this.archiveExporting = false;
      input.value = '';
      this.cdr.detectChanges();
    }
  }

  exitOfflineArchive(): void {
    this.archiveService.exitOfflineMode();
    this.showOfflineDeviceReady = false;
    window.location.reload();
  }

  dismissOfflineReadyBanner(): void {
    this.dismissOfflineDeviceReady = true;
    this.cdr.detectChanges();
  }

  toggleArchiveBackupOptions(): void {
    this.showArchiveBackupOptions = !this.showArchiveBackupOptions;
    this.cdr.detectChanges();
  }

  triggerArchiveImport(): void {
    document.getElementById('archive-import-input')?.click();
  }

  /** While in offline mode: reach out to Bungie, sync archived accounts, refresh archive in place. */
  async checkForArchiveUpdates(): Promise<void> {
    const manifest = this.archiveRuntime.archiveManifest;
    if (!manifest?.accounts?.length) {
      this.errorMessage = this.uiI18n.t('archive.needProfiles');
      return;
    }

    this.archiveExporting = true;
    this.archiveProgressMessage = this.uiI18n.t('archive.checkingUpdates');
    this.archiveProgressPercent = 0;
    this.archiveRuntime.beginOnlineSyncSession();
    this.cdr.detectChanges();

    try {
      await this.manifest.refreshManifest();
      const reachable = await this.archiveService.isBungieReachable();
      if (!reachable) {
        this.errorMessage = this.uiI18n.t('archive.bungieOffline');
        return;
      }

      const players: PlayerSearchDisplay[] = manifest.accounts.map((acct) => ({
        membershipId: acct.membershipId,
        membershipType: acct.membershipType,
        displayName: acct.displayName,
        platform: acct.platform,
        game: acct.game,
        iconPath: acct.iconPath ? this.assetUrl.resolve(acct.iconPath) : undefined,
      }));

      let step = 0;
      for (const player of players) {
        step++;
        this.archiveProgressMessage = `${this.uiI18n.t('archive.syncingAccount')} ${player.displayName}…`;
        this.archiveProgressPercent = Math.round((step / (players.length + 2)) * 40);
        this.cdr.detectChanges();
        await this.loadCharacterHistory(player);
      }

      const hasNew = await this.archiveService.hasActivitiesSince(manifest.lastSyncedAt);
      if (!hasNew) {
        this.archiveProgressMessage = this.uiI18n.t('archive.upToDate');
        this.archiveProgressPercent = 100;
        return;
      }

      await this.archiveService.prepareDeviceForOffline(manifest.accounts, {
        includePgcr: manifest.includePgcr,
        onProgress: (message, percent) => {
          this.archiveProgressMessage = message;
          this.archiveProgressPercent = 40 + Math.round(percent * 0.55);
          this.cdr.detectChanges();
        },
      });
      await this.archiveRuntime.preloadMedia();
      await this.hydrateFromOfflineArchive();
      this.showOfflineDeviceReady = true;
      this.archiveProgressMessage = this.uiI18n.t('archive.updateSuccess');
      this.archiveProgressPercent = 100;
    } catch (err) {
      console.error('[Archive] check for updates failed', err);
      this.errorMessage = this.uiI18n.t('archive.updateFailed');
    } finally {
      this.archiveRuntime.endOnlineSyncSession();
      this.archiveExporting = false;
      this.cdr.detectChanges();
    }
  }

}