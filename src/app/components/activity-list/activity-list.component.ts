import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityHistory } from '../../models/activity-history.model';
import { PlayerSearchDisplay } from '../../models/player-search-display.model';

export interface ActivityGroup {
  baseName: string;
  versions: ActivityVersion[];
}

export interface ActivityVersion {
  version: string;
  activities: ActivityHistory[];
  completionCount: number;
}

@Component({
  selector: 'app-activity-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <div *ngFor="let group of activityGroups" class="bg-slate-700/30 rounded-lg p-4">
        <h5 class="text-lg font-semibold text-white mb-3">{{ group.baseName }}</h5>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div *ngFor="let version of group.versions" class="bg-slate-700/50 rounded-lg overflow-hidden hover:bg-slate-700/70 transition-colors">
            <div class="relative">
              <!-- Activity Image -->
              <ng-container *ngIf="getActivityImage(version.activities[0]) as img">
                <img *ngIf="img && typeof img === 'string'" [src]="img" class="w-full h-20 object-cover" />
                <span *ngIf="img && typeof img !== 'string'" class="activity-image" [innerHTML]="img"></span>
              </ng-container>
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              
              <!-- Activity Info -->
              <div class="absolute bottom-0 left-0 right-0 p-2">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-blue-300 bg-blue-900/30 px-2 py-1 rounded">
                    {{ version.version }}
                  </span>
                  <span class="text-xs text-slate-300">
                    {{ version.completionCount }} completion{{ version.completionCount !== 1 ? 's' : '' }}
                  </span>
                </div>
                
                <!-- PGCR Links -->
                <div class="flex flex-col gap-1">
                  <a *ngFor="let activity of version.activities.slice(0, 3)" 
                     (click)="openPGCR(activity)"
                     class="text-yellow-400 font-mono text-xs hover:text-yellow-300 cursor-pointer underline">
                    {{ formatDateTime(activity.period) }}
                  </a>
                  <span *ngIf="version.activities.length > 3" class="text-xs text-slate-400">
                    +{{ version.activities.length - 3 }} more
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- No Activities Message -->
      <div *ngIf="activityGroups.length === 0" class="text-center text-slate-400 py-8">
        <div class="text-4xl mb-4">🎮</div>
        <p>No activities found for this date.</p>
        <p class="text-sm mt-2">Try selecting a different date or check if the player has any recorded activities.</p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivityListComponent {
  @Input() activityGroups: ActivityGroup[] = [];
  @Input() selectedPlayers: PlayerSearchDisplay[] = [];
  @Output() pgcrClick = new EventEmitter<ActivityHistory>();

  /**
   * Gets activity image for display
   */
  getActivityImage(activity: ActivityHistory): string | null {
    // This would need to be implemented based on your activity icon service
    // For now, returning null
    return null;
  }

  /**
   * Formats date and time for display
   */
  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Opens PGCR for the selected activity
   */
  openPGCR(activity: ActivityHistory): void {
    this.pgcrClick.emit(activity);
  }
}
