# Background Tab Loading Investigation & Fix Plan

## Problem Statement
The Destiny Chronicle application stalls when loading player history in a background/hidden browser tab. This occurs because browsers throttle timers (setTimeout, setInterval, requestAnimationFrame) in hidden tabs to save resources - Chrome's intensive throttling limits chained timers to ~once per minute after 5 minutes hidden.

## Affected Files & Timer Usage

### 1. Rate Limiting Service (`src/app/services/rate-limiter.service.ts`)
- **Line 81**: `await new Promise(resolve => setTimeout(resolve, delay))`
- **Purpose**: Rate limiting to stay under Bungie's 25 RPS limit
- **Impact**: Critical - delays between API requests get throttled in background tabs

### 2. Played With Prefetch Service (`src/app/services/played-with-prefetch.service.ts`)
- **Lines 118-120**: `await sleep(50)` (uses setTimeout internally at line 179)
- **Purpose**: Small delays between rate limit checks
- **Impact**: Moderate - stalls PGCR prefetching pipeline

### 3. Activity DB Service (`src/app/services/activity-db.service.ts`)
- **Line 517**: `setTimeout(() => window.location.reload(), 100)` - DB error recovery
- **Line 2153**: `await new Promise((r) => setTimeout(r, 10_000))` - throttle recovery delay
- **Line 2158**: `await new Promise(resolve => setTimeout(resolve, delayMs))` - batch pacing
- **Line 2453**: `await new Promise(resolve => setTimeout(resolve, 500))` - chunk delays
- **Line 3368**: `setTimeout(() => { this.performCacheCleanup(); ... }, interval)` - cache cleanup
- **Purpose**: Various delays for pacing, recovery, and cleanup
- **Impact**: Critical - these delays pace the main activity fetching pipeline

### 4. Smart Cache Service (`src/app/services/smart-cache.service.ts`)
- **Line 177**: `await new Promise(resolve => setTimeout(resolve, 50))` - preload queue pacing
- **Line 261**: `setInterval(() => { ... }, 60000)` - periodic cache cleanup
- **Purpose**: Pacing preload operations and periodic cleanup
- **Impact**: Low-moderate - affects caching performance

### 5. Player Search Component (`src/app/components/player-search/player-search.component.ts`)
- **Line 3898**: `await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * retries))` - retry backoff
- **Line 4648**: `await new Promise(r => setTimeout(r, 800))` - UI message display pause
- **Line 10832**: `await new Promise(resolve => setTimeout(resolve, 100))` - screenshot capture delay
- **Purpose**: Retry logic, UI timing, screenshot timing
- **Impact**: Moderate - can stall loading progress updates

### 6. Bungie API Service (`src/app/services/bungie-api.service.ts`)
- **Line 451**: `return timer(delay)` - RxJS timer for retry backoff
- **Purpose**: Exponential backoff for failed API requests
- **Impact**: Moderate - retries get severely delayed in background tabs

## Solution Approach

### Phase 1: Replace Timer-Based Pacing with Request-Chained Pacing
**Goal**: Remove setTimeout/setInterval from critical loading paths; chain operations on promise completion instead.

#### 1.1 Rate Limiter Service
- Replace `setTimeout` with a token bucket or timestamp-based approach
- Check rate limits synchronously; queue requests in a promise chain
- Return promises that resolve when the rate limit window allows the request

#### 1.2 Activity Loading Pipeline
- Remove artificial delays between batches
- Pace operations based on actual request completion
- Use a queue with concurrency limit instead of fixed delays
- Maintain rate limiting through the improved rate limiter

#### 1.3 Played With Prefetch
- Remove sleep() delays
- Use promise queue with concurrency control
- Rate limit through timestamp checks, not delays

### Phase 2: Web Worker for Heavy Lifting
**Goal**: Move the fetch/crawl orchestration to a Web Worker where timers aren't throttled.

#### 2.1 Create Activity Loader Worker
- Worker handles:
  - Activity list paging coordination
  - PGCR batch fetching orchestration
  - Progress tracking
  - Rate limit enforcement
- Main thread handles:
  - UI updates
  - IndexedDB writes (or use SharedArrayBuffer for coordination)
  - User interaction

#### 2.2 Message Protocol
```typescript
// Main -> Worker
interface LoadRequest {
  type: 'load';
  accounts: Array<{ membershipId: string; characterId: string; game: 'D1' | 'D2' }>;
  date: string;
}

interface CancelRequest {
  type: 'cancel';
}

// Worker -> Main
interface ProgressUpdate {
  type: 'progress';
  phase: string;
  current: number;
  total: number;
  message: string;
}

interface ActivityBatch {
  type: 'activities';
  data: Activity[];
  accountKey: string;
}

interface LoadComplete {
  type: 'complete';
}
```

### Phase 3: Resume from Progress (IndexedDB Checkpoints)
**Goal**: If tab is discarded or reloaded, resume from saved progress instead of starting over.

#### 3.1 Progress Tracking Schema
```typescript
interface LoadProgress {
  id: string; // composite key: date + accounts
  startedAt: string;
  accounts: Array<{
    membershipId: string;
    characterId: string;
    game: 'D1' | 'D2';
    status: 'pending' | 'loading' | 'complete' | 'error';
    pagesLoaded: number;
    totalPages?: number;
    lastActivityId?: string;
  }>;
  playedWithProgress?: {
    fetchedCount: number;
    totalCount: number;
  };
}
```

#### 3.2 Checkpoint Strategy
- Save progress after each character page completes
- Save after each PGCR batch completes
- On tab reload/resume: check for in-progress loads and offer to resume
- Clean up completed/stale progress records after 24 hours

### Phase 4: Visibility Change Detection
**Goal**: Detect when user returns to tab and update UI accordingly.

#### 4.1 Visibility API Integration
- Listen to `document.visibilityState` changes
- When tab becomes visible after being hidden:
  - Trigger a UI refresh to show latest progress
  - Display informational message about background loading
  - Optionally speed up progress updates briefly

### Phase 5: Testing
**Goal**: Verify the fix works across browsers and scenarios.

#### 5.1 Test Scenarios
1. **Headless Chrome with hidden page**: Measure load time visible vs hidden
2. **Tab switching**: Start load, switch tabs, return after 5+ minutes
3. **Tab discard**: Force tab discard (chrome://discards), reload, verify resume
4. **Cross-browser**: Test Chrome, Edge, Firefox, Safari

#### 5.2 Test Metrics to Capture
- Activities loaded per minute (visible vs hidden)
- Total load time for standard test account (visible vs hidden)
- Resume success rate after tab discard
- Rate limit violations (should be zero)

## Implementation Order

1. **Phase 1.1**: Fix rate-limiter.service.ts (no setTimeout)
2. **Phase 1.2**: Fix activity-db.service.ts batch pacing
3. **Phase 1.3**: Fix played-with-prefetch.service.ts
4. **Phase 3**: Add progress checkpointing to IndexedDB
5. **Phase 4**: Add visibility change detection
6. **Phase 2**: Move to Web Worker (optional, if Phase 1 insufficient)
7. **Phase 5**: Comprehensive testing

## Files to Create/Modify

### New Files
- `src/app/workers/activity-loader.worker.ts` (Phase 2)
- `src/app/services/load-progress.service.ts` (Phase 3)
- `e2e/background-tab-loading.spec.ts` (Phase 5)

### Modified Files
- `src/app/services/rate-limiter.service.ts`
- `src/app/services/activity-db.service.ts`
- `src/app/services/played-with-prefetch.service.ts`
- `src/app/services/smart-cache.service.ts`
- `src/app/components/player-search/player-search.component.ts`
- `src/app/services/bungie-api.service.ts`
- `README.md` (update the limitations section)

## Success Criteria

1. ✅ Loading continues at near-foreground speed in hidden tabs
2. ✅ Rate limiting remains accurate (no Bungie API violations)
3. ✅ Discarded tabs can resume from last checkpoint
4. ✅ All existing functionality preserved (D1/D2, accounts, PGCR, Played With, firsts, etc.)
5. ✅ No analytics identifiers sent (maintain privacy)
6. ✅ Works across Chrome, Edge, Firefox, Safari

## Risk Mitigation

1. **Rate limiting accuracy**: Timestamp-based checks may drift; maintain request queue with actual timing
2. **Web Worker overhead**: May add complexity; implement only if Phase 1 insufficient
3. **IndexedDB performance**: Large checkpoint writes may impact UX; throttle checkpoint frequency
4. **Cross-browser compatibility**: Test Worker & IndexedDB extensively across browsers
