import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

interface VirtualActivityItem {
  id: string;
  activity: any;
  isLoaded: boolean;
}

@Component({
  selector: 'app-virtual-activity-list',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  template: `
    <div class="virtual-activity-container" style="height: 600px;">
      <cdk-virtual-scroll-viewport
        itemSize="80"
        class="viewport"
        (scrolledIndexChange)="onScrollIndexChange($event)">
        
        <div
          *cdkVirtualFor="let item of virtualItems$ | async; trackBy: trackByFn"
          class="activity-item"
          [class.loaded]="item.isLoaded">
          
          <div *ngIf="!item.isLoaded" class="loading-skeleton">
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
          </div>
          
          <div *ngIf="item.isLoaded" class="activity-content">
            <div class="activity-name">{{ item.activity.activityName }}</div>
            <div class="activity-date">{{ item.activity.period | date:'medium' }}</div>
            <div class="activity-type">{{ getActivityType(item.activity) }}</div>
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    </div>
  `,
  styles: [`
    .virtual-activity-container {
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    
    .viewport {
      height: 100%;
    }
    
    .activity-item {
      padding: 12px;
      border-bottom: 1px solid #eee;
      min-height: 80px;
      display: flex;
      align-items: center;
    }
    
    .loading-skeleton {
      width: 100%;
    }
    
    .skeleton-line {
      height: 16px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      margin-bottom: 8px;
      border-radius: 4px;
    }
    
    .skeleton-line.short {
      width: 60%;
    }
    
    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    
    .activity-content {
      width: 100%;
    }
    
    .activity-name {
      font-weight: bold;
      margin-bottom: 4px;
    }
    
    .activity-date {
      color: #666;
      font-size: 0.9em;
    }
    
    .activity-type {
      color: #888;
      font-size: 0.8em;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VirtualActivityListComponent implements OnInit, OnDestroy {
  @Input() activities$!: Observable<any[]>;
  @Input() loadMore$ = new BehaviorSubject<boolean>(false);
  
  virtualItems$!: Observable<VirtualActivityItem[]>;
  private loadedItems = new Set<string>();
  
  ngOnInit() {
    this.virtualItems$ = combineLatest([
      this.activities$,
      this.loadMore$
    ]).pipe(
      map(([activities, loadMore]) => {
        return activities.map(activity => ({
          id: activity.activityDetails?.instanceId || Math.random().toString(),
          activity,
          isLoaded: this.loadedItems.has(activity.activityDetails?.instanceId) || loadMore
        }));
      })
    );
  }
  
  ngOnDestroy() {
    this.loadMore$.complete();
  }
  
  onScrollIndexChange(index: number) {
    // Load more items when user scrolls near the end
    const buffer = 10;
    const totalItems = this.loadedItems.size;
    
    if (index > totalItems - buffer) {
      this.loadMore$.next(true);
    }
  }
  
  trackByFn(index: number, item: VirtualActivityItem): string {
    return item.id;
  }
  
  getActivityType(activity: any): string {
    const mode = activity.activityDetails?.mode;
    const modeNames: { [key: number]: string } = {
      2: 'Story',
      3: 'Strike', 
      4: 'Raid',
      5: 'All PvP',
      6: 'Patrol',
      7: 'All PvE',
      10: 'Control',
      11: 'Clash',
      13: 'Nightfall',
      15: 'Heroic Nightfall',
      16: 'All Strikes',
      17: 'Iron Banner',
      19: 'Arena',
      21: 'Trials of Osiris',
      22: 'Elimination',
      24: 'Rift',
      25: 'Mayhem',
      26: 'Zone Control',
      27: 'Racing',
      30: 'Supremacy',
      37: 'Survival',
      38: 'Countdown',
      39: 'Trials of the Nine',
      43: 'Showdown',
      44: 'Lockdown',
      45: 'Scorched',
      46: 'Scorched Team',
      47: 'Gambit',
      48: 'All Gambit',
      49: 'Breakthrough',
      50: 'Black Armory',
      51: 'Salvage'
    };
    
    return modeNames[mode] || `Mode ${mode}`;
  }
}