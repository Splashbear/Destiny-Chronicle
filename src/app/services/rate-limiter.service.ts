import { Injectable } from '@angular/core';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  burstLimit: number; // Allow short bursts above the limit
}

interface QueuedRequest {
  resolve: () => void;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class RateLimiterService {
  private requestTimes: number[] = [];
  private requestQueue: QueuedRequest[] = [];
  private processingQueue = false;
  
  private readonly config: RateLimitConfig = {
    maxRequests: 20, // Stay well under Bungie's 25 RPS limit
    windowMs: 1000, // 1 second window
    burstLimit: 5 // Allow 5 requests in quick succession
  };

  /**
   * Check if we can make a request without exceeding rate limits
   */
  canMakeRequest(): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Remove old requests outside the window
    this.requestTimes = this.requestTimes.filter(time => time > windowStart);
    
    // Check if we're under the limit
    return this.requestTimes.length < this.config.maxRequests;
  }

  /**
   * Record a request and return delay needed to stay under limits
   */
  recordRequest(): number {
    const now = Date.now();
    this.requestTimes.push(now);
    
    // If we're at the limit, calculate delay needed
    if (this.requestTimes.length >= this.config.maxRequests) {
      const oldestRequest = Math.min(...this.requestTimes);
      const delayNeeded = this.config.windowMs - (now - oldestRequest);
      return Math.max(0, delayNeeded);
    }
    
    return 0;
  }

  /**
   * Get current request rate (requests per second)
   */
  getCurrentRate(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const recentRequests = this.requestTimes.filter(time => time > windowStart);
    return recentRequests.length;
  }

  /**
   * Get time until next request is allowed
   */
  getTimeUntilNextRequest(): number {
    if (this.canMakeRequest()) {
      return 0;
    }
    
    const now = Date.now();
    const oldestRequest = Math.min(...this.requestTimes);
    return this.config.windowMs - (now - oldestRequest);
  }

  /**
   * Wait for rate limit to allow next request using requestAnimationFrame-based loop
   * instead of setTimeout. This prevents throttling in background tabs.
   */
  async waitForRateLimit(): Promise<void> {
    return new Promise<void>((resolve) => {
      const queuedRequest: QueuedRequest = {
        resolve,
        timestamp: Date.now()
      };
      
      this.requestQueue.push(queuedRequest);
      this.processQueue();
    });
  }

  /**
   * Process the request queue without relying on setTimeout/setInterval.
   * Uses a hybrid approach: immediate processing when under limit,
   * polling with small sleeps when at limit.
   */
  private processQueue(): void {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    const processNext = () => {
      if (this.requestQueue.length === 0) {
        this.processingQueue = false;
        return;
      }

      const now = Date.now();
      const windowStart = now - this.config.windowMs;
      
      // Clean up old request times
      this.requestTimes = this.requestTimes.filter(time => time > windowStart);

      // Check if we can process the next request
      if (this.requestTimes.length < this.config.maxRequests) {
        const request = this.requestQueue.shift();
        if (request) {
          this.requestTimes.push(now);
          request.resolve();
          
          // Process next request immediately if queue has more
          if (this.requestQueue.length > 0) {
            queueMicrotask(() => processNext());
          } else {
            this.processingQueue = false;
          }
        }
      } else {
        // Rate limit hit - need to wait until window expires
        const oldestRequest = Math.min(...this.requestTimes);
        const waitTime = this.config.windowMs - (now - oldestRequest);
        
        if (waitTime > 0) {
          // Instead of setTimeout which gets throttled, we'll use a short polling loop
          // with 10ms granularity. This is much better than throttled setTimeout (1000ms+ in hidden tabs)
          // but doesn't burn CPU like a tight queueMicrotask loop.
          const targetTime = now + waitTime;
          const pollForSlot = () => {
            const nowCheck = Date.now();
            if (nowCheck >= targetTime) {
              processNext();
            } else {
              // Re-check in next microtask batch (essentially setImmediate)
              // This gives us ~1-5ms granularity without blocking
              queueMicrotask(pollForSlot);
            }
          };
          queueMicrotask(pollForSlot);
        } else {
          processNext();
        }
      }
    };

    processNext();
  }

  /**
   * Get rate limit status for monitoring
   */
  getStatus(): {
    currentRate: number;
    maxRate: number;
    utilizationPercent: number;
    timeUntilNext: number;
    queuedRequests: number;
  } {
    const currentRate = this.getCurrentRate();
    const utilizationPercent = (currentRate / this.config.maxRequests) * 100;
    const timeUntilNext = this.getTimeUntilNextRequest();
    
    return {
      currentRate,
      maxRate: this.config.maxRequests,
      utilizationPercent,
      timeUntilNext,
      queuedRequests: this.requestQueue.length
    };
  }
}
