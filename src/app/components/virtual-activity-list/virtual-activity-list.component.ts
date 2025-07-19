import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ActivityHistory } from '../../models/activity-history.model';
import { DestinyManifestService } from '../../services/destiny-manifest.service';

@Component({
  selector: 'app-virtual-activity-list',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cdk-virtual-scroll-viewport 
      itemSize="80" 
      class="activity-viewport"
      [style.height.px]="viewportHeight"
      (scrolledIndexChange)="onScrolledIndexChange($event)">
      <div 
        *cdkVirtualFor="let activity of activities; trackBy: trackByActivity" 
        class="activity-item p-3 border-b border-slate-700 hover:bg-slate-800/50 transition-colors cursor-pointer"
        [attr.data-activity]="activity.activityDetails.instanceId"
        (click)="onActivityClick(activity)">
        <div class="flex items-center gap-3">
          <div class="activity-icon w-12 h-12 flex-shrink-0">
            <!-- Activity icon/image -->
            <ng-container *ngIf="getActivityImage(activity) as img">
              <img *ngIf="img && typeof img === 'string'" [src]="img" 
                   class="w-full h-full object-cover rounded" 
                   [alt]="getActivityName(activity)"
                   loading="lazy" />
              <span *ngIf="img && typeof img !== 'string'" 
                    [innerHTML]="img" 
                    class="w-full h-full flex items-center justify-center text-slate-400"></span>
            </ng-container>
            <div *ngIf="!getActivityImage(activity)" 
                 class="w-full h-full bg-slate-700 rounded flex items-center justify-center">
              <svg class="w-6 h-6 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-white truncate">
              {{ getActivityName(activity) }}
            </div>
            <div class="text-xs text-slate-400 flex items-center gap-2">
              <span>{{ formatDate(activity.period) }}</span>
              <span>•</span>
              <span>{{ formatDuration(activity) }}</span>
              <span *ngIf="getCompletionStatus(activity)" class="text-green-400">✓</span>
            </div>
          </div>
          <div class="text-right text-xs text-slate-400 flex flex-col">
            <span *ngIf="activity.values && activity.values.kills && activity.values.kills.basic && activity.values.kills.basic.value">
              {{ activity.values.kills.basic.value }} kills
            </span>
            <span *ngIf="activity.values && activity.values.score && activity.values.score.basic && activity.values.score.basic.value" class="text-slate-500">
              {{ formatScore(activity.values.score.basic.value || 0) }} pts
            </span>
          </div>
        </div>
      </div>
      
      <!-- Loading indicator at bottom -->
      <div *ngIf="isLoadingMore" class="p-4 text-center text-slate-400">
        <div class="inline-flex items-center gap-2">
          <svg class="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          Loading more activities...
        </div>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
  styles: [`
    .activity-viewport {
      background: transparent;
      border-radius: 8px;
    }
    .activity-item {
      display: flex;
      align-items: center;
    }
    .activity-item:hover {
      background-color: rgba(30, 41, 59, 0.5);
    }
  `]
})
export class VirtualActivityListComponent {
  @Input() activities: ActivityHistory[] = [];
  @Input() viewportHeight: number = 400;
  @Input() isLoadingMore: boolean = false;
  @Output() activityClick = new EventEmitter<ActivityHistory>();
  @Output() loadMore = new EventEmitter<void>();

  constructor(private manifest: DestinyManifestService) {}

  trackByActivity(index: number, activity: ActivityHistory): string {
    return activity.activityDetails?.instanceId || `${index}-${activity.period}`;
  }

  onActivityClick(activity: ActivityHistory): void {
    this.activityClick.emit(activity);
  }

  onScrolledIndexChange(index: number): void {
    // Load more when we're near the end
    if (index > this.activities.length - 10) {
      this.loadMore.emit();
    }
  }

  getActivityImage(activity: ActivityHistory): string | null {
    const referenceId = String(activity.activityDetails?.referenceId || '');
    const mode = activity.activityDetails?.mode || 0;
    const isD1 = mode <= 4;
    
    // Try to get PGCR image first
    const pgcrImage = this.manifest.getActivityPgcrImage(referenceId, isD1);
    if (pgcrImage && (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/'))) {
      return 'https://www.bungie.net' + pgcrImage;
    }

    // Fall back to activity type icon
    const type = this.manifest.getActivityType(referenceId, mode);
    return `/assets/icons/activities/${type}.svg`;
  }

  getActivityName(activity: ActivityHistory): string {
    const referenceId = String(activity.activityDetails?.referenceId || '');
    const mode = activity.activityDetails?.mode || 0;
    
    // Try to get specific activity name from manifest
    const specificName = this.manifest.getActivityName(referenceId, mode > 4);
    if (specificName && specificName !== 'Unknown Activity') {
      return specificName;
    }

    // Fall back to generic names
    const type = this.manifest.getActivityType(referenceId, mode);
    const typeNames: { [key: string]: string } = {
      'raid': 'Raid',
      'dungeon': 'Dungeon', 
      'strike': 'Strike',
      'nightfall': 'Nightfall',
      'crucible': 'Crucible',
      'gambit': 'Gambit',
      'patrol': 'Patrol',
      'story': 'Story Mission',
      'other': 'Activity'
    };

    return typeNames[type] || 'Unknown Activity';
  }

  formatDate(period: string): string {
    const date = new Date(period);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
  }

  formatDuration(activity: ActivityHistory): string {
    const seconds = activity.values?.timePlayedSeconds?.basic?.value || 0;
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  formatScore(score: number): string {
    if (score >= 1000000) {
      return (score / 1000000).toFixed(1) + 'M';
    }
    if (score >= 1000) {
      return (score / 1000).toFixed(1) + 'K';
    }
    return score.toString();
  }

  getCompletionStatus(activity: ActivityHistory): boolean {
    return activity.values?.completed?.basic?.value === 1;
  }
}