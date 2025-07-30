import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface PerTypeStat {
  count: number;
  time: number; // seconds
}

interface PlatformStats {
  platform: string;
  totalTime: number;
  totalActivities: number;
  totalSeals: number;
  game: 'D1' | 'D2';
  emblemBackground?: string;
  emblemIcon?: string;
  displayName?: string;
  className?: string;
  lightLevel?: number;
}

@Component({
  selector: 'app-account-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-slate-800/95 rounded-lg shadow-lg p-4 flex flex-col gap-4" *ngIf="stats">
      <!-- Header with export buttons -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">Account Summary</h3>
        <div class="flex items-center gap-2">
          <button (click)="exportActivities()" class="d2-btn bg-green-600 hover:bg-green-500 text-xs px-3 py-1">Export</button>
          <button (click)="openExportOptionsDialog()" class="d2-btn bg-blue-600 hover:bg-blue-500 text-xs px-3 py-1">Export Options</button>
          <button (click)="shareDailyView()" class="d2-btn bg-purple-600 hover:bg-purple-500 text-xs px-3 py-1">Share</button>
        </div>
      </div>

      <!-- Main stats grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div class="stat-item"><strong>Total Time Played:</strong> <span class="ml-1">{{ formatDuration(stats.totalTime) }}</span></div>
        <div class="stat-item"><strong>Total Seals:</strong> <span class="ml-1">{{ stats.totalSeals || 0 }}</span></div>
        <div class="stat-item"><strong>Total Activities:</strong> <span class="ml-1">{{ stats.totalActivityCount }}</span></div>
      </div>

      <!-- Per-type table -->
      <table class="w-full text-sm text-left text-slate-300 border-t border-slate-700" *ngIf="stats.perType">
        <thead class="text-xs uppercase text-slate-400">
          <tr>
            <th class="py-2 pr-2">Activity Type</th>
            <th class="py-2 pr-2 text-right">Count</th>
            <th class="py-2 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let entry of perTypeEntries" class="border-t border-slate-700">
            <td class="py-1 pr-2">{{ entry[0] }}</td>
            <td class="py-1 pr-2 text-right">{{ entry[1].count }}</td>
            <td class="py-1 text-right">{{ formatDuration(entry[1].time) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Per-Platform Breakdown -->
      <div *ngIf="perPlatformStats && perPlatformStats.length > 0" class="platform-breakdown mt-6">
        <h4 class="text-md font-semibold text-white mb-2">Per-Platform Breakdown</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div *ngFor="let plat of perPlatformStats" class="emblem-card relative rounded-lg overflow-hidden shadow-lg h-24">
            <img *ngIf="plat.emblemBackground" [src]="'https://www.bungie.net' + plat.emblemBackground" class="absolute inset-0 w-full h-full object-cover" alt="emblem bg" />
            <div class="absolute inset-0 bg-black/60"></div>
            <div class="absolute bottom-0 left-0 right-0 p-3 flex flex-col gap-0.5 z-10">
              <div class="flex items-center justify-between">
                <span class="text-slate-100 font-bold truncate">{{ plat.displayName || plat.platform }}</span>
                <img *ngIf="plat.emblemIcon" [src]="'https://www.bungie.net' + plat.emblemIcon" class="w-6 h-6 rounded-full border border-slate-300" alt="emblem icon" />
              </div>
              <div class="flex items-center gap-2 text-slate-300 text-sm">
                <img [src]="getPlatformIconUrl(getPlatformId(plat.platform))" class="w-4 h-4" alt="platform icon" />
                <img [src]="plat.game === 'D1' ? 'assets/icons/destiny/Destiny 1 icon.jpg' : 'assets/icons/destiny/Destiny 2 icon.png'" class="w-4 h-4" alt="game" />
                <span>{{ plat.platform }}</span>
                <span *ngIf="plat.className">· {{ plat.className }}</span>
                <span *ngIf="plat.lightLevel">· {{ plat.lightLevel }}</span>
              </div>
              <div class="text-yellow-300 font-mono text-sm">{{ formatDuration(plat.totalTime) }}</div>
              <div class="text-xs text-slate-400">{{ plat.totalActivities }} activities · {{ plat.totalSeals }} seals</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AccountStatsComponent {
  @Input() stats: { totalTime: number; totalActivityCount: number; totalSeals?: number; perType: { [type: string]: PerTypeStat } } | null = null;
  @Input() perPlatformStats: PlatformStats[] = [];
  @Input() onExportActivities?: () => void;
  @Input() onOpenExportOptionsDialog?: () => void;
  @Input() onShareDailyView?: () => void;

  get perTypeEntries() {
    return this.stats ? Object.entries(this.stats.perType) : [];
  }

  private pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${this.pad(m)}m`;
    if (m > 0) return `${m}m ${this.pad(s)}s`;
    return `${s}s`;
  }

  getPlatformId(platform: string): number {
    switch (platform.toLowerCase()) {
      case 'xbox': return 1;
      case 'playstation': return 2;
      case 'steam': return 3;
      case 'battle.net': return 4;
      case 'stadia': return 5;
      case 'epic': return 6;
      default: return 1;
    }
  }

  getPlatformIconUrl(membershipType: number): string {
    switch (membershipType) {
      case 1: return 'assets/icons/platforms/xbox.png';
      case 2: return 'assets/icons/platforms/playstation.png';
      case 3: return 'assets/icons/platforms/steam.png';
      case 4: return 'assets/icons/platforms/battlenet.png';
      case 5: return 'assets/icons/platforms/stadia.png';
      case 6: return 'assets/icons/platforms/epic.png';
      default: return 'assets/icons/platforms/xbox.png';
    }
  }

  exportActivities() {
    if (this.onExportActivities) {
      this.onExportActivities();
    }
  }

  openExportOptionsDialog() {
    if (this.onOpenExportOptionsDialog) {
      this.onOpenExportOptionsDialog();
    }
  }

  shareDailyView() {
    if (this.onShareDailyView) {
      this.onShareDailyView();
    }
  }
} 