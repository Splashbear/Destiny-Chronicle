import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AccountCardPlatformStats {
  accountKey: string;
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
  selector: 'app-account-card-grid',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="perPlatformStats && perPlatformStats.length > 0" class="platform-breakdown">
      <p *ngIf="hint" class="text-xs text-slate-400 mb-2">{{ hint }}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div *ngFor="let plat of perPlatformStats"
             class="emblem-card relative rounded-lg overflow-hidden shadow-lg h-24 cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-yellow-400/80"
             [class.ring-2]="selectedAccountKeys?.has(plat.accountKey)"
             [class.ring-yellow-400]="selectedAccountKeys?.has(plat.accountKey)"
             [class.opacity-90]="selectedAccountKeys && selectedAccountKeys.size > 0 && !selectedAccountKeys.has(plat.accountKey)"
             (click)="accountKeyToggle.emit(plat.accountKey)"
             role="button"
             tabindex="0"
             (keydown.enter)="accountKeyToggle.emit(plat.accountKey)"
             (keydown.space)="accountKeyToggle.emit(plat.accountKey); $event.preventDefault()"
             [attr.aria-pressed]="selectedAccountKeys?.has(plat.accountKey)"
             [attr.aria-label]="'Filter by ' + (plat.displayName || plat.platform) + ' ' + plat.platform">
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
  `,
})
export class AccountCardGridComponent {
  @Input() perPlatformStats: AccountCardPlatformStats[] = [];
  @Input() selectedAccountKeys: Set<string> | null = null;
  @Input() hint: string | null = null;
  @Output() accountKeyToggle = new EventEmitter<string>();

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
}
