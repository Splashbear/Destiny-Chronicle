import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pgcr-details',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pgcr-details" *ngIf="pgcr">
      <div class="pgcr-header">
        <h2>{{ getActivityName() }}</h2>
        <p class="timestamp">{{ pgcr.period | date:'medium' }}</p>
      </div>

      <!-- Basic Stats -->
      <div class="stats-section">
        <h3>Basic Stats</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">K/D/A</span>
            <span class="stat-value">
              {{ pgcr.values?.kills?.basic?.displayValue || '0' }} /
              {{ pgcr.values?.deaths?.basic?.displayValue || '0' }} /
              {{ pgcr.values?.assists?.basic?.displayValue || '0' }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">K/D Ratio</span>
            <span class="stat-value">{{ pgcr.values?.killsDeathsRatio?.basic?.displayValue || '0.00' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Score</span>
            <span class="stat-value">{{ pgcr.values?.score?.basic?.displayValue || '0' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Time Played</span>
            <span class="stat-value">{{ pgcr.values?.timePlayedSeconds?.basic?.displayValue || '0:00' }}</span>
          </div>
        </div>
      </div>

      <!-- Weapon Stats -->
      <div class="stats-section" *ngIf="pgcr.values?.weaponKills">
        <h3>Weapon Stats</h3>
        <div class="weapon-stats">
          <div class="weapon-stat" *ngFor="let weapon of getWeaponStats()">
            <span class="weapon-name">{{ weapon.name }}</span>
            <span class="weapon-kills">{{ weapon.kills }} kills</span>
          </div>
        </div>
      </div>

      <!-- Team Stats -->
      <div class="stats-section" *ngIf="pgcr.teams">
        <h3>Team Stats</h3>
        <div class="team-stats">
          <div class="team" *ngFor="let team of pgcr.teams">
            <h4>Team {{ team.teamId }}</h4>
            <p>Score: {{ team.score }}</p>
            <div class="team-players">
              <div class="player" *ngFor="let player of team.players">
                <span class="player-name">{{ player.destinyUserInfo.displayName }}</span>
                <span class="player-stats">
                  {{ player.stats.kills }}/{{ player.stats.deaths }}/{{ player.stats.assists }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pgcr-details {
      background: #23263a;
      border-radius: 8px;
      padding: 20px;
      color: #fff;
    }

    .pgcr-header {
      margin-bottom: 20px;
      border-bottom: 1px solid #35395a;
      padding-bottom: 10px;
    }

    .timestamp {
      color: #b3b8d1;
      font-size: 0.9em;
    }

    .stats-section {
      margin-bottom: 20px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 10px;
    }

    .stat-item {
      background: #2a2d42;
      padding: 10px;
      border-radius: 4px;
    }

    .stat-label {
      display: block;
      color: #b3b8d1;
      font-size: 0.9em;
      margin-bottom: 5px;
    }

    .stat-value {
      font-size: 1.2em;
      font-weight: 500;
    }

    .weapon-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }

    .weapon-stat {
      background: #2a2d42;
      padding: 10px;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .team-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 10px;
    }

    .team {
      background: #2a2d42;
      padding: 15px;
      border-radius: 4px;
    }

    .team h4 {
      margin: 0 0 10px 0;
      color: #b3b8d1;
    }

    .team-players {
      margin-top: 10px;
    }

    .player {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid #35395a;
    }

    .player:last-child {
      border-bottom: none;
    }

    .player-name {
      color: #fff;
    }

    .player-stats {
      color: #b3b8d1;
    }
  `]
})
export class PGCRDetailsComponent {
  @Input() pgcr: any;

  getActivityName(): string {
    // TODO: Use manifest service to get activity name
    return 'Activity Name';
  }

  getWeaponStats(): Array<{ name: string; kills: number }> {
    if (!this.pgcr.values?.weaponKills) {
      return [];
    }

    return Object.entries(this.pgcr.values.weaponKills)
      .map(([hash, data]: [string, any]) => ({
        name: `Weapon ${hash}`, // TODO: Use manifest service to get weapon name
        kills: data.basic.value
      }))
      .sort((a, b) => b.kills - a.kills);
  }
} 