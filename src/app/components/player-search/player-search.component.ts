import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BungieApiService, PlayerSearchResult } from '../../services/bungie-api.service';

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

  constructor(private bungieService: BungieApiService) {}

  ngOnInit(): void {}

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
    if (!searchTerm) return;

    const key = `d1-${membershipType}-${searchTerm}`;
    this.loading[key] = true;
    this.error[key] = '';

    try {
      const results = await this.bungieService.searchD1Player(searchTerm, membershipType).toPromise();
      if (results && results.length > 0) {
        this.selectedPlayers = [...this.selectedPlayers, ...results];
      } else {
        this.error[key] = 'No players found';
      }
    } catch (error) {
      console.error('Error searching D1 player:', error);
      this.error[key] = 'Error searching for player';
    } finally {
      this.loading[key] = false;
    }
  }

  async searchD2Player(searchTerm: string) {
    if (!searchTerm) return;

    const key = `d2-${searchTerm}`;
    this.loading[key] = true;
    this.error[key] = '';

    try {
      const results = await this.bungieService.searchD2Player(searchTerm).toPromise();
      if (results && results.length > 0) {
        this.selectedPlayers = [...this.selectedPlayers, ...results];
      } else {
        this.error[key] = 'No players found';
      }
    } catch (error) {
      console.error('Error searching D2 player:', error);
      this.error[key] = 'Error searching for player';
    } finally {
      this.loading[key] = false;
    }
  }

  async selectPlayer(player: PlayerSearchResult) {
    if (this.selectedPlayers.some(p => p.membershipId === player.membershipId)) {
      return;
    }

    this.selectedPlayers.push(player);
    this.selectedCharacterIds[player.membershipId] = undefined;
    await this.loadCharacterHistory(player);
  }

  async loadCharacterHistory(player: PlayerSearchResult) {
    const key = `characters-${player.membershipId}`;
    this.loading[key] = true;
    this.error[key] = '';

    try {
      const isD1 = this.isD1Player(player);
      const profile = await (isD1 
        ? this.bungieService.getD1Profile(player.membershipType, player.membershipId)
        : this.bungieService.getProfile(player.membershipType, player.membershipId)
      ).toPromise();

      if (profile) {
        if (isD1) {
          // D1 profile structure
          this.characters[player.membershipId] = profile.characters || [];
          if (this.characters[player.membershipId].length > 0) {
            this.selectedCharacterIds[player.membershipId] = this.characters[player.membershipId][0].characterBase.characterId;
            await this.loadActivityHistory(player);
          }
        } else {
          // D2 profile structure
          this.characters[player.membershipId] = Object.values(profile.characters.data);
          if (this.characters[player.membershipId].length > 0) {
            this.selectedCharacterIds[player.membershipId] = this.characters[player.membershipId][0].characterId;
            await this.loadActivityHistory(player);
          }
        }
      }
    } catch (error) {
      console.error('Error loading character history:', error);
      this.error[key] = 'Error loading character history';
    } finally {
      this.loading[key] = false;
    }
  }

  async loadActivityHistory(player: PlayerSearchResult) {
    const characterId = this.selectedCharacterIds[player.membershipId];
    if (!characterId) return;

    const key = `activities-${player.membershipId}-${characterId}`;
    this.loading[key] = true;
    this.error[key] = '';

    try {
      const activities = await this.bungieService.getActivityHistory(
        player.membershipType,
        player.membershipId,
        characterId
      ).toPromise();

      if (activities && activities.activities) {
        this.activities[player.membershipId] = activities.activities;
      }
    } catch (error) {
      console.error('Error loading activity history:', error);
      this.error[key] = 'Error loading activity history';
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

  getGroupedActivities() {
    const grouped: { [key: string]: { [key: string]: any[] } } = {};
    
    this.selectedPlayers.forEach(player => {
      const game = this.isD1Player(player) ? 'D1' : 'D2';
      const platform = this.getPlatformName(player.membershipType);
      const key = `${game}-${platform}-${player.membershipId}`;
      
      if (!grouped[game]) {
        grouped[game] = {};
      }
      
      if (!grouped[game][platform]) {
        grouped[game][platform] = [];
      }
      
      const activities = this.activities[player.membershipId] || [];
      if (this.selectedDate) {
        const date = new Date(this.selectedDate);
        const filtered = activities.filter(activity => {
          const activityDate = new Date(activity.period);
          return activityDate.toDateString() === date.toDateString();
        });
        grouped[game][platform].push(...filtered);
      } else {
        grouped[game][platform].push(...activities);
      }
    });
    
    return grouped;
  }
} 