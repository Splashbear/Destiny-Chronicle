import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';
import { AccountStats } from '../../services/stats.service';

@Component({
  selector: 'app-account-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-slate-800/95 rounded-lg shadow-lg p-6 mb-6">
      <h3 class="text-xl font-bold text-white mb-4">Account Summary</h3>
      
      <!-- Player List -->
      <div class="mb-6">
        <h4 class="text-lg font-semibold text-slate-300 mb-3">Selected Players</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div *ngFor="let player of selectedPlayers" 
               class="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
            <img *ngIf="player.iconPath" 
                 [src]="player.iconPath" 
                 class="w-10 h-10 rounded-full" 
                 [alt]="player.displayName + ' avatar'">
            <div class="flex-1">
              <div class="text-white font-medium">{{ player.displayName }}</div>
              <div class="text-sm text-slate-400">{{ player.platform }} • {{ player.game }}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs px-2 py-1 rounded"
                    [ngClass]="player.game === 'D1' ? 'bg-orange-900/30 text-orange-300' : 'bg-blue-900/30 text-blue-300'">
                {{ player.game }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Summary -->
      <div *ngIf="stats" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-slate-700/50 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-white">{{ stats.totalActivities }}</div>
          <div class="text-sm text-slate-400">Total Activities</div>
        </div>
        
        <div class="bg-slate-700/50 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-white">{{ formatTimePlayed(stats.totalTimePlayed) }}</div>
          <div class="text-sm text-slate-400">Time Played</div>
        </div>
        
        <div class="bg-slate-700/50 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-white">{{ selectedPlayers.length }}</div>
          <div class="text-sm text-slate-400">Accounts</div>
        </div>
      </div>

      <!-- Platform Breakdown -->
      <div *ngIf="stats && stats.platformStats.size > 0" class="mt-6">
        <h4 class="text-lg font-semibold text-slate-300 mb-3">Platform Breakdown</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div *ngFor="let platformEntry of getPlatformStatsEntries()" 
               class="bg-slate-700/50 rounded-lg p-3">
            <div class="text-white font-medium mb-2">{{ platformEntry.platform }}</div>
            <div class="text-sm text-slate-400 space-y-1">
              <div>{{ platformEntry.stats.activities }} activities</div>
              <div>{{ formatTimePlayed(platformEntry.stats.timePlayed) }} played</div>
              <div>{{ platformEntry.stats.characters }} characters</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Type Breakdown -->
      <div *ngIf="stats && stats.activitiesByType.size > 0" class="mt-6">
        <h4 class="text-lg font-semibold text-slate-300 mb-3">Activity Types</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div *ngFor="let typeEntry of getActivityTypeEntries()" 
               class="bg-slate-700/50 rounded-lg p-2 text-center">
            <div class="text-white font-medium">{{ typeEntry.count }}</div>
            <div class="text-xs text-slate-400">{{ typeEntry.type }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSummaryComponent {
  @Input() selectedPlayers: PlayerSearchDisplay[] = [];
  @Input() stats: AccountStats | null = null;

  /**
   * Formats time played in hours and minutes
   */
  formatTimePlayed(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Gets platform stats entries for template iteration
   */
  getPlatformStatsEntries(): Array<{ platform: string; stats: any }> {
    if (!this.stats) return [];
    
    return Array.from(this.stats.platformStats.entries()).map(([platform, stats]) => ({
      platform,
      stats
    }));
  }

  /**
   * Gets activity type entries for template iteration
   */
  getActivityTypeEntries(): Array<{ type: string; count: number }> {
    if (!this.stats) return [];
    
    return Array.from(this.stats.activitiesByType.entries()).map(([type, count]) => ({
      type,
      count
    }));
  }
}
