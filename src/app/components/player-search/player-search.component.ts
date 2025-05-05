import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BungieApiService, PlayerSearchResult } from '../../services/bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { DestinyManifestService } from '../../services/destiny-manifest.service';

@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  activities: { [key: string]: any[] } = {};
  loading: { [key: string]: boolean } = {};
  error: { [key: string]: string } = {};

  constructor(
    private bungieService: BungieApiService,
    public manifest: DestinyManifestService,
    private cdr: ChangeDetectorRef
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
          await this.loadActivityHistoryForCharacter(player, char.characterBase.characterId);
        }
      } else {
        const characters = Object.values(profile.characters?.data || {}) as Array<{ characterId: string }>;
        this.characters[player.membershipId] = characters;
        for (const char of characters) {
          await this.loadActivityHistoryForCharacter(player, char.characterId);
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

  async loadActivityHistoryForCharacter(player: PlayerSearchResult, characterId: string) {
    const key = `activities-${player.membershipId}-${characterId}`;
    this.loading[key] = true;
    this.error[key] = '';
    try {
      const isD1 = this.isD1Player(player);
      let allActivities: any[] = [];
      let page = 0;
      let hasMore = true;
      let oldestDate: string | null = null;
      let newestDate: string | null = null;

      console.log(`Starting activity history load for ${player.displayName} (${isD1 ? 'D1' : 'D2'})`);

      while (hasMore) {
        console.log(`Loading page ${page} for ${player.displayName} (${isD1 ? 'D1' : 'D2'})`);
        const activities = await firstValueFrom(
          isD1
            ? this.bungieService.getD1ActivityHistory(player.membershipType, player.membershipId, characterId, undefined, page)
            : this.bungieService.getActivityHistory(player.membershipType, player.membershipId, characterId, undefined, page)
        );

        if (!activities || !activities.activities || activities.activities.length === 0) {
          console.log(`No more activities found for page ${page}`);
          hasMore = false;
        } else {
          // Track the date range
          const oldestActivity = activities.activities[activities.activities.length - 1];
          const newestActivity = activities.activities[0];
          
          if (oldestActivity && oldestActivity.period) {
            const activityDate = new Date(oldestActivity.period).toISOString().split('T')[0];
            if (!oldestDate || activityDate < oldestDate) {
              oldestDate = activityDate;
            }
          }
          
          if (newestActivity && newestActivity.period) {
            const activityDate = new Date(newestActivity.period).toISOString().split('T')[0];
            if (!newestDate || activityDate > newestDate) {
              newestDate = activityDate;
            }
          }

          allActivities = allActivities.concat(activities.activities);
          console.log(`Loaded ${activities.activities.length} activities for page ${page}. Total: ${allActivities.length}`);
          console.log(`Current date range: ${oldestDate} to ${newestDate}`);
          
          page++;
          
          // Safety check - if we've loaded more than 1000 activities, stop
          if (allActivities.length >= 1000) {
            console.log(`Reached maximum activity limit (1000) for ${player.displayName}`);
            hasMore = false;
          }
        }
      }

      console.log(`Final activity load summary for ${player.displayName}:`, {
        totalActivities: allActivities.length,
        dateRange: `${oldestDate} to ${newestDate}`,
        firstActivity: allActivities[0] ? {
          date: new Date(allActivities[0].period).toISOString(),
          type: allActivities[0].activityDetails?.mode,
          referenceId: allActivities[0].activityDetails?.referenceId
        } : null,
        lastActivity: allActivities[allActivities.length - 1] ? {
          date: new Date(allActivities[allActivities.length - 1].period).toISOString(),
          type: allActivities[allActivities.length - 1].activityDetails?.mode,
          referenceId: allActivities[allActivities.length - 1].activityDetails?.referenceId
        } : null
      });

      this.activities[key] = allActivities;
    } catch (error: any) {
      console.error('Error loading activity history:', error);
      if (error.status === 503) {
        this.error[key] = 'Bungie API is temporarily unavailable. Please try again in a few minutes.';
      } else {
        this.error[key] = 'Error loading activity history';
      }
    } finally {
      this.loading[key] = false;
    }
  }

  async viewPGCR(activityId: string) {
    try {
      const pgcr = await this.bungieService.getPGCR(activityId).toPromise();
      console.log('PGCR:', pgcr);
      // TODO: Implement PGCR display
    } catch (error) {
      console.error('Error loading PGCR:', error);
    }
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

  /**
   * Returns activity types for a given year
   */
  getGroupedTypes(year: string): string[] {
    return Object.keys(this.getGroupedActivitiesByYearAndType()[year] || {});
  }

  /**
   * Returns entries for a given year and type
   */
  getGroupedEntries(year: string, type: string) {
    return (this.getGroupedActivitiesByYearAndType()[year]?.[type]) || [];
  }

  /**
   * Returns years as a sorted array (descending) for grouped activities
   */
  getGroupedYears(): string[] {
    return Object.keys(this.getGroupedActivitiesByYearAndType()).sort((a, b) => +b - +a);
  }

  /**
   * Returns activities grouped by year and type for the selected date, for all selected players.
   * Structure: { [year: string]: { [type: string]: { game, platform, player, activities }[] } }
   */
  getGroupedActivitiesByYearAndType() {
    const grouped: { [year: string]: { [type: string]: { game: string, platform: string, player: PlayerSearchResult, activities: any[] }[] } } = {};
    if (!this.selectedDate) return grouped;

    console.log('=== Activity Filtering Debug ===');
    console.log('Selected date:', this.selectedDate);

    this.selectedPlayers.forEach(player => {
      const game = this.isD1Player(player) ? 'D1' : 'D2';
      const platform = this.getPlatformName(player.membershipType);
      
      // Get all activities for this player across all characters
      const playerActivities: any[] = [];
      Object.keys(this.activities)
        .filter(key => key.startsWith(`activities-${player.membershipId}-`))
        .forEach(key => {
          const activities = this.activities[key] || [];
          playerActivities.push(...activities);
        });

      this.logActivitySummary(player, playerActivities);

      // Filter activities for the selected date
      const filtered = playerActivities.filter(activity =>
        this.isActivityOnDate(activity, this.selectedDate)
      );

      console.log(`Filtered to ${filtered.length} activities for ${this.selectedDate}`);

      filtered.forEach(activity => {
        const year = new Date(activity.period).getFullYear().toString();
        const type = activity.activityDetails?.mode || 'Unknown';
        
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

    console.log('=== Final Grouping ===');
    Object.keys(grouped).forEach(year => {
      console.log(`${year}: ${Object.keys(grouped[year]).length} activity types`);
    });

    return grouped;
  }

  onDateChange(newDate: string) {
    console.log('Date changed to:', newDate);
    this.selectedDate = newDate;
    this.cdr.detectChanges();
  }

  onDateInput(event: any) {
    const value = event.target.value;
    console.log('Date input value:', value);
    // Accept only valid yyyy-MM-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.selectedDate = value;
      console.log('Setting selected date to:', value);
      this.cdr.detectChanges();
    }
  }
} 