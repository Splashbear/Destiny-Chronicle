import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface WorkerMessage {
  type: string;
  data: any;
}

export interface WorkerResponse {
  type: string;
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class WorkerService {
  private worker: Worker | null = null;
  private messageSubject = new BehaviorSubject<WorkerResponse | null>(null);
  public messages$ = this.messageSubject.asObservable();

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('../workers/data-processor.worker.ts', import.meta.url)
        );
        
        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          this.messageSubject.next(e.data);
        };
        
        this.worker.onerror = (error) => {
          console.error('Worker error:', error);
        };
      } catch (error) {
        console.error('Failed to initialize worker:', error);
        this.worker = null;
      }
    } else {
      console.warn('Web Workers not supported in this environment');
    }
  }

  public postMessage(message: WorkerMessage): void {
    if (this.worker) {
      this.worker.postMessage(message);
    } else {
      console.warn('Worker not available, falling back to main thread processing');
      // Fallback to main thread processing
      this.processInMainThread(message);
    }
  }

  private processInMainThread(message: WorkerMessage): void {
    // This is a fallback for environments where workers aren't available
    console.log('[WorkerService] Processing in main thread:', message.type);
    
    try {
      let result: any = null;
      
      switch (message.type) {
        case 'PROCESS_ACTIVITIES':
          result = this.processActivitiesInMainThread(message.data.activities || []);
          break;
        case 'CALCULATE_STATS':
          result = this.calculateStatsInMainThread(message.data.activities || []);
          break;
        case 'PROCESS_ACTIVITIES_FOR_DISPLAY':
          result = this.groupActivitiesInMainThread(message.data.activities || []);
          break;
        default:
          result = { fallback: true, error: 'Unknown message type' };
      }
      
      setTimeout(() => {
        this.messageSubject.next({
          type: message.type + '_PROCESSED',
          data: result
        });
      }, 50);
    } catch (error) {
      console.error('[WorkerService] Error in main thread processing:', error);
      this.messageSubject.next({
        type: 'ERROR',
        data: { message: 'Main thread processing error', error: String(error) }
      });
    }
  }

  private processActivitiesInMainThread(activities: any[]): any[] {
    if (!activities || activities.length === 0) return [];
    
    return activities.map(activity => ({
      activity,
      processedName: activity.activityDetails?.referenceId ? `Activity ${activity.activityDetails.referenceId}` : 'Unknown Activity',
      processedType: 'Other',
      processedDate: activity.period,
      processedYear: new Date(activity.period).getUTCFullYear(),
      processedGame: 'D2'
    }));
  }

  private calculateStatsInMainThread(activities: any[]): any {
    if (!activities || activities.length === 0) {
      return { totalTime: 0, totalActivities: 0, totalSeals: 0, totalFirsts: 0, byGame: {}, byYear: {} };
    }

    let totalTime = 0;
    const byGame: { [game: string]: any } = {};
    const byYear: { [year: string]: any } = {};

    activities.forEach(activity => {
      if (activity.values?.timePlayedSeconds?.basic?.value) {
        totalTime += activity.values.timePlayedSeconds.basic.value;
      }

      const game = 'D2';
      if (!byGame[game]) {
        byGame[game] = { count: 0, time: 0 };
      }
      byGame[game].count++;
      if (activity.values?.timePlayedSeconds?.basic?.value) {
        byGame[game].time += activity.values.timePlayedSeconds.basic.value;
      }

      const year = new Date(activity.period).getUTCFullYear().toString();
      if (!byYear[year]) {
        byYear[year] = { count: 0, time: 0 };
      }
      byYear[year].count++;
      if (activity.values?.timePlayedSeconds?.basic?.value) {
        byYear[year].time += activity.values.timePlayedSeconds.basic.value;
      }
    });

    return { totalTime, totalActivities: activities.length, totalSeals: 0, totalFirsts: 0, byGame, byYear };
  }

  private groupActivitiesInMainThread(activities: any[]): any {
    if (!activities || activities.length === 0) {
      return { processed: [], grouped: {} };
    }

    const processed = this.processActivitiesInMainThread(activities);
    const grouped: { [game: string]: { [year: string]: any[] } } = {};
    
    processed.forEach(processedActivity => {
      const { processedGame, processedYear, activity } = processedActivity;
      
      if (!grouped[processedGame]) {
        grouped[processedGame] = {};
      }
      
      if (!grouped[processedGame][processedYear]) {
        grouped[processedGame][processedYear] = [];
      }
      
      grouped[processedGame][processedYear].push(activity);
    });
    
    return { processed, grouped };
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  public isWorkerAvailable(): boolean {
    return this.worker !== null;
  }
}
