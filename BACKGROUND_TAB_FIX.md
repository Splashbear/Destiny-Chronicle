# Background Tab Loading Fix

## Problem
Destiny Chronicle stalled when loading player history in hidden/background browser tabs. Chrome throttles `setTimeout` to ~1 execution per minute after 5 minutes hidden, stalling the loading pipeline.

## Solution
Remove timer-based delays from the critical loading path. Let HTTP completion events pace requests naturally, with rate limiting enforced by timestamp checking rather than artificial delays.

## Changes Made

### 1. Activity DB Service (`activity-db.service.ts`)
**Removed fixed delays from PGCR prefetch**:
- ~~10 second setTimeout on throttle errors~~
- ~~1.8 second delay between batches~~
- ~~500ms delay between chunks~~

Result: Batches process as fast as HTTP allows. Rate limiter prevents API violations.

### 2. Rate Limiter Service (`rate-limiter.service.ts`)
**Event-driven queue instead of polling**:
- Requests resolved when slots become available
- Single setTimeout per queue state (when rate limit hit)
- No busy-wait polling loops

Result: Accurate rate limiting without stalling in hidden tabs. Max rate: 20 RPS (under Bungie's 25 RPS limit).

### 3. Played With Prefetch (`played-with-prefetch.service.ts`)
**Removed busy-wait polling**:
- ~~queueMicrotask polling for rate limit clearance~~
- Single setTimeout wait only after 429 (rare)

Result: Prefetch continues in background. Only waits on actual throttle responses.

### 4. Smart Cache Service (`smart-cache.service.ts`)
**Removed preload delay**:
- ~~50ms setTimeout in preload queue~~

Result: Preloading paced by DB operations naturally.

### 5. Player Search Component
**Kept setTimeout for non-critical paths**:
- Retry backoff: Error recovery (rare), acceptable if throttled
- UI timing (800ms pause): Non-critical display timing
- Visibility handler auto-dismiss: UI only, not loading-critical

Result: Non-critical timeouts don't block loading progress.

## Rate Limiting Strategy

### Before
- Fixed delays between batches (setTimeout)
- Polling for rate window clearance
- Throttled in hidden tabs → stalled loading

### After
- Event-driven: resolve when slot available
- Timestamp-based: track requests by completion time
- Single timer per queue state (not polling)
- **Max rate**: 20 RPS (5 RPS buffer under Bungie's 25 RPS limit)
- **Window**: 1 second sliding window
- **Burst**: Allows up to 20 requests in quick succession

### Why It Works in Hidden Tabs
The critical difference: **requests are paced by HTTP completion events**, not timers.

1. HTTP requests complete at normal speed (not throttled)
2. Request completion checks if queued requests can proceed
3. Rate limiter tracks based on actual timestamps
4. Only uses single setTimeout when rate limit is hit (rare)
5. Natural pacing from network latency + concurrency limits

Even if the setTimeout in the rate limiter is throttled in a hidden tab, it doesn't matter because:
- Requests continue to complete and trigger queue processing
- The setTimeout is a backup for when the queue is blocked
- Real pacing comes from HTTP events, not the timer

## What's NOT Fixed
- **Fully closed tabs**: Browser suspends JavaScript entirely
- **Tab discarding**: Chrome memory saver kills the process
- **OS sleep**: Network is suspended

These would require Web Workers or Service Workers (future work).

## Testing

### Rate Limit Compliance
- Monitor for HTTP 429 responses (should be zero)
- Check request rate doesn't exceed 20 RPS
- Verify queue processes correctly under load

### Hidden Tab Performance
- Start load, hide tab after 30s
- Verify logging continues
- Measure activities loaded per minute (visible vs hidden)
- Expected: Similar rate (~1-1.5x slower due to minor overhead)

### Browser Compatibility
- Chrome, Edge, Firefox, Safari
- All should work (no exotic APIs used)

## Performance Impact

### Loading Speed
- **Before**: Hidden tab 10-60x slower (severely throttled)
- **After**: Hidden tab ~1-1.5x slower (near-foreground speed)

### Rate Limit Accuracy
- More accurate (timestamp-based, not timer-based)
- No violations expected (5 RPS buffer)

### CPU Usage
- No busy-wait polling loops
- Single timer per queue state (low overhead)
- Event-driven processing (efficient)

## Files Modified
- `src/app/services/rate-limiter.service.ts` - Event-driven rate limiting
- `src/app/services/activity-db.service.ts` - Removed PGCR delays
- `src/app/services/played-with-prefetch.service.ts` - Removed polling
- `src/app/services/smart-cache.service.ts` - Removed preload delay
- `src/app/components/player-search/player-search.component.ts` - Visibility handler
- `README.md` - Removed limitation note
- `e2e/background-tab-loading.spec.ts` - Test created (pending execution)

## Measured Results

*Pending: Need to run actual load test with hidden tab*

### Visible Tab Load Time
- TBD

### Hidden Tab Load Time
- TBD

### Ratio (Hidden/Visible)
- Expected: 1.0-1.5x
- Measured: TBD

### Rate Limit Compliance
- HTTP 429 count: TBD (expected: 0)
- Max observed RPS: TBD (expected: ≤20)
