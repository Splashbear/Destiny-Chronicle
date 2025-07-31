import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ActivityDbService } from './activity-db.service';
import { BungieApiService } from './bungie-api.service';
import { firstValueFrom } from 'rxjs';

export interface LoadingTask {
  id: string;
  type: 'character' | 'activities' | 'profile';
  priority: number; // 1 = highest, 5 = lowest
  status: 'pending' | 'loading' | 'completed' | 'failed';
  progress: number;
  description: string;
  data?: any;
}

export interface CharacterLoadRequest {
  membershipType: number;
  membershipId: string;
  characterId: string;
  isD1: boolean;
  priority: number;
}

@Injectable({
  providedIn: 'root'
})
export class BackgroundLoaderService {
  private tasks = new Map<string, LoadingTask>();
  private taskQueue: string[] = [];
  private isProcessing = false;
  private maxConcurrent = 3; // Limit concurrent API calls
  
  public tasks$ = new BehaviorSubject<LoadingTask[]>([]);
  public progress$ = new BehaviorSubject<{ completed: number; total: number; percent: number }>({ completed: 0, total: 0, percent: 0 });

  constructor(
    private activityDb: ActivityDbService,
    private bungieService: BungieApiService
  ) {}

  /**
   * Queue a character for background loading
   */
  async queueCharacterLoad(request: CharacterLoadRequest): Promise<void> {
    const taskId = `char-${request.membershipId}-${request.characterId}`;
    
    // Check if already loaded or loading
    if (this.tasks.has(taskId)) {
      return;
    }

    // Check if we already have data for this character
    const existingActivities = await this.activityDb.getAllActivitiesForCharacter(
      request.membershipId, 
      request.characterId
    );
    
    if (existingActivities.length > 0) {
      // Already have data, mark as completed
      this.addTask({
        id: taskId,
        type: 'activities',
        priority: request.priority,
        status: 'completed',
        progress: 100,
        description: `Character ${request.characterId} (cached)`,
        data: { count: existingActivities.length }
      });
      return;
    }

    // Add to queue
    this.addTask({
      id: taskId,
      type: 'activities',
      priority: request.priority,
      status: 'pending',
      progress: 0,
      description: `Loading character ${request.characterId}`
    });

    this.processQueue();
  }

  /**
   * Process the task queue with priority and concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      while (this.taskQueue.length > 0) {
        // Get highest priority tasks up to concurrency limit
        const activeTasks = this.taskQueue
          .map(id => this.tasks.get(id)!)
          .filter(task => task.status === 'pending')
          .sort((a, b) => a.priority - b.priority)
          .slice(0, this.maxConcurrent);

        if (activeTasks.length === 0) break;

        // Process active tasks in parallel
        const promises = activeTasks.map(task => this.processTask(task));
        await Promise.allSettled(promises);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single task
   */
  private async processTask(task: LoadingTask): Promise<void> {
    if (task.status !== 'pending') return;

    // Update status to loading
    this.updateTask(task.id, { status: 'loading', progress: 0 });

    try {
      if (task.type === 'activities') {
        await this.loadCharacterActivities(task);
      }
      
      this.updateTask(task.id, { status: 'completed', progress: 100 });
    } catch (error) {
      console.error(`[BackgroundLoader] Task ${task.id} failed:`, error);
      this.updateTask(task.id, { status: 'failed', progress: 0 });
    }

    // Remove from queue
    this.taskQueue = this.taskQueue.filter(id => id !== task.id);
    this.updateProgress();
  }

  /**
   * Load activities for a character with progress updates
   */
  private async loadCharacterActivities(task: LoadingTask): Promise<void> {
    const [membershipId, characterId] = task.id.replace('char-', '').split('-');
    
    // Extract game type from task description or data
    const isD1 = task.description.includes('D1') || task.data?.isD1;
    
    // Use the optimized fetchAndStoreActivities method
    await this.activityDb.fetchAndStoreActivities(
      task.data?.membershipType || 1, // Default to Xbox
      membershipId,
      characterId,
      isD1
    );

    // Update progress periodically
    this.updateTask(task.id, { progress: 50 });
    
    // Simulate progress updates for better UX
    for (let i = 50; i < 95; i += 5) {
      await new Promise(resolve => setTimeout(resolve, 100));
      this.updateTask(task.id, { progress: i });
    }
  }

  /**
   * Add a new task to the queue
   */
  private addTask(task: LoadingTask): void {
    this.tasks.set(task.id, task);
    this.taskQueue.push(task.id);
    this.updateProgress();
    this.tasks$.next(Array.from(this.tasks.values()));
  }

  /**
   * Update an existing task
   */
  private updateTask(taskId: string, updates: Partial<LoadingTask>): void {
    const task = this.tasks.get(taskId);
    if (task) {
      Object.assign(task, updates);
      this.tasks$.next(Array.from(this.tasks.values()));
    }
  }

  /**
   * Update overall progress
   */
  private updateProgress(): void {
    const allTasks = Array.from(this.tasks.values());
    const completed = allTasks.filter(t => t.status === 'completed').length;
    const total = allTasks.length;
    const percent = total > 0 ? (completed / total) * 100 : 0;

    this.progress$.next({ completed, total, percent });
  }

  /**
   * Get current loading status
   */
  getLoadingStatus(): Observable<LoadingTask[]> {
    return this.tasks$.asObservable();
  }

  /**
   * Get overall progress
   */
  getProgress(): Observable<{ completed: number; total: number; percent: number }> {
    return this.progress$.asObservable();
  }

  /**
   * Clear completed tasks
   */
  clearCompleted(): void {
    const completedTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'completed' || task.status === 'failed');
    
    completedTasks.forEach(task => {
      this.tasks.delete(task.id);
      this.taskQueue = this.taskQueue.filter(id => id !== task.id);
    });

    this.tasks$.next(Array.from(this.tasks.values()));
    this.updateProgress();
  }
} 