import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

interface ActivityProcessingMessage {
  type: 'PROCESS_ACTIVITIES' | 'GROUP_ACTIVITIES' | 'CALCULATE_STATS';
  data: any;
  id: string;
}

interface ActivityProcessingResponse {
  type: 'PROCESS_ACTIVITIES_RESULT' | 'GROUP_ACTIVITIES_RESULT' | 'CALCULATE_STATS_RESULT';
  data: any;
  id: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityWorkerService {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string, Subject<any>>();

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker(): void {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../workers/activity-processor.worker.ts', import.meta.url));
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.worker.onerror = this.handleWorkerError.bind(this);
      } catch (error) {
        console.warn('Web Worker not supported, falling back to main thread processing:', error);
        this.worker = null;
      }
    }
  }

  private handleWorkerMessage(event: MessageEvent<ActivityProcessingResponse>): void {
    const { type, data, id, error } = event.data;
    
    const subject = this.pendingRequests.get(id);
    if (subject) {
      if (error) {
        subject.error(new Error(error));
      } else {
        subject.next(data);
        subject.complete();
      }
      this.pendingRequests.delete(id);
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error('Web Worker error:', error);
    // Reject all pending requests
    for (const [id, subject] of this.pendingRequests) {
      subject.error(new Error('Worker error'));
    }
    this.pendingRequests.clear();
  }

  private sendMessage(message: ActivityProcessingMessage): Observable<any> {
    const subject = new Subject<any>();
    const id = (++this.messageId).toString();
    
    this.pendingRequests.set(id, subject);
    
    if (this.worker) {
      this.worker.postMessage({ ...message, id });
    } else {
      // Fallback to main thread processing
      setTimeout(() => {
        try {
          const result = this.processInMainThread(message);
          subject.next(result);
          subject.complete();
        } catch (error) {
          subject.error(error);
        }
        this.pendingRequests.delete(id);
      }, 0);
    }
    
    return subject.asObservable();
  }

  // Fallback processing in main thread
  private processInMainThread(message: ActivityProcessingMessage): any {
    // This would contain the same logic as the worker
    // For now, return a simple response
    switch (message.type) {
      case 'PROCESS_ACTIVITIES':
        return message.data.activities; // Simple passthrough for now
      case 'GROUP_ACTIVITIES':
        return []; // Empty array for now
      case 'CALCULATE_STATS':
        return { totalActivities: message.data.activities?.length || 0 };
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  // Public API methods
  processActivities(activities: any[], filters: any): Observable<any[]> {
    return this.sendMessage({
      type: 'PROCESS_ACTIVITIES',
      data: { activities, filters },
      id: ''
    });
  }

  groupActivitiesByBaseName(activities: any[]): Observable<any[]> {
    return this.sendMessage({
      type: 'GROUP_ACTIVITIES',
      data: { activities },
      id: ''
    });
  }

  calculateActivityStats(activities: any[]): Observable<any> {
    return this.sendMessage({
      type: 'CALCULATE_STATS',
      data: { activities },
      id: ''
    });
  }

  // Cleanup
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    // Reject all pending requests
    for (const [id, subject] of this.pendingRequests) {
      subject.error(new Error('Service destroyed'));
    }
    this.pendingRequests.clear();
  }
}
