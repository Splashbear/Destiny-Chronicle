import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BungieApiService } from '../../services/bungie-api.service';

@Component({
  selector: 'app-player-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-container">
      <div class="search-box">
        <input 
          type="text" 
          [(ngModel)]="searchTerm"
          (keyup.enter)="searchPlayer()"
          placeholder="Enter Bungie Name (e.g. Guardian#1234) or Legacy Username"
          [disabled]="isLoading"
        >
        <button 
          (click)="searchPlayer()"
          [disabled]="isLoading || !searchTerm"
        >
          {{ isLoading ? 'Searching...' : 'Search' }}
        </button>
      </div>

      <!-- Error Message -->
      <div *ngIf="error" class="error-message">
        {{ error }}
        <div *ngIf="errorDetails" class="error-details">
          {{ errorDetails }}
        </div>
      </div>

      <!-- Loading Indicator -->
      <div *ngIf="isLoading" class="loading-indicator">
        <div class="spinner"></div>
        <p>Searching for guardians...</p>
      </div>

      <!-- Search Results -->
      <div *ngIf="searchResults.length > 0" class="search-results">
        <h3>Found Players:</h3>
        <div *ngFor="let player of searchResults" class="player-card" (click)="selectPlayer(player)">
          <div class="player-info">
            <h4>
              {{ player.bungieGlobalDisplayName }}
              <span *ngIf="player.bungieGlobalDisplayNameCode">
                #{{ player.bungieGlobalDisplayNameCode }}
              </span>
            </h4>
            <p>Platform: {{ getPlatformName(player.membershipType) }}</p>
            <p>Membership ID: {{ player.membershipId }}</p>
          </div>
          <button class="view-history">View History</button>
        </div>
      </div>

      <!-- No Results Message -->
      <div *ngIf="searchAttempted && searchResults.length === 0 && !error" class="no-results">
        No guardians found with that name. Try a different search term.
      </div>

      <!-- Selected Player History -->
      <div *ngIf="selectedPlayer && !isLoadingHistory" class="player-history">
        <h3>Activity History for {{ selectedPlayer.bungieGlobalDisplayName }}</h3>
        <div class="character-select" *ngIf="characters.length > 0">
          <button 
            *ngFor="let character of characters" 
            (click)="loadCharacterHistory(character.characterId)"
            [class.active]="character.characterId === selectedCharacterId"
          >
            {{ getClassName(character.classType) }}
          </button>
        </div>

        <div *ngIf="activities.length > 0" class="activity-list">
          <div *ngFor="let activity of activities" class="activity-card">
            <div class="activity-info">
              <h4>{{ activity.activityDetails.referenceId }}</h4>
              <p>{{ formatDate(activity.period) }}</p>
              <p>K/D: {{ activity.values.killsDeathsRatio.basic.displayValue }}</p>
            </div>
            <button (click)="viewPGCR(activity.activityDetails.instanceId)">
              View Details
            </button>
          </div>
        </div>

        <div *ngIf="activities.length === 0" class="no-activities">
          No activities found for this character.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .search-container {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    .search-box {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    input {
      flex: 1;
      padding: 0.5rem;
      font-size: 1rem;
      border: 1px solid #ccc;
      border-radius: 4px;
    }

    button {
      padding: 0.5rem 1rem;
      background: #2196f3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .error-message {
      color: #f44336;
      margin: 1rem 0;
    }

    .player-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      margin: 0.5rem 0;
      border: 1px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .player-card:hover {
      background-color: #f5f5f5;
    }

    .character-select {
      display: flex;
      gap: 1rem;
      margin: 1rem 0;
    }

    .character-select button {
      flex: 1;
      background: #424242;
    }

    .character-select button.active {
      background: #2196f3;
    }

    .activity-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      margin: 0.5rem 0;
      border: 1px solid #eee;
      border-radius: 4px;
    }

    .no-activities {
      text-align: center;
      padding: 2rem;
      color: #666;
    }

    .loading-indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 2rem 0;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #2196f3;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-details {
      font-size: 0.8em;
      margin-top: 0.5rem;
      color: #ff8a8a;
    }

    .no-results {
      text-align: center;
      padding: 2rem;
      color: #666;
      font-style: italic;
    }
  `]
})
export class PlayerSearchComponent implements OnInit {
  searchTerm = '';
  isLoading = false;
  isLoadingHistory = false;
  error: string | null = null;
  errorDetails: string | null = null;
  searchResults: any[] = [];
  searchAttempted = false;
  selectedPlayer: any = null;
  characters: any[] = [];
  selectedCharacterId: string | null = null;
  activities: any[] = [];

  constructor(private bungieService: BungieApiService) {}

  ngOnInit(): void {
    // Initialize component
  }

  async searchPlayer(): Promise<void> {
    if (!this.searchTerm) {
      this.searchResults = [];
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.errorDetails = null;
    this.searchResults = [];
    this.searchAttempted = true;
    this.selectedPlayer = null;
    this.characters = [];
    this.activities = [];

    try {
      console.log('Starting search for:', this.searchTerm);
      const results = await this.bungieService.searchPlayer(this.searchTerm).toPromise();
      console.log('Search results:', results);
      
      if (results && Array.isArray(results) && results.length > 0) {
        this.searchResults = results;
      } else {
        this.error = 'No players found with that name.';
        this.errorDetails = 'Try using the exact Bungie Name format (e.g., Guardian#1234) or a legacy username.';
      }
    } catch (error: any) {
      console.error('Search error:', error);
      this.error = 'Error searching for player.';
      
      if (error.status === 401) {
        this.errorDetails = 'API authentication failed. Please check your API key configuration.';
      } else if (error.status === 429) {
        this.errorDetails = 'Too many requests. Please wait a moment and try again.';
      } else if (error.status === 500) {
        this.errorDetails = 'An internal server error occurred. Please try again later.';
        if (error.error && error.error.Message) {
          this.errorDetails += ` (${error.error.Message})`;
        }
      } else if (error.status === 404) {
        this.errorDetails = 'Player not found. Please check the name and try again.';
      } else {
        this.errorDetails = error.message || 'Please try again later.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  async selectPlayer(player: any) {
    this.selectedPlayer = player;
    this.isLoadingHistory = true;
    this.characters = [];
    this.activities = [];
    this.selectedCharacterId = null;

    try {
      const profile = await this.bungieService.getProfile(
        player.membershipType,
        player.membershipId
      ).toPromise();

      this.characters = Object.values(profile.characters.data);
      
      if (this.characters.length > 0) {
        await this.loadCharacterHistory(this.characters[0].characterId);
      }
    } catch (error) {
      this.error = 'Error loading player profile. Please try again.';
      console.error('Profile error:', error);
    } finally {
      this.isLoadingHistory = false;
    }
  }

  async loadCharacterHistory(characterId: string) {
    this.selectedCharacterId = characterId;
    this.isLoadingHistory = true;
    this.activities = [];

    try {
      const history = await this.bungieService.getActivityHistory(
        this.selectedPlayer.membershipType,
        this.selectedPlayer.membershipId,
        characterId
      ).toPromise();

      this.activities = history.activities || [];
    } catch (error) {
      this.error = 'Error loading activity history. Please try again.';
      console.error('History error:', error);
    } finally {
      this.isLoadingHistory = false;
    }
  }

  async viewPGCR(instanceId: string) {
    try {
      const pgcr = await this.bungieService.getPGCR(instanceId).toPromise();
      // Here you would typically open a modal or navigate to a new route
      // to display the PGCR details
      console.log('PGCR:', pgcr);
    } catch (error) {
      this.error = 'Error loading activity details. Please try again.';
      console.error('PGCR error:', error);
    }
  }

  getPlatformName(membershipType: number): string {
    const platforms: { [key: number]: string } = {
      1: 'Xbox',
      2: 'PlayStation',
      3: 'Steam',
      4: 'Battle.net',
      5: 'Stadia',
      6: 'Epic Games',
      10: 'Demon',
      254: 'BungieNext'
    };
    return platforms[membershipType] || 'Unknown';
  }

  getClassName(classType: number): string {
    const classes: { [key: number]: string } = {
      0: 'Titan',
      1: 'Hunter',
      2: 'Warlock'
    };
    return classes[classType] || 'Unknown';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }
} 