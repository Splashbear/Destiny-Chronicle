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
    // In a real implementation, you'd duplicate the worker logic here
    console.log('Processing in main thread:', message.type);
    
    // For now, just send a mock response
    setTimeout(() => {
      this.messageSubject.next({
        type: message.type + '_PROCESSED',
        data: { fallback: true }
      });
    }, 100);
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
