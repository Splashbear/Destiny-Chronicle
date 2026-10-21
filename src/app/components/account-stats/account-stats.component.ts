import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { ActivityStore } from '../../core/state/activity.store';
import { PlatformStats } from '../../models/platform-stats.model';

interface PerTypeStat {
  count: number;
  time: number; // seconds
}

@Component({
  selector: 'app-account-stats',
  standalone: true,
  imports: [CommonModule, AccountCardGridComponent],
  template: `
    <div class="destiny-surface-panel account-summary-panel p-4 flex flex-col gap-4" *ngIf="effectiveStats as s">
      <h3 class="text-lg font-semibold text-[var(--destiny-gold)] font-d2-headline m-0">Account Summary</h3>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="account-summary-stat"
             [attr.title]="activityTimeTooltip">
          <span class="account-summary-stat-label">Time in Activities</span>
          <span class="destiny-stat-value text-xl">{{ effectiveLoading ? '—' : formatDuration(activityTimeSeconds) }}</span>
          <span *ngIf="!effectiveLoading && bungieTotalSeconds > 0"
                class="text-xs text-slate-400 mt-1 block"
                [attr.title]="bungieTimeTooltip">
            Bungie total {{ formatDuration(bungieTotalSeconds) }} (incl. orbit)
          </span>
        </div>
        <div class="account-summary-stat">
          <span class="account-summary-stat-label">Total Seals</span>
          <span class="destiny-stat-value text-xl">{{ effectiveLoading ? '—' : (s.totalSeals || 0) }}</span>
        </div>
        <div class="account-summary-stat">
          <span class="account-summary-stat-label">Total Activities</span>
          <span class="destiny-stat-value text-xl">{{ effectiveLoading ? '—' : s.totalActivityCount }}</span>
        </div>
      </div>

      <table class="account-summary-table w-full text-sm text-left" *ngIf="s.perType">
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
            <td class="py-1.5 pr-2 text-right font-mono">{{ effectiveLoading ? '—' : entry[1].count }}</td>
            <td class="py-1.5 text-right font-mono text-[var(--destiny-gold)]">{{ effectiveLoading ? '—' : formatDuration(entry[1].time) }}</td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="effectivePerPlatform.length > 0" class="platform-breakdown mt-2 pt-4 border-t border-[rgba(201,162,39,0.22)]">
        <h4 class="text-md font-semibold text-[var(--destiny-gold)] mb-1">Per-Platform Breakdown</h4>
        <p class="text-sm text-slate-300 mb-3">Click a card to filter the Activities list below by that account. Click again to include it again.</p>
        <app-account-card-grid
          [perPlatformStats]="effectivePerPlatform"
          [selectedAccountKeys]="selectedAccountKeys"
          [statsPending]="effectiveLoading"
          (accountKeyToggle)="accountKeyToggle.emit($event)">
        </app-account-card-grid>
      </div>
    </div>
  `,
})
export class AccountStatsComponent {
  private readonly activityStore = inject(ActivityStore);

  @Input() stats: {
    totalTime: number;
    totalActivityTime?: number;
    bungieTotalTime?: number;
    totalActivityCount: number;
    totalSeals?: number;
    perType: { [type: string]: PerTypeStat };
  } | null = null;
  @Input() perPlatformStats: PlatformStats[] = [];
  @Input() selectedAccountKeys: Set<string> | null = null;
  /** True while account stats are still loading — show placeholders, never a stale 0. */
  @Input() loading = false;
  @Output() accountKeyToggle = new EventEmitter<string>();
  @Input() onExportActivities?: () => void;
  @Input() onOpenExportOptionsDialog?: () => void;
  @Input() onShareDailyView?: () => void;

  readonly activityTimeTooltip =
    'Sum of time spent in loaded activities (raids, strikes, Crucible, etc.). Does not include orbit, Tower, or social spaces.';
  readonly bungieTimeTooltip =
    'Bungie character minutesPlayed across all characters. Includes orbit, Tower, and social spaces.';

  /** Prefer ActivityStore when accounts are selected (CODE_CLEANUP_SPEC Step 3). */
  get useStore(): boolean {
    return this.activityStore.selectedPlayerCount() > 0;
  }

  get effectiveLoading(): boolean {
    return this.useStore ? this.activityStore.statsPending() : this.loading;
  }

  get effectiveStats() {
    if (this.useStore) {
      return this.activityStore.accountStatsSnapshot();
    }
    return this.stats;
  }

  get effectivePerPlatform(): PlatformStats[] {
    if (this.useStore) {
      return this.activityStore.perPlatformStats() as PlatformStats[];
    }
    return this.perPlatformStats || [];
  }

  get activityTimeSeconds(): number {
    const s = this.effectiveStats;
    if (!s) return 0;
    return s.totalActivityTime ?? s.totalTime ?? 0;
  }

  get bungieTotalSeconds(): number {
    return this.effectiveStats?.bungieTotalTime ?? 0;
  }

  get perTypeEntries() {
    const s = this.effectiveStats;
    return s ? Object.entries(s.perType || {}) : [];
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
