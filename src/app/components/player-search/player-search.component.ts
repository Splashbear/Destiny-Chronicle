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
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { TimezoneService } from '../../services/timezone.service';
import { ActivityIconService } from '../../services/activity-icon.service';
import { ActivityFirstCompletion, GuardianFirsts, RAID_NAMES } from '../../models/guardian-firsts.model';
import type { ActivityIconType } from '../../services/activity-icon.service';

interface ActivityEntry {
  game: string;
  platform: string;
  player: PlayerSearchResult;
  activities: ActivityHistory[];
}

interface ActivityWithMembership extends ActivityHistory {
  membershipId: string;
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  iconPath?: string;
}

interface TypeGroup {
  type: string;
  icon: string;
  activities: ActivityWithMembership[];
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
type PlayerSearchDisplay = PlayerSearchResult & { game: 'D1' | 'D2'; platform: string };

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

export function isPvP(mode: number): boolean {
  return [5, 10, 12, 15, 19, 24, 25, 28, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53].includes(mode);
}

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
  showPlatformPicker: boolean = false;
  crossSavePlayer: PlayerSearchDisplay | null = null;
  loadingActivities: { [key: string]: boolean } = {};
  groupedActivitiesByAccount: any[] = [];
  private processedActivities: YearGroup[] = [];
  loadingProgress: LoadingProgress | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private activityCache: Map<string, ActivityCache> = new Map();
  private filteredActivitiesCache: Map<string, ActivityWithMembership[]> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  private filteredActivities$ = new BehaviorSubject<ActivityHistory[]>([]);
  loadingAccountStats = false;
  accountStats: {
    totalTime: number;
    totalActivityTime: number;
    totalActivityCount: number;
    perType: { [type: string]: { count: number, time: number } };
  } = {
    totalTime: 0,
    totalActivityTime: 0,
    totalActivityCount: 0,
    perType: {}
  };
  private filteredActivitiesForDate: ActivityWithMembership[] = [];
  private currentLoadToken = 0;
  private readonly PGCR_BATCH_SIZE = 30; // Increased from 10 to 30 for better parallelization
  private readonly VALIDATION_DELAY = 50; // Reduced from 100ms to 50ms
  guardianFirsts: ActivityFirstCompletion[] = [];
  loadingGuardianFirsts = false;
  readonly guardianGames: ('D1' | 'D2')[] = ['D1', 'D2'];
  favoriteAccounts: FavoriteAccount[] = [];
  apiAvailable: boolean = true;
  dbReady: boolean = false;

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef,
    private activityCacheService: ActivityCacheService,
    private pgcrCacheService: PGCRCacheService,
    private activityDb: ActivityDbService,
    private timezoneService: TimezoneService,
    private activityIconService: ActivityIconService
  ) {
    (window as any).activityDbService = this.activityDb;
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
    if (!searchTerm) return;

    const key = `d1-${membershipType}-${searchTerm}`;
    this.loading[key] = true;
    this.error[key] = '';

    try {
      const results = await firstValueFrom(this.bungieService.searchD1Player(searchTerm, membershipType));
      if (results && results.length > 0) {
        for (const player of results) {
          await this.selectPlayer(player);
        }
      } else {
        this.error[key] = 'No players found';
      }
    } catch (error: any) {
      console.error('Error searching D1 player:', error);
      if (error.status === 503) {
        this.error[key] = 'Bungie API is temporarily unavailable. Please try again in a few minutes.';
      } else {
        this.error[key] = 'Error searching for player';
      }
    } finally {
      this.loading[key] = false;
    }
  }

  async searchD2Player(searchTerm: string) {
    console.log('searchD2Player called', { searchTerm });
    if (!searchTerm) return;
    const key = `d2-${searchTerm}`;
    this.loading[key] = true;
    this.error[key] = '';
    this.d2SearchResults = [];
    this.showPlatformPicker = false;
    this.crossSavePlayer = null;
    try {
      const response = await firstValueFrom(this.bungieService.searchD2Player(searchTerm));
      console.log('D2 search response:', response);
      if (response?.ErrorCode === 1 && response?.Response?.length > 0) {
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
      } else {
        this.errorMessage = 'No Destiny 2 player found with that username.';
        throw new Error('No player found');
      }
    } catch (error: any) {
      console.error('Error searching D2 player:', error);
      if (error.status === 503) {
        this.errorMessage = 'Bungie API is temporarily unavailable. Please try again in a few minutes.';
      } else {
        this.errorMessage = 'Error searching for Destiny 2 player.';
      }
      throw error; // Re-throw to be handled by addPlayer
    } finally {
      this.loading[key] = false;
    }
  }

  selectPlatformPlayer(player: PlayerSearchDisplay) {
    this.showPlatformPicker = false;
    console.log('[DEBUG] selectPlatformPlayer:', player);
    this.selectPlayer(player);
  }

  async selectPlayer(player: PlayerSearchResult) {
    // Check if player is already selected
    if (this.selectedPlayers.some(p => p.membershipId === player.membershipId)) {
      return;
    }
    // Use the game property from the player object if present, otherwise fallback to selectedGame
    const displayPlayer: PlayerSearchDisplay = {
      ...player,
      game: (player as any).game || this.selectedGame,
      platform: this.getPlatformName(player.membershipType)
    };
    console.log('[DEBUG] selectPlayer:', displayPlayer);
    this.selectedPlayers.push(displayPlayer);
    this.selectedCharacterIds[player.membershipId] = undefined;
    try {
      await this.loadCharacterHistory(displayPlayer);
      // After loading character history, trigger activity loading if we have a date selected
      if (this.selectedDate) {
        console.log('[DEBUG] Date is selected, loading activities after player selection');
        await this.loadAllFilteredActivities();
      }
      // Calculate account stats when a new player is added
      await this.calculateAccountStats();
    } catch (error) {
      this.selectedPlayers = this.selectedPlayers.filter(p => p.membershipId !== player.membershipId);
      delete this.selectedCharacterIds[player.membershipId];
      throw error;
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
        const profile = await firstValueFrom(this.bungieService.getD1Profile(player.membershipType, player.membershipId));
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }
        this.characters[player.membershipId] = profile.Response.data?.characters || [];
        for (const char of this.characters[player.membershipId]) {
          await this.loadActivityHistoryForCharacter({
            characterId: char.characterBase?.characterId,
            membershipType: player.membershipType,
            membershipId: player.membershipId,
            game: 'D1'
          });
        }
      } else {
        const profile = await firstValueFrom(this.bungieService.getProfile(player.membershipType, player.membershipId));
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }
        const characters = Object.values(profile.Response.characters?.data || {}) as Array<{ characterId: string }>;
        this.characters[player.membershipId] = characters;
        for (const char of characters) {
          await this.loadActivityHistoryForCharacter({
            characterId: char.characterId,
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
            console.warn('[DEBUG] Invalid D2 activity response structure:', response);
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
            mode: activity.activityDetails?.mode
          }));

          const uniqueNewActivities = storedActivities.filter(activity => 
            !dbActivities.some(existing => this.isDuplicateActivity(existing, activity))
          );

          if (uniqueNewActivities.length > 0) {
            newActivities = newActivities.concat(uniqueNewActivities);
            await this.processActivityBatch(uniqueNewActivities, character);
          }

          // Update loading progress
          this.updateLoadingProgress(
            character.characterId, 
            ((page + 1) / (page + 2)) * 100,
            page + 1,
            newActivities.length
          );
          
          page++;
        }
      }

      this.processActivities([...dbActivities, ...newActivities], character);
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
    progress: number,
    totalPages: number,
    totalActivities: number
  ): void {
    this.loadingProgress = {
      characterId,
      progress,
      message: `Loading activities: ${progress.toFixed(0)}% (${totalActivities} activities found)`
    };
    this.cdr.detectChanges();
  }

  private processAndGroupActivities(): void {
    if (!this.filteredActivitiesForDate.length) {
      this.groupedActivitiesByAccount = [];
      console.log('[DEBUG] [Group] No activities to group.');
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
      const type = this.getActivityType(activity.activityDetails?.mode || 0);
      if (!yearGroup.typeGroups.has(type)) {
        yearGroup.typeGroups.set(type, {
          type,
          icon: this.getActivityTypeIcon(type, activity.game === 'D1'),
          activities: []
        });
      }
      yearGroup.typeGroups.get(type)!.activities.push(activity);
    }
    this.groupedActivitiesByAccount = Array.from(accountGroups.values()).map(account => ({
      ...account,
      yearGroups: Array.from(account.yearGroups.values()).map(yearGroup => ({
        year: yearGroup.year,
        typeGroups: Array.from(yearGroup.typeGroups.values())
      }))
    }));
    // Debug log: grouped activities
    console.log('[DEBUG] [Group] Grouped activities by account:', this.groupedActivitiesByAccount);
    this.cdr.detectChanges();
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

      this.processAndGroupActivities();
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
    if (membershipType === undefined) return 'Unknown';
    switch (membershipType) {
      case 1: return 'Xbox';
      case 2: return 'PlayStation';
      case 3: return 'Steam';
      case 4: return 'Battle.net';
      case 5: return 'Stadia';
      case 6: return 'Epic';
      default: return 'Unknown';
    }
  }

  isD1Player(player: PlayerSearchResult | PlayerSearchDisplay): boolean {
    // Use the 'game' field as the source of truth
    return (player as any).game === 'D1';
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

    const filtered = activities.filter(activity => {
      const mode = activity.activityDetails?.mode;
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
    let totalActivityCount = 0;
    const perType: { [type: string]: { count: number, time: number } } = {};
    const guardianFirstsMap: { [key: string]: ActivityFirstCompletion } = {};
    const D1_FAMILY_MAP: Record<string, string> = {
      '3801607287': 'Vault of Glass', '708693006': 'Vault of Glass',
      '3879860661': "Crota's End", '898834093': "Crota's End",
      '1733556769': "King's Fall", '421023204': "King's Fall",
      '2578867903': 'Wrath of the Machine', '4007500989': 'Wrath of the Machine',
    };
    try {
      for (const player of this.selectedPlayers) {
        const characters = this.characters[player.membershipId] || [];
        const gameCharacters = characters.filter(char => {
          const isD1 = this.isD1Player(player);
          return isD1 === (player.game === 'D1');
        });
        for (const char of gameCharacters) {
          const characterId = this.isD1Player(player)
            ? char.characterBase?.characterId
            : char.characterId;
          if (!characterId) continue;
          // Get all activities for this character
          const allActivities = Object.keys(this.activities)
            .filter(key => key.startsWith(`activities-${player.membershipId}-${characterId}`))
            .reduce((acc, key) => acc.concat(this.activities[key] || []), [] as ActivityHistory[]);
          // Sum activity time and count
          totalActivityCount += allActivities.length;
          for (const activity of allActivities) {
            const seconds = this.getActivityDurationSeconds(activity);
            totalActivityTime += seconds / 60; // convert to minutes
            // Per-type stats
            const mode = activity.activityDetails?.mode;
            const type = this.getActivityType(mode);
            // Only count types relevant to the game
            if ((player.game === 'D1' && ['Raid','Strike','Nightfall','Crucible','Other'].includes(type)) ||
                (player.game === 'D2' && ['Raid','Dungeon','Strike','Nightfall','Crucible','Gambit','Other'].includes(type))) {
              if (!perType[type]) perType[type] = { count: 0, time: 0 };
              perType[type].count++;
              perType[type].time += seconds / 60;
            }
          }
          totalTime += Number(char.minutesPlayedTotal || 0);
          // Guardian firsts logic unchanged
          const firsts = await this.activityDb.getFirstCompletions(player.membershipId, characterId, player.game);
          if (firsts && firsts.firstCompletions) {
            for (const first of firsts.firstCompletions) {
              let familyName = '';
              if (first.game === 'D2') {
                const map = (this.activityDb.constructor as any).ACTIVITY_FAMILY_MAP;
                familyName = map && map[first.referenceId] ? map[first.referenceId] : first.name;
              } else {
                familyName = D1_FAMILY_MAP[first.referenceId] || first.name;
              }
              const key = `${first.type}-${first.game}-${familyName}`;
              if (!guardianFirstsMap[key] || new Date(first.completionDate) < new Date(guardianFirstsMap[key].completionDate)) {
                guardianFirstsMap[key] = {
                  ...first,
                  name: familyName,
                  completionDate: first.completionDate,
                  referenceId: first.referenceId
                };
              }
            }
          }
        }
      }
      const guardianFirsts = Object.values(guardianFirstsMap).sort((a, b) => {
        if (a.game !== b.game) return a.game === 'D1' ? -1 : 1;
        return new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime();
      });
      this.guardianFirsts = guardianFirsts;
      this.accountStats = {
        totalTime,
        totalActivityTime: Math.round(totalActivityTime),
        totalActivityCount,
        perType: { ...perType }
      };
    } catch (error) {
      console.error('[DEBUG] Error in calculateAccountStats:', error);
    } finally {
      this.loadingAccountStats = false;
      this.loadingGuardianFirsts = false;
      this.cdr.detectChanges();
    }
  }

  // Helper method to format duration
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
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

  getActivityTypeIcon(activityType: string, isD1: boolean = false): string {
    if (!activityType) return this.activityIconService.getIconPath('other');
    
    // Map activity types to icon types
    const typeMap: Record<string, ActivityIconType> = {
      'raid': isD1 ? 'raid-d1' : 'raid-d2',
      'dungeon': 'dungeon',
      'strike': 'strike',
      'nightfall': 'nightfall',
      'crucible': 'crucible',
      'gambit': 'gambit',
      'story': 'story',
      'patrol': 'patrol',
      'public-event': 'public-event',
      'lost-sector': 'lost-sector',
      'seasonal': 'seasonal',
      'exotic-mission': 'exotic-mission'
    };

    const iconType = typeMap[activityType.toLowerCase()] || 'other';
    return this.activityIconService.getIconPath(iconType);
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

  searchPlayer() {
    if (!this.searchUsername) {
      this.errorMessage = 'Please enter a username';
      return;
    }
    // TODO: Implement search logic
    console.log('Searching for player:', this.searchUsername, 'on platform:', this.selectedPlatform);
  }

  async addPlayer() {
    if (!this.searchUsername || !this.selectedPlatform || !this.selectedGame) {
      this.errorMessage = 'Please enter all fields.';
      return;
    }
    // Only allow Cross Save for D2
    if (this.selectedPlatform === 'Cross Save' && this.selectedGame !== 'D2') {
      this.errorMessage = 'Cross Save is only available for Destiny 2.';
      return;
    }
    this.errorMessage = '';
    this.loading['search'] = true;
    try {
      if (this.selectedGame === 'D2') {
        await this.searchD2Player(this.searchUsername);
      } else {
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
   * @param membershipId The player's membership ID
   * @returns Array of activities
   */
  private getPlayerActivities(membershipId: string): ActivityHistory[] {
    const cacheKey = `player-${membershipId}`;
    const cached = this.activityCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.activities;
    }

    console.log('[DEBUG] Getting activities from database for player:', membershipId);
    const activities = Object.keys(this.activities)
      .filter(key => key.startsWith(`activities-${membershipId}-`))
      .reduce((acc, key) => {
        const acts = this.activities[key] || [];
        return acc.concat(acts);
      }, [] as ActivityHistory[]);

    // Debug log: loaded activities
    console.log(`[DEBUG] Loaded ${activities.length} activities for player ${membershipId}`);
    activities.slice(0, 10).forEach(a => {
      const d = new Date(a.period);
      console.log(`[DEBUG] Activity: UTC=${d.toISOString()}, Local=${d.toLocaleString()}, Month=${d.getMonth() + 1}, Day=${d.getDate()}, Year=${d.getFullYear()}, InstanceId=${a.activityDetails?.instanceId}`);
    });

    this.activityCache.set(cacheKey, {
      activities,
      timestamp: Date.now(),
      type: 'all',
      game: this.isD1Player({ membershipId } as PlayerSearchResult) ? 'D1' : 'D2'
    });

    return activities;
  }

  // Update processing when activities change
  private processActivities(activities: ActivityHistory[], character: CharacterWithGame): void {
    // Store activities in the activities map
    const key = `activities-${character.membershipId}-${character.characterId}`;
    this.activities[key] = activities;
    
    // Process and group all activities
    this.processAndGroupActivities();
    
    // Update the UI
    this.cdr.detectChanges();
  }

  // Add method to clear all activities from the database
  async clearAllActivitiesFromDb() {
    if (!confirm('Are you sure you want to clear all activities from the database? This cannot be undone.')) return;
    await this.activityDb.clearAllActivities();
    this.activities = {};
    this.clearCache();
    this.accountStats = {
      totalTime: 0,
      totalActivityTime: 0,
      totalActivityCount: 0,
      perType: {}
    };
    this.cdr.detectChanges();
    alert('All activities have been cleared from the database.');
  }

  // Centralized method to get all activities for selected players and date
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
    const allFilteredActivities: ActivityWithMembership[] = [];

    // Get all activities for selected players in parallel
    const playerActivitiesPromises = this.selectedPlayers.map(async player => {
      const playerActivities = this.getPlayerActivities(player.membershipId);
      console.log(`[DEBUG] [Filter] Player ${player.displayName} (${player.membershipId}) has ${playerActivities.length} activities in DB`);
      
      return playerActivities
        .filter(activity => this.isActivityOnSelectedDate(activity))
        .map(activity => ({
          ...activity,
          membershipId: player.membershipId,
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
    
    // Cache the filtered activities
    this.filteredActivitiesCache.set(cacheKey, dedupedActivities);
    
    this.filteredActivitiesForDate = dedupedActivities;
    return dedupedActivities;
  }

  // Add method to clear filtered activities cache
  private clearFilteredActivitiesCache(): void {
    this.filteredActivitiesCache.clear();
  }

  // Add method to open external PGCR
  openExternalPGCR(activity: ActivityHistory, isD1: boolean) {
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) return;
    const game = isD1 ? 'destiny1' : 'destiny2';
    window.open(`https://pgcr.eververse.trade/${game}/${instanceId}`, '_blank', 'noopener');
  }

  handleImageError(event: Event, isD1: boolean): void {
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = '/assets/icons/activities/tricorn.png';
  }

  // Helper for Guardian Firsts template
  getGuardianFirstsForGame(game: 'D1' | 'D2'): ActivityFirstCompletion[] {
    // Only show raids and dungeons
    return this.guardianFirsts.filter(f => f.game === game && (f.type === 'raid' || f.type === 'dungeon'));
  }
  hasGuardianFirstsForGame(game: 'D1' | 'D2'): boolean {
    return this.guardianFirsts.some(f => f.game === game);
  }

  // Helper for Guardian Firsts image
  getFirstCompletionImage(first: ActivityFirstCompletion): string {
    if (!first) return '/assets/icons/activities/tricorn.png';

    // Try to get the PGCR image first
    if (first.referenceId) {
      const pgcrImage = this.manifest.getActivityPgcrImage(first.referenceId, first.game === 'D1');
      if (pgcrImage) {
        if (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/')) {
          return 'https://www.bungie.net' + pgcrImage;
        }
        return pgcrImage;
      }
    }

    // If no PGCR image, try to get the activity type icon
    const typeIcon = this.getActivityTypeIcon(first.type, first.game === 'D1');
    if (typeIcon) return typeIcon;

    // Final fallback to Destiny tricorn logo
    return '/assets/icons/activities/tricorn.png';
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

  public getActivityImage(activity: any, isD1: boolean): string {
    if (!activity) return '/assets/icons/activities/tricorn.png';
    const referenceId = activity.activityDetails?.referenceId;
    if (referenceId) {
      const pgcrImage = this.manifest.getActivityPgcrImage(referenceId, isD1);
      if (pgcrImage) {
        if (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/')) {
          return 'https://www.bungie.net' + pgcrImage;
        }
        return pgcrImage;
      }
    }
    const mode = activity.activityDetails?.mode;
    if (mode !== undefined) {
      const type = this.getActivityType(mode);
      const typeIcon = this.getActivityTypeIcon(type, isD1);
      if (typeIcon) return typeIcon;
    }
    return '/assets/icons/activities/tricorn.png';
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
}

// BungieNetPlatform Endpoints (https://destinydevs.github.io/BungieNetPlatform/docs/Endpoints)
// - Useful for user lookups, activity history, and manifest endpoints for both D1 and D2.
// - Can be referenced for advanced features like forum, admin, and token endpoints if needed in the future.
// - Current implementation already uses the most relevant endpoints for player and activity data. 