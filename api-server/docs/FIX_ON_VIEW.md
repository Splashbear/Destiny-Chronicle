# Fix-on-View for Flagged D2 PGCRs

## Overview

The fix-on-view feature automatically corrects suspect D2 PGCRs (Post-Game Carnage Reports) from the archive dump. A scan identified 127,017,229 D2 instance IDs (0-16B range) as potentially missing players due to early extraction. A measured sample showed ~0.34% truly missing players with no stat differences otherwise.

Instead of bulk refetch (rejected), this implements fix-on-view: when serving a flagged PGCR, fetch the corrected copy from Bungie, save it to a durable override store, and serve it from then on. First view may wait briefly or show a 'verifying' marker.

## Architecture

### Components

1. **Flag Lookup Service** (`api-server/src/services/flag-lookup.service.ts`)
   - Fast on-disk lookup using sorted 12-byte records per 10M-ID band
   - Binary search for O(log n) per-band lookups
   - Memory: ~1MB per 131k flagged IDs per band, loaded on-demand
   - Format: `<root>/band_<bandId>.bin` (12 bytes per record, sorted by ID, little-endian: 8B ID + 1B mode + 1B rule + 2B padding)

2. **Override Store** (`pgcr-override.store.ts`)
   - Stores corrected Bungie PGCR responses
   - Layout: `<root>/<game>/<iid/1e6>/<iid>.json.gz`
   - Keyed by (game, instanceId) since D1/D2 IDs overlap
   - Gzip compressed, ~2-10KB per PGCR

3. **Fix-on-View Service** (`fix-on-view.service.ts`)
   - Coordinates flag lookup, override store, and Bungie fetching
   - Configurable wait time on first view (default: 2s)
   - Handles Bungie errors gracefully (privacy, not found, disabled)
   - Never blocks indefinitely on user requests

4. **Batch Pre-Fix Script** (`scripts/batch-fix-accounts.ts`)
   - Pre-fixes flagged games for top accounts (leaderboard_seeds.json, seeds.json)
   - Parallel fetching with configurable concurrency
   - Respects Bungie rate limits (reuses PLAYED_WITH_BUNGIE_PARALLEL)

### Data Flow

```
User requests PGCR
    ↓
Is flagged? (Flag Lookup)
    ↓ Yes
Override exists? (Override Store)
    ↓ No
Fetch from Bungie (with timeout)
    ↓
Save to Override Store
    ↓
Serve corrected PGCR
```

## Setup

### 1. Build Flag Lookup

The converter script builds the compact flag lookup from the v3_*.json scan files:

```bash
cd api-server
npx ts-node scripts/build-flag-lookup.ts //Exit43Server/.../v3_json /path/to/flag_lookup
```

**Input format (v3_*.json files):**
- 1,600 files named `v3_<bandStartId>.json` (e.g., `v3_0.json`, `v3_10000000.json`, `v3_13300000000.json`)
- Each covers 10M instance IDs starting at `<bandStartId>` (must be multiple of 10M)
- JSON object: `{ "file": "...", "records": N, "flagged": M, "flags": [...] }`
- Each flag is an array: `[instanceId_str, n1, n2, n3, mode, rule_str, n4, n5]`
  - Element 0: instance ID (string)
  - Element 4: D2 activity mode (number)
  - Element 5: rule "A" or "L" (string)
- Non-v3_*.json files (e.g., status.json) may exist in the same folder; skipped

**Validation:**
- File names match pattern with `bandStartId % 10M == 0`
- `flagged` field equals `flags.length`
- Instance IDs numeric and within expected range for each file
- Instance IDs unique within each output band
- Rule is "A" or "L"

**Output:**
- `band_<bandId>.bin` files (bandId = Math.floor(instanceId / 10M))
- Packed records (12 bytes each): 8B ID + 1B mode + 1B rule + 2B padding
- Rule byte: `0x41` 'A', `0x4C` 'L', `0x42` 'B' = combined AL (both rules flagged the game). Input `rule` of `"AL"` maps to `0x42`.
- The converter streams one band (input file) at a time and accepts instance IDs as numbers or strings.
- Total storage: ~1.5GB for 127M flagged IDs (12 bytes each)

### 2. Configure Environment

Add to `.env` or environment:

```bash
# Flag lookup directory (built by build-flag-lookup.ts)
FLAG_LOOKUP_ROOT=D:\DestinyChronicleDB\flag_lookup

# Override store directory for corrected PGCRs
PGCR_OVERRIDE_STORE_ROOT=D:\DestinyChronicleDB\pgcr_overrides

# Enable fix-on-view feature
FIX_ON_VIEW_ENABLED=true

# Max wait time for Bungie fetch on first view (ms)
# 0 = return immediately, 1000-3000 = brief wait (recommended)
FIX_ON_VIEW_WAIT_MS=2000

# Flag filter mode (default: "all")
# "all" = All flagged IDs regardless of mode/rule
# "sharp" = Keep a record if either rule passes (A unless mode 2,4,6,82; L only mode 40); AL kept if A or L passes
FLAG_FILTER=all

# Bungie API key (already configured for Played With v2)
BUNGIE_API_KEY=your_api_key_here
```

### 3. Run Server

```bash
cd api-server
npm run build
npm start
```

Server logs will show:
```
Fix-on-view enabled {
  flaggedIds: 127017229,
  existingOverrides: 0,
  waitMs: 2000
}
```

### 4. Batch Pre-Fix (Optional)

Pre-fix flagged games for top accounts:

```bash
cd api-server
npx ts-node scripts/batch-fix-accounts.ts [--dry-run] [--accounts=<mid1>,<mid2>,...]
```

Options:
- `--dry-run`: Don't save overrides (just count what would be fixed)
- `--accounts=<mids>`: Only fix specific accounts (comma-separated membershipIds)
- Default: Processes all accounts in leaderboard_seeds.json and seeds.json

Environment variables:
- `PLAYED_WITH_BUNGIE_PARALLEL`: Parallel fetches (default: 10)
- `BUNGIE_API_KEY` or `BUNGIE_API_KEY_FILE`: API key

Example:
```bash
# Dry run to see what would be fixed
npx ts-node scripts/batch-fix-accounts.ts --dry-run

# Fix all top accounts
npx ts-node scripts/batch-fix-accounts.ts

# Fix specific accounts
npx ts-node scripts/batch-fix-accounts.ts --accounts=4611686018443970323,4611686018467260757
```

## Behavior

### Single PGCR Endpoint

**GET /pgcr/:instanceId?game=D2**

1. If not flagged → serve archive copy
2. If flagged and override exists → serve override
3. If flagged and no override:
   - `FIX_ON_VIEW_WAIT_MS > 0`: Wait briefly for Bungie fetch, save override, serve corrected copy
   - `FIX_ON_VIEW_WAIT_MS = 0`: Serve archive copy immediately, trigger async fix

### Batch PGCR Endpoint

**POST /pgcr/batch**

Same logic as single endpoint, applied per instance.

### Played With Summaries

When a Played With summary build encounters flagged games:
- Override exists → use corrected roster
- Override doesn't exist → use archive roster (will be corrected on next view/rebuild)

Batch pre-fix script marks affected summaries for rebuild when a fix changes a roster (TODO: implement marking logic if needed).

## Storage Cost

**Per viewed flagged game:**
- Full Bungie PGCR response (gzip compressed)
- Typical: 2-10KB compressed (10-50KB uncompressed)
- Average from sampling: ~5KB

**Important**: Overrides store EVERY viewed flagged game, not just ones with actually missing players. Even if only ~0.34% truly missing, all 127M flagged games could eventually be stored if viewed.

**Total cost estimate:**
- Best case (only viewed games): Depends on view patterns
- Worst case (all flagged games viewed): 127M × 5KB = ~635GB
- Realistic estimate (top accounts pre-fixed + organic views): ~10-50GB over time

**Override store organization:**
```
pgcr_overrides/
  D2/
    12345/        # Band 12345 (12.345-12.346B instance IDs)
      12345678901.json.gz
      12345678902.json.gz
      ...
```

## Rate Limiting

- Default: ≤10 requests/second to Bungie (configurable via PLAYED_WITH_BUNGIE_PARALLEL)
- Batch script respects PLAYED_WITH_POST_ARCHIVE_DIR for shared rate limiting
- Handles Bungie errors gracefully:
  - Privacy (ErrorCode 7): Keep dump copy, don't retry
  - Not found (ErrorCode 1653): Keep dump copy, don't retry
  - Throttle (ErrorCode 36/51): Exponential backoff, retry
  - 5xx errors: Exponential backoff, retry

## Security

- Never logs API key (usage logs record accounts/counts only, no IPs)
- API key loaded from BUNGIE_API_KEY or BUNGIE_API_KEY_FILE
- No personal data stored (only public PGCR data)

## Monitoring

**Health endpoint** includes fix-on-view stats:

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "fix_on_view": {
    "enabled": true,
    "flaggedRequests": 1234,
    "overrideHits": 890,
    "bungieFetches": 344,
    "bungieFetchErrors": 10,
    "overridesSaved": 334
  }
}
```

## Rollback

To disable fix-on-view without removing data:

1. Set `FIX_ON_VIEW_ENABLED=false` in environment
2. Restart server
3. Archive copies will be served for all PGCRs
4. Override store remains intact (can re-enable later)

To fully remove:

1. Stop server
2. Set `FIX_ON_VIEW_ENABLED=false`
3. Delete override store: `rm -rf D:\DestinyChronicleDB\pgcr_overrides`
4. Delete flag lookup: `rm -rf D:\DestinyChronicleDB\flag_lookup`
5. Restart server

## Testing

Run tests:

```bash
cd api-server
npm test

# Specific test files
npm test flag-lookup.test.ts
npm test pgcr-override-store.test.ts
npm test fix-on-view.test.ts
```

## Not Covered

This PR does NOT include:

1. **Admin UI**: No web interface for monitoring fix progress or triggering batch fixes. Use the batch script for pre-fixing and health endpoint for monitoring.

2. **Automatic batch fixing**: Batch pre-fix is manual via script. Could be scheduled via cron/Task Scheduler, but not included here.

3. **D1 support**: Flag data is D2-only (scan was D2 0-16B). D1 games are never flagged.

4. **Real-time sync with Played With v2**: Post-archive store (PLAYED_WITH_POST_ARCHIVE_DIR) and override store are separate. Games >16B continue to use post-archive; <16B use override when flagged.

## Performance

- Flag lookup: O(log n) binary search per band, <1ms typical
- Override store: Direct file read, <10ms typical
- First view with Bungie fetch: 500-3000ms (configurable wait)
- Subsequent views: Served from override, <10ms

Memory usage:
- Flag lookup: ~15-150MB peak (12 bytes per record, bands loaded on-demand, cached)
- Override store: File-based, no in-memory cache
- Total: Modest, suitable for limited-RAM Windows server

## Future Enhancements

1. Admin API for triggering batch fixes and monitoring progress
2. Scheduled batch fixing (nightly job for top accounts)
3. Compression ratio tracking for storage optimization
4. Cache warming: Pre-load flag bands for most-requested ranges
5. Override store cleanup: Remove overrides for games with no roster changes
6. Metrics dashboard: View patterns, fix rates, storage growth
