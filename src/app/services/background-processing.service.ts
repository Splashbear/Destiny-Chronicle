import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ProcessingState {
  isProcessing: boolean;
  isPaused: boolean;
  progress: number;
  currentBatch: number;
  totalBatches: number;
  isBackground: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BackgroundProcessingService {
  private worker: Worker | null = null;
  private processingState = new BehaviorSubject<ProcessingState>({
    isProcessing: false,
    isPaused: false,
    progress: 0,
    currentBatch: 0,
    totalBatches: 0,
    isBackground: false
  });

  private isTabVisible = true;
  private processingQueue: any[] = [];
  private processingStateKey = 'destiny-chronicle-processing-state';
  private hideIndicatorTimeout: any = null;

  constructor() {
    this.initializeWorker();
    this.setupVisibilityListener();
  }

  private initializeWorker() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/background-processor.worker', import.meta.url));
      
      this.worker.onmessage = (event: MessageEvent) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.updateState({ isProcessing: false, isPaused: false });
      };
    }
  }

  private setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = !document.hidden;
      
      if (this.isTabVisible) {
        // Tab became visible - resume processing if paused
        this.resumeProcessing();
        this.updateState({ isBackground: false });
      } else {
        // Tab became hidden - continue processing in background
        this.updateState({ isBackground: true });
      }
    });
  }

  private handleWorkerMessage(data: any) {
    switch (data.type) {
      case 'PROGRESS':
        this.updateState({
          progress: data.progress,
          currentBatch: data.currentBatch,
          totalBatches: data.totalBatches
        });
        break;
      case 'COMPLETE':
        // Clear the timeout since processing completed normally
        if (this.hideIndicatorTimeout) {
          clearTimeout(this.hideIndicatorTimeout);
          this.hideIndicatorTimeout = null;
        }
        this.updateState({ 
          isProcessing: false, 
          isPaused: false,
          progress: 100,
          isBackground: false
        });
        break;
      case 'PAUSED':
        this.updateState({ isPaused: true });
        break;
      case 'ERROR':
        console.error('Processing error:', data.data);
        this.updateState({ isProcessing: false, isPaused: false });
        break;
    }
  }

  startProcessing(activities: any[], manifest: any, batchSize = 50) {
    if (!this.worker) {
      console.warn('Web Workers not supported, falling back to main thread processing');
      this.processInMainThread(activities, manifest, batchSize);
      return;
    }

    this.updateState({ 
      isProcessing: true, 
      isPaused: false, 
      progress: 0,
      currentBatch: 0,
      totalBatches: 0
    });

    // Set a timeout to automatically hide the indicator after 30 seconds
    this.hideIndicatorTimeout = setTimeout(() => {
      this.updateState({ 
        isProcessing: false, 
        isPaused: false,
        isBackground: false 
      });
    }, 30000);

    this.worker.postMessage({
      type: 'PROCESS_ACTIVITIES',
      data: { activities, manifest, batchSize }
    });
  }

  pauseProcessing() {
    if (this.worker && this.processingState.value.isProcessing) {
      this.worker.postMessage({ type: 'PAUSE' });
    }
  }

  resumeProcessing() {
    if (this.worker && this.processingState.value.isPaused) {
      this.worker.postMessage({ type: 'RESUME' });
    }
  }

  stopProcessing() {
    if (this.worker) {
      this.worker.postMessage({ type: 'CLEAR' });
    }
    this.updateState({ 
      isProcessing: false, 
      isPaused: false, 
      progress: 0 
    });
  }

  getProcessingState(): Observable<ProcessingState> {
    return this.processingState.asObservable();
  }

  isCurrentlyProcessing(): boolean {
    return this.processingState.value.isProcessing;
  }

  isInBackground(): boolean {
    return this.processingState.value.isBackground;
  }

  private updateState(updates: Partial<ProcessingState>) {
    this.processingState.next({
      ...this.processingState.value,
      ...updates
    });
  }

  private async processInMainThread(activities: any[], manifest: any, batchSize: number) {
    // Fallback for browsers without Web Worker support
    const totalBatches = Math.ceil(activities.length / batchSize);
    
    for (let i = 0; i < activities.length; i += batchSize) {
      const batch = activities.slice(i, i + batchSize);
      
      // Process batch
      await this.processBatch(batch, manifest);
      
      const progress = ((i + batchSize) / activities.length) * 100;
      this.updateState({
        progress: Math.min(progress, 100),
        currentBatch: Math.floor(i / batchSize) + 1,
        totalBatches
      });

      // Yield control
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    this.updateState({ isProcessing: false, progress: 100 });
  }

  private async processBatch(batch: any[], manifest: any) {
    // Add your actual batch processing logic here
    for (const activity of batch) {
      // Process individual activity
    }
  }

  ngOnDestroy() {
    if (this.worker) {
      this.worker.terminate();
    }
  }
}
