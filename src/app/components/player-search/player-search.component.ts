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
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption } from '../../models/activity';
import { ActivityDbService, StoredActivity } from '../../services/activity-db.service';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { TimezoneService } from '../../services/timezone.service';

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
  mode?: number; // Add mode property for activity type filtering
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

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef,
    private activityCacheService: ActivityCacheService,
    private pgcrCacheService: PGCRCacheService,
    private activityDb: ActivityDbService,
    private timezoneService: TimezoneService
  ) {
  }

  ngOnInit(): void {
    // Don't set default date - let user select it
    this.selectedDate = '';
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
                character.mode || 0,
                page
              )
            : this.bungieService.getActivityHistory(
                character.membershipType,
                character.membershipId,
                character.characterId,
                page,
                character.mode
              )
        );

        const activities = character.game === 'D1'
          ? response?.data?.activities || []
          : response?.activities || [];

        return activities;
      } catch (error) {
        retries++;
        if (retries === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * retries));
      }
    }
    return [];
  }

  private async processActivityBatch(activities: ActivityHistory[], character: CharacterWithGame): Promise<void> {
    const existingIds = new Set(
      (await this.activityDb.getAllActivitiesForCharacter(
        character.membershipId,
        character.characterId
      )).map(a => a.activityDetails?.instanceId)
    );

    const newActivities = activities.filter(activity => 
      !existingIds.has(activity.activityDetails?.instanceId)
    );

    if (newActivities.length > 0) {
      const storedActivities: StoredActivity[] = newActivities.map(activity => ({
        ...activity,
        membershipId: character.membershipId,
        characterId: character.characterId,
        instanceId: activity.activityDetails?.instanceId,
        mode: activity.activityDetails?.mode
      }));
      
      await this.activityDb.addActivities(storedActivities);
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
          icon: this.getActivityTypeIcon(type),
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

  private getActivityDurationSeconds(activity: ActivityHistory): number {
    const values = activity.values as any;
    const seconds = values && values['timePlayedSeconds']?.basic?.value;
    
    // More reasonable validation
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
      console.warn('[DEBUG] Invalid activity duration:', seconds, activity);
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

  async viewPGCR(activityId: string | number) {
    const id = activityId?.toString();
    if (!id) {
      console.error('Invalid activityId passed to viewPGCR:', activityId);
      return;
    }
    const url = `https://www.bungie.net/en/PGCR/${id}`;
    window.open(url, '_blank');
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
    let totalTime = 0;
    let totalActivityTime = 0;
    let totalActivityCount = 0;
    const perType: { [type: string]: { count: number, time: number } } = {};

    // Use filtered activities for stats
    const activities = this.filteredActivitiesForDate;
    for (const player of this.selectedPlayers) {
      const characters = this.characters[player.membershipId] || [];
      for (const char of characters) {
        totalTime += Number(char.minutesPlayedTotal || 0);
      }
    }
    totalActivityCount = activities.length;
    for (const activity of activities) {
      const type = this.getActivityType(activity.activityDetails?.mode || 0);
      if (!perType[type]) perType[type] = { count: 0, time: 0 };
      perType[type].count += 1;
      let seconds = this.getActivityDurationSeconds(activity);
      if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0 || seconds > 100000) {
        seconds = 0;
      }
      perType[type].time += seconds;
      totalActivityTime += seconds;
    }
    this.accountStats = {
      totalTime,
      totalActivityTime,
      totalActivityCount,
      perType: { ...perType }
    };
    this.loadingAccountStats = false;
    this.cdr.detectChanges();
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
    console.log('[DEBUG] Date or type changed, reloading activities');
    if (!this.selectedDate) {
      console.log('[DEBUG] No date selected, skipping load');
      return;
    }

    // Clear cache when date or type changes
    this.clearCache();
    
    // If we have players selected, load their activities
    if (this.selectedPlayers.length > 0) {
      console.log('[DEBUG] Loading activities for selected players');
      this.loadAllFilteredActivities();
    } else {
      console.log('[DEBUG] No players selected yet, activities will load when players are added');
    }
    
    // Process and group all activities
    this.processAndGroupActivities();
    
    // Update the UI
    this.cdr.detectChanges();
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

  getActivityTypeIcon(activityType: string): string {
    const refId = ACTIVITY_TYPE_REFERENCE_IDS[activityType.toLowerCase()] || ACTIVITY_TYPE_REFERENCE_IDS['other'];
    // Use D2 icons for type icons
    return this.manifest.getActivityIcon(refId, false) || '';
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
    const [month, day] = this.selectedDate.split('-').map(Number);
    const allFilteredActivities: ActivityWithMembership[] = [];
    for (const player of this.selectedPlayers) {
      const playerActivities = this.getPlayerActivities(player.membershipId);
      // Debug log: all activities for player
      console.log(`[DEBUG] [Filter] Player ${player.displayName} (${player.membershipId}) has ${playerActivities.length} activities in DB`);
      const playerFilteredActivities = playerActivities
        .filter(activity => this.isActivityOnSelectedDate(activity))
        .map(activity => ({
          ...activity,
          membershipId: player.membershipId,
          displayName: player.displayName,
          platform: player.platform,
          game: player.game,
          iconPath: this.manifest.getActivityIcon(activity.activityDetails?.referenceId, player.game === 'D1')
        }));
      // Debug log: filtered activities for player
      console.log(`[DEBUG] [Filter] Filtered ${playerFilteredActivities.length} activities for player ${player.displayName} (${player.membershipId}) on ${month}/${day}`);
      playerFilteredActivities.slice(0, 10).forEach(a => {
        const utcDate = new Date(a.period);
        const { month: localMonth, day: localDay } = this.timezoneService.getLocalMonthAndDay(a.period);
        console.log(`[DEBUG] [Filter] Matched Activity: UTC=${utcDate.toISOString()}, Local=${utcDate.toLocaleString()}, Local Month/Day=${localMonth}/${localDay}, InstanceId=${a.activityDetails?.instanceId}`);
      });
      allFilteredActivities.push(...playerFilteredActivities);
    }
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
    this.filteredActivitiesForDate = dedupedActivities;
    // Debug log: all deduped and sorted activities
    console.log(`[DEBUG] [Filter] Total deduped & sorted activities for all players: ${dedupedActivities.length}`);
    dedupedActivities.slice(0, 10).forEach(a => {
      const utcDate = new Date(a.period);
      const { month: localMonth, day: localDay } = this.timezoneService.getLocalMonthAndDay(a.period);
      console.log(`[DEBUG] [Filter] Deduped Activity: UTC=${utcDate.toISOString()}, Local=${utcDate.toLocaleString()}, Local Month/Day=${localMonth}/${localDay}, Name=${a.displayName}, InstanceId=${a.activityDetails?.instanceId}`);
    });
    return dedupedActivities;
  }

  async syncSpecificPGCR(activityId: string) {
    try {
      console.log(`[DEBUG] Attempting to sync specific PGCR: ${activityId}`);
      
      // First check if it's already in the database
      const existingActivity = await this.activityDb.getActivityByInstanceId(activityId);
      if (existingActivity) {
        console.log('[DEBUG] PGCR already exists in database');
        return;
      }

      // Fetch the PGCR from API
      const pgcr = await firstValueFrom(this.bungieService.getPGCR(activityId));
      if (!pgcr) {
        throw new Error('No PGCR data received');
      }

      // Convert PGCR to StoredActivity format
      const storedActivity: StoredActivity = {
        ...pgcr,
        membershipId: pgcr.entries?.[0]?.player?.destinyUserInfo?.membershipId || '',
        characterId: pgcr.entries?.[0]?.characterId || '',
        instanceId: activityId,
        mode: pgcr.activityDetails?.mode
      };

      // Add to database
      await this.activityDb.addActivities([storedActivity]);
      console.log('[DEBUG] Successfully added PGCR to database');
      
      // Refresh the activity list
      await this.loadAllFilteredActivities();
    } catch (error) {
      console.error('[DEBUG] Error syncing specific PGCR:', error);
      throw error;
    }
  }

  private isDuplicateActivity(a1: ActivityHistory, a2: ActivityHistory): boolean {
    return a1.activityDetails?.instanceId === a2.activityDetails?.instanceId;
  }
}

// BungieNetPlatform Endpoints (https://destinydevs.github.io/BungieNetPlatform/docs/Endpoints)
// - Useful for user lookups, activity history, and manifest endpoints for both D1 and D2.
// - Can be referenced for advanced features like forum, admin, and token endpoints if needed in the future.
// - Current implementation already uses the most relevant endpoints for player and activity data. 