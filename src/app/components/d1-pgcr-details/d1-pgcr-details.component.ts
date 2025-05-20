import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-d1-pgcr-details',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="pgcr-details" *ngIf="pgcr">
      <div class="pgcr-header">
        <h2>{{ pgcr.activityName }}</h2>
        <p class="timestamp">{{ pgcr.period | date:'medium' }}</p>
      </div>

      <!-- Activity Details -->
      <div class="activity-details">
        <div class="activity-info">
          <img [src]="pgcr.activityImage" alt="Activity" class="activity-image" *ngIf="pgcr.activityImage">
          <div class="activity-stats">
            <p><strong>Activity Type:</strong> {{ pgcr.activityType }}</p>
            <p><strong>Light Level:</strong> {{ pgcr.lightLevel }}</p>
            <p><strong>Duration:</strong> {{ formatDuration(pgcr.duration) }}</p>
          </div>
        </div>
      </div>

      <!-- Player Stats -->
      <div class="stats-section">
        <h3>Player Stats</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Kills</span>
            <span class="stat-value">{{ pgcr.kills }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Deaths</span>
            <span class="stat-value">{{ pgcr.deaths }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Assists</span>
            <span class="stat-value">{{ pgcr.assists }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">K/D Ratio</span>
            <span class="stat-value">{{ pgcr.kdRatio }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Score</span>
            <span class="stat-value">{{ pgcr.score }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Time Played</span>
            <span class="stat-value">{{ formatDuration(pgcr.timePlayed) }}</span>
          </div>
        </div>
      </div>

      <!-- Weapon Kills -->
      <div class="weapon-kills" *ngIf="pgcr.weaponKills?.length">
        <h3>Weapon Kills</h3>
        <div class="weapon-grid">
          <div class="weapon-item" *ngFor="let weapon of pgcr.weaponKills">
            <img [src]="weapon.icon" alt="Weapon" class="weapon-icon" *ngIf="weapon.icon">
            <div class="weapon-info">
              <span class="weapon-name">{{ weapon.name }}</span>
              <span class="weapon-kills">{{ weapon.kills }} kills</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Team Information -->
      <div class="team-section" *ngIf="pgcr.teams?.length">
        <h3>Teams</h3>
        <div class="team-grid">
          <div class="team" *ngFor="let team of pgcr.teams">
            <h4>Team {{ team.teamId }}</h4>
            <div class="team-stats">
              <p>Score: {{ team.score }}</p>
              <p>Standing: {{ team.standing }}</p>
            </div>
            <div class="team-players">
              <div class="player" *ngFor="let player of team.players">
                <img [src]="player.emblemPath" alt="Emblem" class="player-emblem" *ngIf="player.emblemPath">
                <div class="player-info">
                  <span class="player-name">{{ player.displayName }}</span>
                  <span class="player-class">{{ player.characterClass }}</span>
                  <span class="player-light">{{ player.lightLevel }}</span>
                </div>
                <div class="player-stats">
                  <span>K/D/A: {{ player.kills }}/{{ player.deaths }}/{{ player.assists }}</span>
                  <span>Score: {{ player.score }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pgcr-details {
      padding: 20px;
      background: #1a1a1a;
      color: #ffffff;
      border-radius: 8px;
      max-width: 800px;
      margin: 0 auto;
    }

    .pgcr-header {
      margin-bottom: 20px;
      text-align: center;
    }

    .activity-details {
      margin-bottom: 20px;
    }

    .activity-info {
      display: flex;
      gap: 20px;
      align-items: center;
    }

    .activity-image {
      width: 200px;
      height: 112px;
      object-fit: cover;
      border-radius: 4px;
    }

    .stats-section {
      margin-bottom: 20px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-top: 10px;
    }

    .stat-item {
      background: #2a2a2a;
      padding: 10px;
      border-radius: 4px;
      text-align: center;
    }

    .stat-label {
      display: block;
      font-size: 0.9em;
      color: #888;
    }

    .stat-value {
      display: block;
      font-size: 1.2em;
      font-weight: bold;
    }

    .weapon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 10px;
    }

    .weapon-item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #2a2a2a;
      padding: 10px;
      border-radius: 4px;
    }

    .weapon-icon {
      width: 40px;
      height: 40px;
    }

    .team-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 10px;
    }

    .team {
      background: #2a2a2a;
      padding: 15px;
      border-radius: 4px;
    }

    .team-players {
      margin-top: 10px;
    }

    .player {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: #333;
      border-radius: 4px;
      margin-bottom: 5px;
    }

    .player-emblem {
      width: 32px;
      height: 32px;
    }

    .player-info {
      flex: 1;
    }

    .player-name {
      display: block;
      font-weight: bold;
    }

    .player-class, .player-light {
      font-size: 0.9em;
      color: #888;
    }

    .player-stats {
      text-align: right;
      font-size: 0.9em;
    }
  `]
})
export class D1PGCRDetailsComponent {
  @Input() pgcr: any;

  formatDuration(seconds: number): string {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
} 