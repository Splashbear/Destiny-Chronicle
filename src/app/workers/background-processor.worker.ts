/// <reference lib="webworker" />

interface ProcessingMessage {
  type: 'PROCESS_ACTIVITIES' | 'PAUSE' | 'RESUME' | 'CLEAR';
  data?: any;
}

interface ProcessingResponse {
  type: 'PROGRESS' | 'COMPLETE' | 'ERROR' | 'PAUSED';
  data?: any;
  progress?: number;
  currentBatch?: number;
  totalBatches?: number;
}

class BackgroundProcessor {
  private isProcessing = false;
  private isPaused = false;
  private currentBatch = 0;
  private totalBatches = 0;
  private activities: any[] = [];
  private manifest: any = null;

  constructor() {
    self.addEventListener('message', this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent<ProcessingMessage>) {
    const { type, data } = event.data;

    switch (type) {
      case 'PROCESS_ACTIVITIES':
        this.startProcessing(data);
        break;
      case 'PAUSE':
        this.pauseProcessing();
        break;
      case 'RESUME':
        this.resumeProcessing();
        break;
      case 'CLEAR':
        this.clearProcessing();
        break;
    }
  }

  private async startProcessing(data: { activities: any[], manifest: any, batchSize?: number }) {
    if (this.isProcessing) return;

    this.activities = data.activities;
    this.manifest = data.manifest;
    this.isProcessing = true;
    this.isPaused = false;
    this.currentBatch = 0;
    
    const batchSize = data.batchSize || 50;
    this.totalBatches = Math.ceil(this.activities.length / batchSize);

    this.sendProgress();

    await this.processInBatches(batchSize);
  }

  private async processInBatches(batchSize: number) {
    for (let i = 0; i < this.activities.length && this.isProcessing; i += batchSize) {
      if (this.isPaused) {
        this.sendResponse({ type: 'PAUSED' });
        return;
      }

      const batch = this.activities.slice(i, i + batchSize);
      await this.processBatch(batch);
      
      this.currentBatch++;
      this.sendProgress();

      // Yield control to prevent blocking
      await this.sleep(0);
    }

    if (this.isProcessing && !this.isPaused) {
      this.isProcessing = false;
      this.sendResponse({ type: 'COMPLETE' });
    }
  }

  private async processBatch(batch: any[]) {
    // Simulate processing time - replace with actual processing logic
    for (const activity of batch) {
      // Process individual activity
      this.processActivity(activity);
    }
  }

  private processActivity(activity: any) {
    // Add your activity processing logic here
    // This runs in the worker thread, independent of main thread
  }

  private pauseProcessing() {
    this.isPaused = true;
  }

  private resumeProcessing() {
    if (this.isProcessing) {
      this.isPaused = false;
      this.processInBatches(50); // Resume with default batch size
    }
  }

  private clearProcessing() {
    this.isProcessing = false;
    this.isPaused = false;
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.activities = [];
    this.manifest = null;
  }

  private sendProgress() {
    const progress = this.totalBatches > 0 ? (this.currentBatch / this.totalBatches) * 100 : 0;
    this.sendResponse({
      type: 'PROGRESS',
      progress,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches
    });
  }

  private sendResponse(response: ProcessingResponse) {
    self.postMessage(response);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

new BackgroundProcessor();
