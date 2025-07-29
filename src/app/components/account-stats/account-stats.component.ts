import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface PerTypeStat {
  count: number;
  time: number; // seconds
}

@Component({
  selector: 'app-account-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-slate-800/95 rounded-lg shadow-lg p-4 flex flex-col gap-4" *ngIf="stats">
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
    </div>
  `,
})
export class AccountStatsComponent {
  @Input() stats: { totalTime: number; totalActivityCount: number; totalSeals?: number; perType: { [type: string]: PerTypeStat } } | null = null;

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
} 