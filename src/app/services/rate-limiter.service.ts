import { Injectable } from '@angular/core';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  burstLimit: number; // Allow short bursts above the limit
}

@Injectable({
  providedIn: 'root'
})
export class RateLimiterService {
  private requestTimes: number[] = [];
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
   * Wait for rate limit to allow next request
   */
  async waitForRateLimit(): Promise<void> {
    const delay = this.getTimeUntilNextRequest();
    if (delay > 0) {
      console.log(`[RateLimit] Waiting ${delay}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Get rate limit status for monitoring
   */
  getStatus(): {
    currentRate: number;
    maxRate: number;
    utilizationPercent: number;
    timeUntilNext: number;
  } {
    const currentRate = this.getCurrentRate();
    const utilizationPercent = (currentRate / this.config.maxRequests) * 100;
    const timeUntilNext = this.getTimeUntilNextRequest();
    
    return {
      currentRate,
      maxRate: this.config.maxRequests,
      utilizationPercent,
      timeUntilNext
    };
  }
}
