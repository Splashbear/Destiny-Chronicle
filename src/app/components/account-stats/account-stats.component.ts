import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';

interface PerTypeStat {
  count: number;
  time: number; // seconds
}

interface PlatformStats {
  accountKey: string;   // unique key for filtering: game-platform-membershipId
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
  imports: [CommonModule, AccountCardGridComponent],
  template: `
    <div class="destiny-surface-panel account-summary-panel p-4 flex flex-col gap-4" *ngIf="stats">
      <h3 class="text-lg font-semibold text-[var(--destiny-gold)] font-d2-headline m-0">Account Summary</h3>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="account-summary-stat">
          <span class="account-summary-stat-label">Total Time Played</span>
          <span class="destiny-stat-value text-xl">{{ formatDuration(stats.totalTime) }}</span>
        </div>
        <div class="account-summary-stat">
          <span class="account-summary-stat-label">Total Seals</span>
          <span class="destiny-stat-value text-xl">{{ stats.totalSeals || 0 }}</span>
        </div>
        <div class="account-summary-stat">
          <span class="account-summary-stat-label">Total Activities</span>
          <span class="destiny-stat-value text-xl">{{ stats.totalActivityCount }}</span>
        </div>
      </div>

      <table class="account-summary-table w-full text-sm text-left" *ngIf="stats.perType">
        <thead>
          <tr>
            <th class="py-2 pr-2">Activity Type</th>
            <th class="py-2 pr-2 text-right">Count</th>
            <th class="py-2 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let entry of perTypeEntries">
            <td class="py-1.5 pr-2">{{ entry[0] }}</td>
            <td class="py-1.5 pr-2 text-right font-mono">{{ entry[1].count }}</td>
            <td class="py-1.5 text-right font-mono text-[var(--destiny-gold)]">{{ formatDuration(entry[1].time) }}</td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="perPlatformStats && perPlatformStats.length > 0" class="platform-breakdown mt-2 pt-4 border-t border-[rgba(201,162,39,0.22)]">
        <h4 class="text-md font-semibold text-[var(--destiny-gold)] mb-1">Per-Platform Breakdown</h4>
        <p class="text-xs text-slate-400 mb-3">Click a card to filter the Activities list below by that account. Click again to include it again.</p>
        <app-account-card-grid
          [perPlatformStats]="perPlatformStats"
          [selectedAccountKeys]="selectedAccountKeys"
          (accountKeyToggle)="accountKeyToggle.emit($event)">
        </app-account-card-grid>
      </div>
    </div>
  `,
})
export class AccountStatsComponent {
  @Input() stats: { totalTime: number; totalActivityCount: number; totalSeals?: number; perType: { [type: string]: PerTypeStat } } | null = null;
  @Input() perPlatformStats: PlatformStats[] = [];
  @Input() selectedAccountKeys: Set<string> | null = null;
  @Output() accountKeyToggle = new EventEmitter<string>();
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
      case 2: return 'assets/icons/platforms/ps.png';
      case 3: return 'assets/icons/platforms/steam.png';
      case 4: return 'assets/icons/platforms/blizzard.svg';
      case 5: return 'assets/icons/platforms/stadia.png';
      case 6: return 'assets/icons/platforms/egs.png';
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
