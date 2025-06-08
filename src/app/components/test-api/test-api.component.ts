import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { BungieApiService, PlayerSearchResult } from '../../services/bungie-api.service';
import { DestinyManifestService } from '../../services/destiny-manifest.service';
import { Observable } from 'rxjs';

// Enum mappings for isolated modules
const MembershipType = {
  None: 0,
  TigerXbox: 1,
  TigerPsn: 2,
  TigerSteam: 3,
  TigerBlizzard: 4,
  TigerStadia: 5,
  TigerEgs: 6,
  TigerDemon: 10,
  BungieNext: 254
} as const;

@Component({
  selector: 'app-test-api',
  standalone: true,
  imports: [CommonModule, FormsModule, JsonPipe],
  template: `
    <div class="test-container">
      <h2>API Test Component</h2>
      
      <div class="test-section">
        <h3>Player Search Test (D2)</h3>
        <input [(ngModel)]="searchName" placeholder="Enter player name">
        <button (click)="testPlayerSearchD2()">Test D2 Search</button>
        <button (click)="testPlayerSearchD1()">Test D1 Search</button>
        <div *ngIf="searchResults.length > 0">
          <h4>Search Results:</h4>
          <ul>
            <li *ngFor="let player of searchResults">
              {{ player.displayName }} ({{ player.membershipType }})
            </li>
          </ul>
        </div>
      </div>

      <div class="test-section">
        <h3>Profile Test</h3>
        <button (click)="testGetProfile()" [disabled]="!selectedPlayer">Test Get Profile</button>
        <div *ngIf="profileData">
          <h4>Profile Data:</h4>
          <pre>{{ profileData | json }}</pre>
        </div>
      </div>

      <div class="test-section">
        <h3>Activity History Test</h3>
        <button (click)="testGetActivityHistory()" [disabled]="!selectedPlayer || !selectedCharacterId">Test Activity History</button>
        <div *ngIf="activityHistory">
          <h4>Activity History:</h4>
          <pre>{{ activityHistory | json }}</pre>
        </div>
      </div>

      <div class="test-section">
        <h3>Manifest Test</h3>
        <button (click)="testGetManifest()">Test Get Manifest</button>
        <div *ngIf="manifestData">
          <h4>Manifest Data:</h4>
          <pre>{{ manifestData | json }}</pre>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .test-container {
      padding: 20px;
    }
    .test-section {
      margin-bottom: 20px;
      padding: 15px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    button {
      margin: 5px;
      padding: 5px 10px;
    }
    pre {
      background: #f5f5f5;
      padding: 10px;
      border-radius: 4px;
      overflow: auto;
    }
  `]
})
export class TestApiComponent implements OnInit {
  searchName = '';
  searchResults: PlayerSearchResult[] = [];
  selectedPlayer: PlayerSearchResult | null = null;
  profileData: any = null;
  activityHistory: any = null;
  manifestData: any = null;
  selectedCharacterId: string = '';

  constructor(
    private bungieApiService: BungieApiService,
    private manifestService: DestinyManifestService
  ) {}

  ngOnInit(): void {}

  testPlayerSearchD2() {
    if (!this.searchName) return;
    this.bungieApiService.searchD2Player(this.searchName).subscribe({
      next: (response) => {
        this.searchResults = response.Response;
        if (this.searchResults.length > 0) {
          this.selectedPlayer = this.searchResults[0];
        }
      },
      error: (error) => {
        console.error('D2 Search error:', error);
      }
    });
  }

  testPlayerSearchD1() {
    if (!this.searchName) return;
    // Use 1 for TigerXbox to avoid const enum error
    this.bungieApiService.searchD1Player(this.searchName, 1).subscribe({
      next: (results) => {
        this.searchResults = results;
        if (this.searchResults.length > 0) {
          this.selectedPlayer = this.searchResults[0];
        }
      },
      error: (error) => {
        console.error('D1 Search error:', error);
      }
    });
  }

  testGetProfile() {
    if (!this.selectedPlayer) return;
    this.bungieApiService.getProfile(
      this.selectedPlayer.membershipType,
      this.selectedPlayer.membershipId
    ).subscribe({
      next: (profile) => {
        this.profileData = profile;
        if (profile.characters?.data) {
          const characterIds = Object.keys(profile.characters.data);
          if (characterIds.length > 0) {
            this.selectedCharacterId = characterIds[0];
          }
        }
      },
      error: (error) => {
        console.error('Profile error:', error);
      }
    });
  }

  testGetActivityHistory() {
    if (!this.selectedPlayer || !this.selectedCharacterId) return;
    this.bungieApiService.getActivityHistory(
      this.selectedPlayer.membershipType,
      this.selectedPlayer.membershipId,
      this.selectedCharacterId
    ).subscribe({
      next: (history) => {
        this.activityHistory = history;
      },
      error: (error) => {
        console.error('Activity history error:', error);
      }
    });
  }

  testGetManifest() {
    this.manifestService.loadManifest().then(() => {
      this.manifestData = 'Manifest loaded!';
    }).catch((error) => {
      this.manifestData = 'Manifest load error: ' + error;
    });
  }
} 