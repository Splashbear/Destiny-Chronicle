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
  private nextCheckTimer: any = null;
  
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
   * Wait for rate limit slot to become available.
   * Event-driven: resolves immediately if slot available, or waits until a slot frees.
   * Uses a single setTimeout to check when the oldest request expires.
   * This avoids busy-waiting while still working in hidden tabs (though throttled, it's acceptable
   * since we're not on the critical path - requests are paced by actual HTTP completion).
   */
  async waitForRateLimit(): Promise<void> {
    return new Promise<void>((resolve) => {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;
      
      // Clean up old request times
      this.requestTimes = this.requestTimes.filter(time => time > windowStart);

      // If we have capacity, resolve immediately
      if (this.requestTimes.length < this.config.maxRequests) {
        this.requestTimes.push(now);
        resolve();
        return;
      }

      // Otherwise, queue the request
      const queuedRequest: QueuedRequest = {
        resolve,
        timestamp: now
      };
      
      this.requestQueue.push(queuedRequest);
      
      // Schedule a check for when the oldest request expires
      // This is the ONLY setTimeout, and it's acceptable because:
      // 1. It's not a polling loop (single timer per queue state)
      // 2. Even if throttled in hidden tabs, requests are naturally paced by HTTP completion
      // 3. The alternative (Web Worker) adds significant complexity for marginal gain
      if (!this.nextCheckTimer) {
        const oldestRequest = Math.min(...this.requestTimes);
        const waitTime = Math.max(0, this.config.windowMs - (now - oldestRequest) + 10); // +10ms buffer
        
        this.nextCheckTimer = setTimeout(() => {
          this.nextCheckTimer = null;
          this.processQueue();
        }, waitTime);
      }
    });
  }

  /**
   * Process queued requests - called when a slot becomes available.
   * Event-driven: triggered by setTimeout expiration or explicit call after request completion.
   */
  private processQueue(): void {
    if (this.requestQueue.length === 0) {
      return;
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Clean up old request times
    this.requestTimes = this.requestTimes.filter(time => time > windowStart);

    // Process all requests that can fit in the current window
    while (this.requestQueue.length > 0 && this.requestTimes.length < this.config.maxRequests) {
      const request = this.requestQueue.shift();
      if (request) {
        const currentTime = Date.now();
        this.requestTimes.push(currentTime);
        request.resolve();
      }
    }

    // If there are still queued requests, schedule next check
    if (this.requestQueue.length > 0 && !this.nextCheckTimer) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = Math.max(0, this.config.windowMs - (Date.now() - oldestRequest) + 10);
      
      this.nextCheckTimer = setTimeout(() => {
        this.nextCheckTimer = null;
        this.processQueue();
      }, waitTime);
    }
  }

  /**
   * Notify the rate limiter that a request completed.
   * This allows queued requests to be processed if slots are now available.
   * Call this after each HTTP request completes.
   */
  notifyRequestComplete(): void {
    // Process queue in case slots are available
    this.processQueue();
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
