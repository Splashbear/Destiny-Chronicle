import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { ActivityHistory } from '../models/activity-history.model';

interface ActivityPage {
  activities: ActivityHistory[];
  hasMore: boolean;
  totalCount: number;
}

interface LoadingState {
  isLoading: boolean;
  error: string | null;
  progress: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProgressiveActivityLoaderService {
  private readonly PAGE_SIZE = 50;
  private readonly INITIAL_LOAD_SIZE = 20; // Load fewer items initially for faster display
  
  private activitiesSubject = new BehaviorSubject<ActivityHistory[]>([]);
  private loadingStateSubject = new BehaviorSubject<LoadingState>({
    isLoading: false,
    error: null,
    progress: 0
  });
  
  private hasMoreSubject = new BehaviorSubject<boolean>(true);
  private currentPage = 0;
  private currentMembershipId: string | null = null;

  public activities$ = this.activitiesSubject.asObservable();
  public loadingState$ = this.loadingStateSubject.asObservable();
  public hasMore$ = this.hasMoreSubject.asObservable();

  constructor(private activityDb: ActivityDbService) {}

  /**
   * Initialize loading for a specific player
   */
  async initializeForPlayer(membershipId: string): Promise<void> {
    if (this.currentMembershipId === membershipId) {
      return; // Already initialized for this player
    }

    this.currentMembershipId = membershipId;
    this.currentPage = 0;
    this.activitiesSubject.next([]);
    this.hasMoreSubject.next(true);
    
    // Load initial batch quickly
    await this.loadNextPage(this.INITIAL_LOAD_SIZE);
  }

  /**
   * Load the next page of activities
   */
  async loadNextPage(pageSize: number = this.PAGE_SIZE): Promise<void> {
    if (!this.currentMembershipId || !this.hasMoreSubject.value || this.loadingStateSubject.value.isLoading) {
      return;
    }

    this.setLoadingState({ isLoading: true, error: null, progress: 0 });

    try {
      const offset = this.currentPage * this.PAGE_SIZE;
      const activities = await this.activityDb.getPlayerActivitiesPaginated(
        this.currentMembershipId,
        offset,
        pageSize
      );

      const currentActivities = this.activitiesSubject.value;
      const newActivities = [...currentActivities, ...activities];
      
      this.activitiesSubject.next(newActivities);
      this.currentPage++;
      
      // Check if we have more data
      const hasMore = activities.length === pageSize;
      this.hasMoreSubject.next(hasMore);
      
      this.setLoadingState({ isLoading: false, error: null, progress: 100 });
    } catch (error) {
      console.error('Error loading activities page:', error);
      this.setLoadingState({ 
        isLoading: false, 
        error: 'Failed to load activities', 
        progress: 0 
      });
    }
  }

  /**
   * Reset the loader state
   */
  reset(): void {
    this.currentMembershipId = null;
    this.currentPage = 0;
    this.activitiesSubject.next([]);
    this.hasMoreSubject.next(true);
    this.setLoadingState({ isLoading: false, error: null, progress: 0 });
  }

  /**
   * Get activities for a specific date range (optimized)
   */
  async getActivitiesForDateRange(
    membershipId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ActivityHistory[]> {
    return this.activityDb.getActivitiesInDateRange(membershipId, startDate, endDate);
  }

  private setLoadingState(state: Partial<LoadingState>): void {
    const currentState = this.loadingStateSubject.value;
    this.loadingStateSubject.next({ ...currentState, ...state });
  }
}