import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BungieApiService, PlayerSearchResult } from '../../services/bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { DestinyManifestService } from '../../services/destiny-manifest.service';
import { ActivityCacheService } from '../../services/activity-cache.service';
import { PGCRCacheService } from '../../services/pgcr-cache.service';
import { PGCRDetailsComponent } from '../pgcr-details/pgcr-details.component';
import { ActivityHistory, Character } from '../../models/activity-history.model';
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption } from '../../models/activity';
import { ActivityDbService, StoredActivity } from '../../services/activity-db.service';
import { LoadingProgressComponent, LoadingProgress } from '../loading-progress/loading-progress.component';
import { ActivityMode, ACTIVITY_MODE_MAP } from '../../models/activity-types';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';

interface ActivityEntry {
  game: string;
  platform: string;
  player: PlayerSearchResult;
  activities: ActivityHistory[];
}

interface YearGroup {
  year: string;
  types: { [type: string]: ActivityEntry[] };
}

// Shared activity icons for both D1 and D2
const SHARED_ACTIVITY_ICONS: { [type: string]: string } = {
  raid: 'assets/icons/raid.svg',
  strike: 'assets/icons/strike.svg',
  crucible: 'assets/icons/crucible.svg',
  dungeon: 'assets/icons/dungeon.svg',
  nightfall: 'assets/icons/nightfall.svg',
  gambit: 'assets/icons/gambit.svg',
  other: 'assets/icons/activity.svg',
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
type CharacterWithGame = Character & { game?: 'D1' | 'D2' };

// Add cache interface
interface ActivityCache {
  activities: ActivityHistory[];
  timestamp: number;
  type: string;
  game: string;
}

@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [CommonModule, FormsModule, PGCRDetailsComponent, LoadingProgressComponent],
  templateUrl: './player-search.component.html',
  styleUrls: ['./player-search.component.css']
})
export class PlayerSearchComponent implements OnInit {
  d1XboxSearchTerm: string = '';
  d1PsnSearchTerm: string = '';
  d2SearchTerm: string = '';
  selectedMonth: number = new Date().getMonth() + 1;
  selectedDay: number = new Date().getDate();
  selectedDate: string = '';
  currentMonth: number = new Date().getMonth() + 1;
  currentDay: number = new Date().getDate();
  selectedPlayers: PlayerSearchDisplay[] = [];
  selectedCharacterIds: { [key: string]: string | undefined } = {};
  characters: { [key: string]: any[] } = {};
  activities: { [key: string]: ActivityHistory[] } = {};
  loading: { [key: string]: boolean } = {};
  error: { [key: string]: string } = {};
  selectedPGCR: any = null;
  showPGCRModal: boolean = false;
  selectedActivityType: ActivityTypeOption = ACTIVITY_TYPE_OPTIONS[0]; // Default to 'All'

  // Search form properties
  searchUsername = '';
  selectedPlatform = '';
  selectedGame: 'D1' | 'D2' = 'D2';
  errorMessage = '';
  
  // Platform options
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
  private readonly RETRY_DELAY = 1000; // 1 second

  // Add cache properties
  private activityCache: Map<string, ActivityCache> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
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

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef,
    private activityCacheService: ActivityCacheService,
    private pgcrCacheService: PGCRCacheService,
    private activityDb: ActivityDbService
  ) {}

  ngOnInit(): void {
    // Set default to current month/day
    const today = new Date();
    this.currentMonth = today.getMonth() + 1;
    this.currentDay = today.getDate();
    this.onDateSelect(String(this.currentMonth), String(this.currentDay));
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
        if (!profile) {
          throw new Error('No profile data received');
        }
        this.characters[player.membershipId] = profile.data?.characters || [];
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
        if (!profile) {
          throw new Error('No profile data received');
        }
        const characters = Object.values(profile.characters?.data || {}) as Array<{ characterId: string }>;
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

  private async fetchActivitiesWithRetry(
    character: CharacterWithGame,
    page: number,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<ActivityHistory[]> {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const response = await firstValueFrom(
          character.game === 'D1'
            ? this.bungieService.getD1ActivityHistory(
                character.membershipType,
                character.membershipId,
                character.characterId,
                0,
                page
              )
            : this.bungieService.getActivityHistory(
                character.membershipType,
                character.membershipId,
                character.characterId,
                page
              )
        );
        return character.game === 'D1' ? response?.data?.activities || [] : response?.activities || [];
      } catch (error) {
        retries++;
        console.log(`[DEBUG] Retry ${retries}/${maxRetries} for page ${page}`);
        if (retries === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * retries)); // Exponential backoff
      }
    }
    return [];
  }

  private async processActivityBatch(activities: ActivityHistory[], character: CharacterWithGame): Promise<void> {
    for (let i = 0; i < activities.length; i += this.BATCH_SIZE) {
      const batch = activities.slice(i, i + this.BATCH_SIZE);
      
      // Store in database
      const storedActivities: StoredActivity[] = batch.map(a => ({
        ...a,
        membershipId: character.membershipId,
        characterId: character.characterId
      }));
      await this.activityDb.addActivities(storedActivities);
      
      // Update UI periodically
      if (i % 200 === 0) {
        this.cdr.detectChanges();
      }
    }
  }

  async loadActivityHistoryForCharacter(character: CharacterWithGame): Promise<void> {
    const loadingKey = `${character.membershipId}-${character.characterId}`;
    this.loadingActivities[loadingKey] = true;
    
    try {
      console.log(`[DEBUG] Starting activity history fetch for character ${character.characterId}`);

      // Get expected activity count from API
      const expectedCount = await firstValueFrom(
        this.bungieService.getActivityCount(character.membershipType, character.membershipId, character.characterId)
      );
      console.log(`[DEBUG] Expected activity count for character ${character.characterId}: ${expectedCount}`);

      // First check what we have in the database
      const dbActivities = await this.activityDb.getAllActivitiesForCharacter(
        character.membershipId,
        character.characterId
      );
      console.log(`[DEBUG] Found ${dbActivities.length} activities in database for character ${character.characterId}`);

      // Check if we have activities from multiple years
      const years = new Set(dbActivities.map(a => new Date(a.period).getUTCFullYear()));
      console.log(`[DEBUG] Found activities from years in database: ${Array.from(years).sort().join(', ')}`);

      // Only fetch from API if we don't have enough data
      const D2_RELEASE_DATE = new Date('2017-09-06T00:00:00Z');
      const D1_RELEASE_DATE = new Date('2014-09-09T00:00:00Z');
      const releaseDate = character.game === 'D1' ? D1_RELEASE_DATE : D2_RELEASE_DATE;
      
      let oldestActivityDate = dbActivities.length > 0 
        ? new Date(Math.min(...dbActivities.map(a => new Date(a.period).getTime())))
        : null;

      let newActivities: ActivityHistory[] = [];
      
      // Only fetch from API if:
      // 1. We have no activities in the database, or
      // 2. Our oldest activity is newer than the game's release date, or
      // 3. We have fewer activities than expected
      if (!oldestActivityDate || 
          oldestActivityDate.getTime() > releaseDate.getTime() || 
          dbActivities.length < expectedCount) {
        console.log('[DEBUG] Fetching activities from API');
        let page = 0;
        let hasMore = true;
        let totalActivitiesFetched = 0;
        let consecutiveEmptyPages = 0;
        const MAX_CONSECUTIVE_EMPTY = 3;
        let foundYears = new Set<number>();
        let foundActivityTypes = new Set<number>();

        // Get initial page to estimate total
        const initialActivities = await this.fetchActivitiesWithRetry(character, 0);
        const activitiesPerPage = initialActivities.length || 50;
        const estimatedTotalPages = Math.ceil(expectedCount / activitiesPerPage);
        
        newActivities = newActivities.concat(initialActivities);
        totalActivitiesFetched += initialActivities.length;

        this.updateLoadingProgress(character.characterId, 0, estimatedTotalPages, totalActivitiesFetched);

        while (hasMore && totalActivitiesFetched < expectedCount) {
          page++;
          const progress = Math.min(100, (page / estimatedTotalPages) * 100);
          this.updateLoadingProgress(character.characterId, progress, estimatedTotalPages, totalActivitiesFetched);

          console.log(`[DEBUG] Fetching page ${page + 1} (${totalActivitiesFetched}/${expectedCount} activities)`);
          const activities = await this.fetchActivitiesWithRetry(character, page);
          
          if (!activities || activities.length === 0) {
            consecutiveEmptyPages++;
            console.log(`[DEBUG] Empty page received. Consecutive empty pages: ${consecutiveEmptyPages}`);
            if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY) {
              console.log('[DEBUG] Too many consecutive empty pages, stopping pagination');
              hasMore = false;
              break;
            }
            continue;
          }

          consecutiveEmptyPages = 0;
          totalActivitiesFetched += activities.length;
          newActivities = newActivities.concat(activities);

          // Process activities in batches
          await this.processActivityBatch(activities, character);

          // Track years and activity types
          for (const activity of activities) {
            if (activity.period) {
              const activityDate = new Date(activity.period);
              const year = activityDate.getUTCFullYear();
              foundYears.add(year);
              
              if (!oldestActivityDate || activityDate < oldestActivityDate) {
                oldestActivityDate = activityDate;
              }
            }
            if (activity.activityDetails?.mode) {
              foundActivityTypes.add(activity.activityDetails.mode);
            }
          }

          // Check if we've reached the release date
          if (oldestActivityDate && oldestActivityDate.getTime() < releaseDate.getTime()) {
            console.log(`[DEBUG] Reached ${character.game} release date (${releaseDate.toISOString()}), stopping pagination`);
            hasMore = false;
            break;
          }
        }

        console.log(`[DEBUG] Finished fetching new activities. Total new: ${totalActivitiesFetched}`);
        console.log(`[DEBUG] Expected count: ${expectedCount}, Actual count: ${totalActivitiesFetched}`);
        if (totalActivitiesFetched < expectedCount) {
          console.log(`[DEBUG] WARNING: Fetched fewer activities than expected (${totalActivitiesFetched}/${expectedCount})`);
        }
        console.log(`[DEBUG] All years found: ${Array.from(foundYears).sort().join(', ')}`);
        console.log(`[DEBUG] All activity types found: ${Array.from(foundActivityTypes).sort().join(', ')}`);
        if (oldestActivityDate) {
          console.log(`[DEBUG] Final oldest activity date: ${oldestActivityDate.toISOString()}`);
        }
      } else {
        console.log('[DEBUG] Using cached activities from database');
        console.log(`[DEBUG] Database count: ${dbActivities.length}, Expected count: ${expectedCount}`);
        if (dbActivities.length < expectedCount) {
          console.log(`[DEBUG] WARNING: Database has fewer activities than expected (${dbActivities.length}/${expectedCount})`);
        }
      }

      // Combine database activities with new activities
      const allActivities = [...dbActivities, ...newActivities];
      console.log(`[DEBUG] Total activities (database + new): ${allActivities.length}`);
      console.log(`[DEBUG] Expected count: ${expectedCount}, Actual total: ${allActivities.length}`);
      if (allActivities.length < expectedCount) {
        console.log(`[DEBUG] WARNING: Total activities less than expected (${allActivities.length}/${expectedCount})`);
      }

      // Process all activities
      this.processActivities(allActivities, character);
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
    console.log('[DEBUG] Starting processAndGroupActivities');
    const grouped: { [year: string]: { [type: string]: ActivityEntry[] } } = {};
    
    // Get the range of years to display (from D1 launch to current year)
    const currentYear = new Date().getFullYear();
    const d1LaunchYear = 2014;
    const years = Array.from({ length: currentYear - d1LaunchYear + 1 }, (_, i) => (d1LaunchYear + i).toString());
    
    // Initialize all years with empty groups
    years.forEach(year => {
      grouped[year] = {};
      ACTIVITY_TYPE_OPTIONS.forEach(type => {
        grouped[year][type.label] = [];
      });
    });

    // Track counts for logging
    const yearTypeCounts: { [year: string]: { [type: string]: number } } = {};

    // Process each selected player
    this.selectedPlayers.forEach(player => {
      const game = this.isD1Player(player) ? 'D1' : 'D2';
      const platform = this.getPlatformName(player.membershipType);
      
      // Get all activities for this player across all characters
      const playerActivities: ActivityHistory[] = [];
      Object.keys(this.activities)
        .filter(key => key.startsWith(`activities-${player.membershipId}-`))
        .forEach(key => {
          const activities = this.activities[key] || [];
          playerActivities.push(...activities);
        });

      console.log(`[DEBUG] Found ${playerActivities.length} total activities for player ${player.displayName}`);

      // Remove duplicates for this player
      const uniquePlayerActivities = playerActivities.filter((activity, index, self) =>
        index === self.findIndex((a) => a.activityDetails?.instanceId === activity.activityDetails?.instanceId)
      );

      console.log(`[DEBUG] After removing duplicates: ${uniquePlayerActivities.length} activities for player ${player.displayName}`);

      // Log sample of activities before date filtering
      console.log('[DEBUG] Sample activities before date filtering:', 
        uniquePlayerActivities.slice(0, 3).map(a => ({
          period: a.period,
          local: new Date(a.period).toLocaleString(),
          utc: new Date(a.period).toISOString(),
          month: new Date(a.period).getMonth() + 1,
          day: new Date(a.period).getDate()
        }))
      );

      // Filter activities by selected date if one is selected
      const filteredActivities = this.selectedDate 
        ? uniquePlayerActivities.filter(activity => {
            const matches = this.isActivityOnDate(activity, new Date(this.selectedDate));
            if (matches) {
              console.log('[DEBUG] Found matching activity:', {
                period: activity.period,
                local: new Date(activity.period).toLocaleString(),
                utc: new Date(activity.period).toISOString(),
                type: this.getActivityType(activity.activityDetails?.mode || 0)
              });
            }
            return matches;
          })
        : uniquePlayerActivities;

      console.log(`[DEBUG] After date filtering: ${filteredActivities.length} activities for player ${player.displayName} on date ${this.selectedDate}`);

      // Log sample of activities after date filtering
      if (filteredActivities.length > 0) {
        console.log('[DEBUG] Sample activities after date filtering:', 
          filteredActivities.slice(0, 3).map(a => ({
            period: a.period,
            local: new Date(a.period).toLocaleString(),
            utc: new Date(a.period).toISOString(),
            month: new Date(a.period).getMonth() + 1,
            day: new Date(a.period).getDate()
          }))
        );
      }

      // Group activities by year and type
      filteredActivities.forEach(activity => {
        if (!activity.period) return;
        
        // Convert activity date to UTC
        const activityDate = new Date(activity.period);
        const year = activityDate.getUTCFullYear().toString();
        const type = this.getActivityType(activity.activityDetails?.mode || 0);
        
        if (!grouped[year]) grouped[year] = {};
        if (!grouped[year][type]) grouped[year][type] = [];
        
        // Check if this activity is already added
        const existingEntry = grouped[year][type].find(e => 
          e.player.membershipId === player.membershipId && 
          e.platform === platform && 
          e.game === game
        );
        
        if (!existingEntry) {
          const entry: ActivityEntry = { game, platform, player, activities: [] };
          grouped[year][type].push(entry);
          entry.activities.push(activity);
        } else {
          // Only add if not already in the activities array
          if (!existingEntry.activities.some(a => a.activityDetails?.instanceId === activity.activityDetails?.instanceId)) {
            existingEntry.activities.push(activity);
          }
        }

        // Track counts for logging
        if (!yearTypeCounts[year]) yearTypeCounts[year] = {};
        if (!yearTypeCounts[year][type]) yearTypeCounts[year][type] = 0;
        yearTypeCounts[year][type]++;
      });

      // Log activity counts once per year/type combination
      Object.entries(yearTypeCounts).forEach(([year, types]) => {
        Object.entries(types).forEach(([type, count]) => {
          if (count > 0) {
            console.log(`[DEBUG] Found ${count} unique activities for ${type} in ${year}`);
          }
        });
      });
    });

    // Convert to array and sort by year descending
    this.processedActivities = Object.entries(grouped)
      .map(([year, types]) => ({ year, types }))
      .sort((a, b) => parseInt(b.year) - parseInt(a.year));

    console.log('[DEBUG] Final activity counts by year:');
    this.processedActivities.forEach(group => {
      const totalForYear = Object.values(group.types).reduce((sum, entries) => 
        sum + entries.reduce((entrySum, entry) => entrySum + entry.activities.length, 0), 0);
      console.log(`[DEBUG] Year ${group.year}: ${totalForYear} total activities`);
    });
  }

  getGroupedActivitiesByYearAndType(): YearGroup[] {
    // Initialize year range
    const d1LaunchYear = 2014;
    const endYear = 2025;
    const years = Array.from(
      { length: endYear - d1LaunchYear + 1 }, 
      (_, i) => (d1LaunchYear + i).toString()
    );
    
    // Initialize grouped structure with pre-allocated arrays
    const grouped: { [year: string]: { [type: string]: ActivityEntry[] } } = {};
    const activityTypes = Object.values(ACTIVITY_MODE_MAP);
    
    years.forEach(year => {
      grouped[year] = {};
      activityTypes.forEach(type => {
        grouped[year][type] = [];
      });
      grouped[year]['Other'] = [];
    });

    // Process each player's activities in a single pass
    this.selectedPlayers.forEach(player => {
      const game = this.isD1Player(player) ? 'D1' : 'D2';
      const platform = this.getPlatformName(player.membershipType);
      
      // Get all activities for this player
      const playerActivities = this.getPlayerActivities(player.membershipId);
      
      // Filter by date if selected
      const filteredActivities = this.selectedDate 
        ? playerActivities.filter(activity => this.isActivityOnDate(activity, new Date(this.selectedDate)))
        : playerActivities;

      // Group activities in a single pass
      const activityMap = new Map<string, ActivityEntry>();
      
      filteredActivities.forEach(activity => {
        if (!activity.period || !activity.activityDetails?.mode) return;
        
        const activityDate = new Date(activity.period);
        const year = activityDate.getUTCFullYear().toString();
        const type = this.getActivityType(activity.activityDetails.mode);
        
        // Skip if type doesn't match filter
        if (this.selectedActivityType.label !== 'All' && type !== this.selectedActivityType.label) {
          return;
        }

        // Skip if game version doesn't match
        if ((game === 'D1' && !this.isD1Player(player)) || 
            (game === 'D2' && this.isD1Player(player))) {
          return;
        }

        const entryKey = `${year}-${type}-${player.membershipId}-${platform}-${game}`;
        let entry = activityMap.get(entryKey);
        
        if (!entry) {
          entry = { game, platform, player, activities: [] };
          activityMap.set(entryKey, entry);
          grouped[year][type].push(entry);
        }
        
        if (!entry.activities.some(a => a.activityDetails?.instanceId === activity.activityDetails?.instanceId)) {
          entry.activities.push(activity);
        }
      });
    });

    // Convert to array and sort by year descending
    return Object.entries(grouped)
      .map(([year, types]) => ({ year, types }))
      .sort((a, b) => parseInt(b.year) - parseInt(a.year));
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

    const activities = Object.keys(this.activities)
      .filter(key => key.startsWith(`activities-${membershipId}-`))
      .reduce((acc, key) => {
        const activities = this.activities[key] || [];
        return acc.concat(activities);
      }, [] as ActivityHistory[]);

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

  // Update processing when date or type changes
  async onDateOrTypeChange() {
    console.log('[DEBUG] Date or type changed, reloading activities');
    if (!this.selectedDate) {
      console.log('[DEBUG] No date selected, skipping load');
      return;
    }

    // Clear cache when date or type changes
    this.clearCache();

    // Validate and set the date
    this.validateAndSetDate(this.selectedDate);
    
    // If we have players selected, load their activities
    if (this.selectedPlayers.length > 0) {
      console.log('[DEBUG] Loading activities for selected players');
      await this.loadAllFilteredActivities();
    } else {
      console.log('[DEBUG] No players selected yet, activities will load when players are added');
    }
    
    // Process and group all activities
    this.processAndGroupActivities();
    
    // Update the UI
    this.cdr.detectChanges();
  }

  /**
   * Helper to check if an activity occurred on the given date in user's timezone.
   * This method handles two key aspects of date comparison:
   * 1. Timezone handling: All dates are compared in the user's local timezone
   * 2. Year handling: Only month and day are compared, ignoring the year
   *    This allows showing activities from all years for the selected date
   * 
   * Example: If user selects May 11, they will see activities from May 11 of any year,
   * properly grouped by year in the UI.
   */
  private isActivityOnDate(activity: ActivityHistory, targetDate: Date): boolean {
    const activityDate = new Date(activity.period);
    
    // Log the full date objects for debugging
    console.log('[DEBUG] Date comparison details:', {
      activityDate: {
        full: activityDate.toISOString(),
        month: activityDate.getMonth() + 1,
        day: activityDate.getDate(),
        year: activityDate.getFullYear(),
        hours: activityDate.getHours(),
        minutes: activityDate.getMinutes(),
        timezone: activityDate.getTimezoneOffset()
      },
      targetDate: {
        full: targetDate.toISOString(),
        month: targetDate.getMonth() + 1,
        day: targetDate.getDate(),
        year: targetDate.getFullYear(),
        hours: targetDate.getHours(),
        minutes: targetDate.getMinutes(),
        timezone: targetDate.getTimezoneOffset()
      }
    });

    // Compare only month and day, ignoring year
    const activityMonth = activityDate.getMonth() + 1;
    const activityDay = activityDate.getDate();
    const targetMonth = targetDate.getMonth() + 1;
    const targetDay = targetDate.getDate();

    const matches = activityMonth === targetMonth && activityDay === targetDay;

    console.log('[DEBUG] Date comparison result:', {
      activity: {
        month: activityMonth,
        day: activityDay,
        fullDate: activityDate.toISOString()
      },
      selected: {
        month: targetMonth,
        day: targetDay,
        fullDate: targetDate.toISOString()
      },
      matches
    });

    return matches;
  }

  /**
   * Validates and sets the selected date, ensuring it's in the user's local timezone.
   * This method:
   * 1. Converts the input date to local midnight
   * 2. Prevents selection of future dates
   * 3. Maintains the date in the user's local timezone
   */
  private validateAndSetDate(dateStr: string): void {
    // Convert input date to local midnight
    const selectedDate = new Date(dateStr);
    selectedDate.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate > today) {
      console.log('[DEBUG] Future date detected, using today instead');
      this.selectedDate = today.toISOString().split('T')[0];
    } else {
      // Use the current year for the selected date
      const currentYear = new Date().getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      this.selectedDate = `${currentYear}-${month}-${day}`;
    }
    
    console.log('[DEBUG] Date validated and set to:', {
      local: selectedDate.toLocaleString(),
      utc: selectedDate.toISOString(),
      stored: this.selectedDate
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

  getActivityTypeIcon(activityType: string): string {
    // Use shared icons for common types
    return SHARED_ACTIVITY_ICONS[activityType.toLowerCase()] || SHARED_ACTIVITY_ICONS['other'];
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
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
   * Loads and filters activities for all selected players.
   * This method:
   * 1. Uses the selected date in the user's local timezone
   * 2. Fetches activities from the database
   * 3. Filters activities to match the selected date (ignoring year)
   * 4. Groups activities by year and type
   */
  private async loadAllFilteredActivities() {
    console.log('[DEBUG] Starting loadAllFilteredActivities');
    if (!this.selectedDate) {
      console.log('[DEBUG] No date selected, skipping load');
      return;
    }
    const selectedDateObj = new Date(this.selectedDate);
    selectedDateObj.setHours(0, 0, 0, 0);
    console.log(`[DEBUG] Filtering for date: ${this.selectedDate}`);
    console.log(`[DEBUG] Local date: ${selectedDateObj.toLocaleString()}`);
    console.log(`[DEBUG] UTC date: ${selectedDateObj.toISOString()}`);
    
    if (!this.selectedPlayers.length) {
      console.log('[DEBUG] No players selected, skipping load');
      return;
    }
    
    console.log('[DEBUG] Loading activities for players:', this.selectedPlayers.map(p => p.displayName));
    const allActivities: ActivityHistory[] = [];
    
    for (const player of this.selectedPlayers) {
      console.log(`[DEBUG] Processing player: ${player.displayName}`);
      const characterObjs = this.characters[player.membershipId] || [];
      console.log(`[DEBUG] Found ${characterObjs.length} characters for player`);
      
      for (const char of characterObjs) {
        const characterId = char.characterId || char.characterBase?.characterId;
        if (!characterId) {
          console.log('[DEBUG] Skipping character with no ID');
          continue;
        }
        
        console.log(`[DEBUG] Processing character: ${characterId}`);
        try {
          const characterActivities = await this.activityDb.getAllActivitiesForCharacter(
            player.membershipId,
            characterId
          );
          
          // Log all years present in characterActivities
          const yearsPresent = Array.from(new Set(characterActivities.map(a => new Date(a.period).getUTCFullYear())));
          console.log(`[DEBUG] Years present for character ${characterId}:`, yearsPresent);
          
          const filteredActivities = characterActivities.filter(activity => 
            this.isActivityOnDate(activity, selectedDateObj)
          );
          
          console.log(`[DEBUG] Found ${filteredActivities.length} activities for character ${characterId} on ${selectedDateObj.toLocaleDateString()}`);
          
          if (filteredActivities.length > 0) {
            console.log('[DEBUG] Sample activities:', filteredActivities.slice(0, 3).map(a => ({
              period: a.period,
              local: new Date(a.period).toLocaleString(),
              utc: new Date(a.period).toISOString()
            })));
          }
          
          allActivities.push(...filteredActivities);
          
          // Update grouped activities after each character
          const groupedActivities = this.groupActivitiesByYearAndType(allActivities);
          this.groupedActivitiesByAccount = groupedActivities;
          this.cdr.detectChanges();
        } catch (error) {
          console.error(`[DEBUG] Error loading activities for character ${characterId}:`, error);
        }
      }
    }
    
    // Log all years present in allActivities
    const allYears = Array.from(new Set(allActivities.map(a => new Date(a.period).getUTCFullYear())));
    console.log('[DEBUG] All years present in allActivities:', allYears);
    console.log(`[DEBUG] Total activities found across all characters: ${allActivities.length}`);
    
    if (allActivities.length > 0) {
      console.log('[DEBUG] Sample activity dates:', 
        allActivities.slice(0, 3).map(a => {
          const d = new Date(a.period);
          return {
            local: d.toLocaleString(),
            utc: d.toISOString(),
            month: d.getMonth() + 1,
            day: d.getDate(),
            year: d.getFullYear()
          };
        })
      );
    }
    
    // Final grouped activities
    const groupedActivities = this.groupActivitiesByYearAndType(allActivities);
    this.groupedActivitiesByAccount = groupedActivities;
    this.cdr.detectChanges();
    
    // Also triggers stats calculation
    await this.calculateAccountStats();
  }

  getGroupedActivities() {
    const grouped: { [key: string]: { [key: string]: any[] } } = {};
    this.selectedPlayers.forEach(player => {
      const game = this.isD1Player(player) ? 'D1' : 'D2';
      const platform = this.getPlatformName(player.membershipType);
      const key = `${game}-${platform}-${player.membershipId}`;
      if (!grouped[game]) grouped[game] = {};
      if (!grouped[game][platform]) grouped[game][platform] = [];
      
      // Get all activities for this player across all characters
      const playerActivities: any[] = [];
      Object.keys(this.activities)
        .filter(key => key.startsWith(`activities-${player.membershipId}-`))
        .forEach(key => {
          const activities = this.activities[key] || [];
          console.log(`Found ${activities.length} activities for key ${key}`);
          playerActivities.push(...activities);
        });

      console.log(`Total activities for player ${player.displayName}: ${playerActivities.length}`);

      if (this.selectedDate) {
        const filtered = playerActivities.filter(activity =>
          this.isActivityOnDate(activity, new Date(this.selectedDate))
        );
        console.log(`Filtered to ${filtered.length} activities for date ${this.selectedDate}`);
        grouped[game][platform].push(...filtered);
      } else {
        grouped[game][platform].push(...playerActivities);
      }
    });
    return grouped;
  }

  private groupActivitiesByYearAndType(activities: ActivityHistory[]): any[] {
    console.log('[DEBUG] Starting groupActivitiesByYearAndType with', activities.length, 'activities');
    
    const grouped: { [year: string]: { [type: string]: ActivityEntry[] } } = {};
    
    // Initialize years from D1 launch (2014) through 2025
    const d1LaunchYear = 2014;
    const endYear = 2025;
    const years = Array.from(
      { length: endYear - d1LaunchYear + 1 }, 
      (_, i) => (d1LaunchYear + i).toString()
    );
    
    console.log('[DEBUG] Initializing year range:', years);
    
    // Initialize all years with empty type groups
    years.forEach(year => {
      grouped[year] = {
        'Story': [],
        'Patrol': [],
        'Public Event': [],
        'Raid': [],
        'Dungeon': [],
        'Strike': [],
        'Nightfall': [],
        'Lost Sector': [],
        'Exotic Mission': [],
        'Seasonal': [],
        'Seasonal Event': [],
        'Crucible': [],
        'Gambit': [],
        'Other': []
      };
    });

    // Group activities by year and type
    activities.forEach(activity => {
      if (!activity.period) {
        console.log('[DEBUG] Skipping activity with no period:', activity);
        return;
      }
      
      const activityDate = new Date(activity.period);
      const year = activityDate.getUTCFullYear().toString();
      const type = this.getActivityType(activity.activityDetails?.mode || 0);
      
      console.log('[DEBUG] Processing activity:', {
        period: activity.period,
        year,
        type,
        mode: activity.activityDetails?.mode
      });
      
      if (!grouped[year]) {
        console.log(`[DEBUG] Creating new year group for ${year}`);
        grouped[year] = {
          'Story': [],
          'Patrol': [],
          'Public Event': [],
          'Raid': [],
          'Dungeon': [],
          'Strike': [],
          'Nightfall': [],
          'Lost Sector': [],
          'Exotic Mission': [],
          'Seasonal': [],
          'Seasonal Event': [],
          'Crucible': [],
          'Gambit': [],
          'Other': []
        };
      }
      
      if (!grouped[year][type]) {
        console.log(`[DEBUG] Creating new type group for ${type} in year ${year}`);
        grouped[year][type] = [];
      }
      
      grouped[year][type].push(this.createActivityEntry(activity));
    });

    // Log grouping results
    Object.entries(grouped).forEach(([year, types]) => {
      Object.entries(types).forEach(([type, activities]) => {
        if (activities.length > 0) {
          console.log(`[DEBUG] Year ${year}, Type ${type}: ${activities.length} activities`);
        }
      });
    });

    const result = Object.entries(grouped)
      .map(([year, types]) => ({ year, types }))
      .sort((a, b) => parseInt(b.year) - parseInt(a.year));

    console.log('[DEBUG] Final grouped activities:', result);
    return result;
  }

  private updateActivityDisplay(): void {
    // Force change detection to update the view
    this.cdr.detectChanges();
  }

  async viewPGCR(activityId: string) {
    try {
      // First check if we have a cached PGCR
      const cachedPGCR = this.pgcrCacheService.getPGCR(activityId);
      
      if (cachedPGCR) {
        console.log('Using cached PGCR');
        this.showPGCRDetails(cachedPGCR);
        return;
      }

      // If not cached, fetch from API
      console.log('Fetching PGCR from API');
      const pgcr = await firstValueFrom(this.bungieService.getPGCR(activityId));
      
      if (!pgcr) {
        throw new Error('No PGCR data received');
      }

      // Cache the PGCR data
      this.pgcrCacheService.cachePGCR(activityId, pgcr, true);
      
      // Show the details
      this.showPGCRDetails(pgcr);
    } catch (error) {
      console.error('Error loading PGCR:', error);
      // TODO: Show error to user
    }
  }

  private showPGCRDetails(pgcr: any) {
    this.selectedPGCR = pgcr;
    this.showPGCRModal = true;
  }

  closePGCRModal() {
    this.showPGCRModal = false;
    this.selectedPGCR = null;
  }

  getPlatformName(membershipType: number): string {
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
    return new Date(dateString).toLocaleDateString();
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
    let totalTime = 0;
    let totalActivityTime = 0;
    let totalActivityCount = 0;
    const perType: { [type: string]: { count: number, time: number } } = {};

    for (const player of this.selectedPlayers) {
      const characters = this.characters[player.membershipId] || [];
      for (const char of characters) {
        totalTime += Number(char.minutesPlayedTotal || 0);
        const count = await firstValueFrom(
          this.bungieService.getActivityCount(player.membershipType, player.membershipId, char.characterId)
        ) as number;
        totalActivityCount += count;
        let activities = await this.activityDb.getAllActivitiesForCharacter(player.membershipId, char.characterId);

        // Deduplicate by instanceId
        const seenIds = new Set();
        activities = activities.filter(a => {
          const id = a.activityDetails?.instanceId;
          if (!id) return false;
          if (seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });
        console.log(`[DEBUG] Character ${char.characterId}: ${activities.length} unique activities after deduplication`);

        // Log a sample of activity durations
        if (activities.length > 0) {
          console.log('[DEBUG] Sample activity durations:', activities.slice(0, 10).map(a => a.values?.timePlayedSeconds?.basic?.value));
        }

        // Check for outliers
        activities.forEach(a => {
          const val = a.values?.timePlayedSeconds?.basic?.value;
          if (typeof val === 'number' && val > 100000) {
            console.warn('[DEBUG] Suspiciously high activity duration:', val, a);
          }
        });

        for (const activity of activities) {
          const type = this.getActivityType(activity.activityDetails?.mode || 0);
          if (!perType[type]) perType[type] = { count: 0, time: 0 };
          perType[type].count += 1;
          let seconds = this.getActivityDurationSeconds(activity);
          // Clamp/validate time values
          if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0 || seconds > 100000) {
            console.warn('[DEBUG] Ignoring invalid activity duration:', seconds, activity);
            seconds = 0;
          }
          perType[type].time += seconds;
          totalActivityTime += seconds;
        }
        // Update stats after each character
        this.accountStats = {
          totalTime,
          totalActivityTime,
          totalActivityCount,
          perType: { ...perType }
        };
        this.cdr.detectChanges();
      }
    }
    // Log summary
    console.log('[DEBUG] Final accountStats:', this.accountStats);
    this.loadingAccountStats = false;
    this.cdr.detectChanges();
  }

  private getActivityDurationSeconds(activity: ActivityHistory): number {
    const values = activity.values as any;
    return values && values['timePlayedSeconds']?.basic?.value || 0;
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

  onDateSelect(month: string, day: string): void {
    console.log('[DEBUG] onDateSelect called with:', { month, day });
    
    // Create a date object for the selected date (using current year)
    const targetDate = new Date();
    targetDate.setMonth(parseInt(month) - 1); // Convert to 0-based month
    targetDate.setDate(parseInt(day));
    
    console.log('[DEBUG] Created target date:', targetDate);
    
    // Update selected values
    this.selectedMonth = parseInt(month);
    this.selectedDay = parseInt(day);
    this.selectedDate = `${month}/${day}`;
    
    // Trigger activity loading
    this.onDateOrTypeChange();
  }
}

// BungieNetPlatform Endpoints (https://destinydevs.github.io/BungieNetPlatform/docs/Endpoints)
// - Useful for user lookups, activity history, and manifest endpoints for both D1 and D2.
// - Can be referenced for advanced features like forum, admin, and token endpoints if needed in the future.
// - Current implementation already uses the most relevant endpoints for player and activity data. 