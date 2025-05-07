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
import { ACTIVITY_TYPE_OPTIONS, ActivityTypeOption } from '../../models/activity-types';

interface YearGroup {
  year: string;
  types: { [type: string]: ActivityEntry[] };
}

interface ActivityEntry {
  game: string;
  platform: string;
  player: PlayerSearchResult;
  activities: ActivityHistory[];
}

// Shared activity icons for both D1 and D2
const SHARED_ACTIVITY_ICONS: { [type: string]: string } = {
  raid: 'assets/icons/raid.png',
  strike: 'assets/icons/strike.png',
  crucible: 'assets/icons/crucible.png',
  dungeon: 'assets/icons/dungeon.png',
  nightfall: 'assets/icons/nightfall.png',
  other: 'assets/icons/activity.png',
};

@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [CommonModule, FormsModule, PGCRDetailsComponent],
  templateUrl: './player-search.component.html',
  styleUrls: ['./player-search.component.css']
})
export class PlayerSearchComponent implements OnInit {
  d1XboxSearchTerm: string = '';
  d1PsnSearchTerm: string = '';
  d2SearchTerm: string = '';
  selectedDate: string = '';
  selectedPlayers: PlayerSearchResult[] = [];
  selectedCharacterIds: { [key: string]: string | undefined } = {};
  characters: { [key: string]: any[] } = {};
  activities: { [key: string]: ActivityHistory[] } = {};
  loading: { [key: string]: boolean } = {};
  error: { [key: string]: string } = {};
  selectedPGCR: any = null;
  showPGCRModal: boolean = false;
  activityTypeOptions = ACTIVITY_TYPE_OPTIONS;
  selectedActivityType: ActivityTypeOption = ACTIVITY_TYPE_OPTIONS[0]; // Default to 'All'

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef,
    private activityCacheService: ActivityCacheService,
    private pgcrCacheService: PGCRCacheService
  ) {}

  ngOnInit(): void {
    // Do not set selectedDate by default; require user to pick a date
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

    try {
      const response = await firstValueFrom(this.bungieService.searchD2Player(searchTerm));
      console.log('D2 search response:', response);
      
      if (response?.ErrorCode === 1 && response?.Response?.length > 0) {
        // Try to get Cross Save primary from linked profiles
        const firstPlayer = response.Response[0];
        let crossSavePlayer: PlayerSearchResult | undefined;
        if (firstPlayer) {
          const linkedProfiles = await firstValueFrom(this.bungieService.getLinkedProfiles(firstPlayer.membershipType, firstPlayer.membershipId));
          if (linkedProfiles && linkedProfiles.profiles) {
            const crossSaveProfile = linkedProfiles.profiles.find((profile: any) => profile.isCrossSavePrimary);
            if (crossSaveProfile) {
              crossSavePlayer = {
                displayName: crossSaveProfile.displayName,
                membershipType: crossSaveProfile.membershipType,
                membershipId: crossSaveProfile.membershipId,
                bungieGlobalDisplayName: crossSaveProfile.bungieGlobalDisplayName,
                bungieGlobalDisplayNameCode: crossSaveProfile.bungieGlobalDisplayNameCode,
                isCrossSavePrimary: true
              };
            }
          }
        }
        let newPlayers: PlayerSearchResult[] = [];
        if (crossSavePlayer) {
          newPlayers = [crossSavePlayer];
        } else {
          // Fallback: show all non-Stadia/Epic accounts
          newPlayers = response.Response.filter(
            (player: PlayerSearchResult) =>
              !this.selectedPlayers.some(p => p.membershipId === player.membershipId) &&
              player.membershipType !== 5 &&
              player.membershipType !== 6
          );
        }
        for (const player of newPlayers) {
          await this.selectPlayer(player);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        this.error[key] = 'No players found';
      }
    } catch (error: any) {
      console.error('Error searching D2 player:', error);
      if (error.status === 503) {
        this.error[key] = 'Bungie API is temporarily unavailable. Please try again in a few minutes.';
      } else {
        this.error[key] = 'Error searching for player';
      }
    } finally {
      this.loading[key] = false;
    }
  }

  async selectPlayer(player: PlayerSearchResult) {
    console.log('selectPlayer called', { player });
    
    // Check if player is already selected
    if (this.selectedPlayers.some(p => p.membershipId === player.membershipId)) {
      console.log('Player already selected, skipping:', player.membershipId);
      return;
    }

    // Add player to selection
    this.selectedPlayers.push(player);
    this.selectedCharacterIds[player.membershipId] = undefined;
    
    try {
      await this.loadCharacterHistory(player);
    } catch (error) {
      console.error('Error in selectPlayer:', error);
      // Remove player if character history loading fails
      this.selectedPlayers = this.selectedPlayers.filter(p => p.membershipId !== player.membershipId);
      delete this.selectedCharacterIds[player.membershipId];
      throw error;
    }
  }

  async loadCharacterHistory(player: PlayerSearchResult) {
    console.log('loadCharacterHistory called', { player });
    const key = `characters-${player.membershipId}`;
    this.loading[key] = true;
    this.error[key] = '';

    try {
      const isD1 = this.isD1Player(player);
      const profile = await firstValueFrom(
        isD1 
          ? this.bungieService.getD1Profile(player.membershipType, player.membershipId)
          : this.bungieService.getProfile(player.membershipType, player.membershipId)
      );

      console.log('Profile fetch result:', profile);
      
      if (!profile) {
        throw new Error('No profile data received');
      }

      if (isD1) {
        this.characters[player.membershipId] = profile.data?.characters || [];
        for (const char of this.characters[player.membershipId]) {
          await this.loadActivityHistoryForCharacter({
            characterId: char.characterId,
            membershipType: player.membershipType,
            membershipId: player.membershipId
          });
        }
      } else {
        const characters = Object.values(profile.characters?.data || {}) as Array<{ characterId: string }>;
        this.characters[player.membershipId] = characters;
        for (const char of characters) {
          await this.loadActivityHistoryForCharacter({
            characterId: char.characterId,
            membershipType: player.membershipType,
            membershipId: player.membershipId
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

  async loadActivityHistoryForCharacter(character: Character): Promise<void> {
    try {
      console.log(`Loading activity history for character ${character.characterId}`);
      
      // Check cache first
      const cachedActivities = this.activityCacheService.getCachedActivities(
        character.membershipType,
        character.membershipId,
        character.characterId
      );

      if (cachedActivities) {
        console.log('Using cached activities');
        this.processActivities(cachedActivities, character);
        return;
      }

      console.log('No cache found, fetching from API');
      let page = 0;
      let hasMore = true;
      const allActivities: ActivityHistory[] = [];

      // Determine if this is a D1 or D2 character
      const isD1 = this.isD1Player({ membershipType: character.membershipType, membershipId: character.membershipId } as PlayerSearchResult);

      while (hasMore) {
        console.log(`Fetching page ${page + 1}`);
        const response = await firstValueFrom(
          isD1
            ? this.bungieService.getD1ActivityHistory(
                character.membershipType,
                character.membershipId,
                character.characterId,
                page
              )
            : this.bungieService.getActivityHistory(
                character.membershipType,
                character.membershipId,
                character.characterId,
                page
              )
        );

        const activities = response?.Response?.activities || [];
        if (!activities || activities.length === 0) {
          hasMore = false;
          continue;
        }

        allActivities.push(...activities);
        console.log(`Retrieved ${activities.length} activities for page ${page + 1}`);

        // Check if we've reached the end
        if (activities.length < 250) { // Bungie's page size
          hasMore = false;
        } else {
          page++;
        }
      }

      // Cache the activities
      this.activityCacheService.cacheActivities(
        allActivities,
        character.membershipType,
        character.membershipId,
        character.characterId
      );

      this.processActivities(allActivities, character);
    } catch (error) {
      console.error('Error loading activity history:', error);
      // Handle error appropriately
    }
  }

  private processActivities(activities: ActivityHistory[], character: Character): void {
    // Store activities in the activities map
    const key = `activities-${character.membershipId}-${character.characterId}`;
    this.activities[key] = activities;
    
    // Update the UI
    this.cdr.detectChanges();
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

  isD1Player(player: PlayerSearchResult): boolean {
    return this.bungieService.isD1Player(player);
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
   * Helper to check if two date strings have the same month and day (ignores year, time, and timezone)
   */
  isSameMonthDay(dateStr1: string, dateStr2: string): boolean {
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    return d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCDate() === d2.getUTCDate();
  }

  /**
   * Helper to check if an activity occurred on the given date
   * Takes into account activities that might span across midnight
   */
  isActivityOnDate(activity: any, targetDate: string): boolean {
    if (!activity.period) {
      console.log('Activity has no period:', activity);
      return false;
    }

    const activityDate = new Date(activity.period);
    const activityDateStr = activityDate.toISOString().split('T')[0];

    // Log detailed date information
    console.log('Activity Date Details:', {
      activityPeriod: activity.period,
      activityDate: activityDate,
      activityDateUTC: activityDate.toUTCString(),
      activityDateISO: activityDate.toISOString(),
      activityDateStr: activityDateStr,
      targetDate: targetDate,
      isMatch: activityDateStr === targetDate,
      activityDetails: {
        mode: activity.activityDetails?.mode,
        referenceId: activity.activityDetails?.referenceId,
        instanceId: activity.activityDetails?.instanceId
      }
    });

    return activityDateStr === targetDate;
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
          this.isActivityOnDate(activity, this.selectedDate)
        );
        console.log(`Filtered to ${filtered.length} activities for date ${this.selectedDate}`);
        grouped[game][platform].push(...filtered);
      } else {
        grouped[game][platform].push(...playerActivities);
      }
    });
    return grouped;
  }

  getGroupedActivitiesByYearAndType(): YearGroup[] {
    const grouped: { [year: string]: { [type: string]: ActivityEntry[] } } = {};
    
    if (!this.selectedDate) return [];

    this.selectedPlayers.forEach((player: PlayerSearchResult) => {
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

      // Filter activities for the selected date
      const filtered = playerActivities.filter(activity =>
        this.isActivityOnDate(activity, this.selectedDate)
      );

      filtered.forEach(activity => {
        const year = new Date(activity.period).getFullYear().toString();
        const type = this.getActivityType(activity.activityDetails?.mode || 0);
        
        if (!grouped[year]) grouped[year] = {};
        if (!grouped[year][type]) grouped[year][type] = [];
        
        let entry = grouped[year][type].find(e => 
          e.player.membershipId === player.membershipId && 
          e.platform === platform && 
          e.game === game
        );
        
        if (!entry) {
          entry = { game, platform, player, activities: [] };
          grouped[year][type].push(entry);
        }
        entry.activities.push(activity);
      });
    });

    // Convert to array format
    return Object.entries(grouped).map(([year, types]) => ({
      year,
      types
    })).sort((a, b) => +b.year - +a.year);
  }

  getGroupedTypes(year: string): string[] {
    const yearGroup = this.getGroupedActivitiesByYearAndType().find(g => g.year === year);
    return yearGroup ? Object.keys(yearGroup.types) : [];
  }

  getGroupedEntries(year: string, type: string): ActivityEntry[] {
    const yearGroup = this.getGroupedActivitiesByYearAndType().find(g => g.year === year);
    return yearGroup?.types[type] || [];
  }

  getActivityType(mode: number): string {
    switch (mode) {
      case 4:
        return 'Raid';
      case 5:
        return 'Crucible';
      case 6:
        return 'Strike';
      case 46:
        return 'Nightfall';
      case 82:
        return 'Dungeon';
      default:
        return 'Other';
    }
  }

  onDateChange(newDate: string): void {
    console.log('Date changed to:', newDate);
    this.selectedDate = newDate;
    this.cdr.detectChanges();
  }

  onDateInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    console.log('Date input value:', value);
    // Accept only valid yyyy-MM-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.selectedDate = value;
      console.log('Setting selected date to:', value);
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

  getFilteredActivities(activities: ActivityHistory[], game: string): ActivityHistory[] {
    if (!this.selectedActivityType || this.selectedActivityType.label === 'All') {
      return activities;
    }
    return activities.filter(activity => {
      const mode = activity.activityDetails.mode;
      if (this.selectedActivityType.label === 'Dungeon') {
        return game === 'D2' && mode === this.selectedActivityType.d2Mode;
      }
      return (
        (game === 'D1' && mode === this.selectedActivityType.d1Mode) ||
        (game === 'D2' && mode === this.selectedActivityType.d2Mode)
      );
    });
  }

  onActivityTypeChange(event: Event): void {
    // The [(ngModel)] binding already updates selectedActivityType, but this can be used for any side effects if needed
    // For now, just trigger change detection or filtering if needed
    this.cdr.detectChanges();
  }
}

// BungieNetPlatform Endpoints (https://destinydevs.github.io/BungieNetPlatform/docs/Endpoints)
// - Useful for user lookups, activity history, and manifest endpoints for both D1 and D2.
// - Can be referenced for advanced features like forum, admin, and token endpoints if needed in the future.
// - Current implementation already uses the most relevant endpoints for player and activity data. 