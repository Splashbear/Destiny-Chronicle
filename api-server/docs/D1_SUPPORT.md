# Destiny 1 Support

This document describes Destiny 1 (D1) support in the api-server.

## Overview

The api-server now supports reading archived Destiny 1 activity and played-with data from separate D1-specific index roots. D1 support is **off by default** and only activates when `D1_INDEX_ROOT` is configured.

When D1 index roots are not configured, the server behaves identically to before — all requests are handled by existing D2 indexes and live Bungie API fallback.

## Key Principles

### 1. Account Keys

Account keys are **platform + membershipId**, never display names. This applies to both D1 and D2.

### 2. Game + Instance ID Keying

Everything is keyed by `(game, instance_id)` because **D1 and D2 instance IDs overlap numerically**. The same instance ID can exist in both games and refer to completely different activities.

- A PGCR request for instance `12345678` with `game=D1` returns the D1 activity
- A PGCR request for instance `12345678` with `game=D2` returns the D2 activity
- These are never merged or mixed

### 3. D1 and D2 Never Merged

D1 and D2 data are kept completely separate. A player's activity history for D1 and D2 are independent lists that are never combined.

## D1 Index Layouts

### Activity Index

**Path**: `D1_INDEX_ROOT/act/mid_bucket=N/instances.parquet`

**Bucketing**: `hash(membership_id::VARCHAR) % 256` (same hash function as D2)

**Test Vector**: membership ID `4611686018443970323` maps to bucket `115`

**Sorted By**: `(membership_id, instance_id)`

**Schema**:
```
instance_id           BIGINT
period                TIMESTAMP
activity_hash         UINTEGER
mode                  SMALLINT
membership_id         BIGINT
membership_type       TINYINT
character_id          BIGINT
completed             BOOLEAN
deaths                INTEGER
kills                 INTEGER
assists               INTEGER
duration_seconds      INTEGER
game                  VARCHAR ('D1')
display_name          VARCHAR (nullable, ~7% NULL)
mid_bucket            BIGINT
```

**Quirks**:
- ~7% of rows (161.5M) have `NULL` display_name
- 113,274 rows have `character_id = 0` (all Nov 17 2014 games ~16:37-17:12 ET) — this is Bungie data, not a bug
- D1 has no Bungie Name/code, only per-platform display name

### Played-With Index

**Path**: `D1_INDEX_ROOT/pw/iid_band=N/pw.parquet`

**Banding**: `N = instance_id // 1,000,000`

**Sorted By**: `(instance_id, membership_id)`

**Schema**:
```
instance_id           BIGINT
membership_id         BIGINT
membership_type       TINYINT
period                TIMESTAMP
activity_hash         UINTEGER
mode                  SMALLINT
iid_band              BIGINT
```

**Extra Column**: `membership_type` is present in D1 played-with rows but not in D2 compact played-with.

## Coverage Caveat

**IMPORTANT**: This D1 index contains **billion 1 only** (instance IDs `1` to `1,000,000,000`), covering **August 30 to December 9, 2014**.

Other billions are missing, so later D1 activity history is **incomplete** from this source and **must fall back to Bungie live API** for any games after Dec 9, 2014.

**D1 is still an active game**. Recent D1 activities exist and are real — they just aren't in this archive.

### API Response Notes

All D1 tier responses include a note in `tier.notes`:
```
"D1 coverage: billion 1 only (IDs 1-1B, Aug 30 to Dec 9 2014). Later D1 history falls back to Bungie live."
```

## Configuration

### Environment Variables

Add these to your `.env`:

```bash
# Destiny 1 index root (optional, off by default)
# Points to parent folder containing act/ and pw/ subdirectories
D1_INDEX_ROOT=/path/to/d1/final

# D1 played-with root (optional, used by played-with routes)
# Typically the same as D1_INDEX_ROOT (contains pw/ subdirectory)
D1_PLAYED_WITH_ROOT=/path/to/d1/final
```

Both variables typically point to the same parent folder (e.g., `D:\d1\final`) which contains:
- `act/mid_bucket=N/instances.parquet` (activity index, ~30.2 GB)
- `pw/iid_band=N/pw.parquet` (played-with index, ~13.0 GB)
- **Total: ~43 GB**

If `D1_INDEX_ROOT` is not set or empty, D1 support is disabled and behavior is unchanged.

### Server Startup

When D1 index roots are configured, the server logs:
```
Archive initialized: {
  ...
  d1IndexRoot: '/path/to/d1_index' (or '(none)')
}
```

## API Behavior

### Player Activities Endpoint

`GET /players/:membershipId/activities?game=D1`

**With D1_INDEX_ROOT configured**:
1. Tries Tier 1 (lite parquet) — if D1 data present
2. Tries Tier 2 (per-mid extract) — if D1 data present
3. Tries Tier 3 (compact index) — D2 only
4. **Tries Tier 3.5 (D1 act index)** — only for `game=D1` requests
5. Falls back to absent (client uses Bungie API)

**Response**:
```json
{
  "membershipId": "4611686018443970323",
  "coverage": {
    "level": "full",
    "source": "d1_act",
    "rowCount": 1234,
    "minPeriod": "2014-08-30T12:00:00Z",
    "maxPeriod": "2014-12-09T23:59:00Z",
    "indexComplete": true,
    "filtersApplied": false,
    "notes": [
      "D1 coverage: billion 1 only (IDs 1-1B, Aug 30 to Dec 9 2014). Later D1 history falls back to Bungie live."
    ]
  },
  "activities": [...]
}
```

### PGCR Endpoints

`GET /pgcr/:instanceId?game=D1`

`GET /api/pgcr/:instanceId?game=D1`

**Behavior**:
- D1 PGCRs **ALWAYS** come from Bungie live API (D1 act index is keyed by membership_id, not instance_id)
- Never returns D2 data for a D1 request, even if the numeric instance ID exists in D2
- D2 PGCRs use archive → live fallback as usual

### Played-With Endpoint

`POST /played-with`

**With D1_PLAYED_WITH_ROOT configured**:
- Plans D1 bands for instance IDs in range 1 to 1,000,000,000
- Reads from `D1_INDEX_ROOT/pw/iid_band=N/pw.parquet`
- Coverage response includes `d1Bands` count

**Response**:
```json
{
  "partners": [...],
  "coverage": {
    "complete": true,
    "totalInstances": 100,
    "coveredInstances": 100,
    "uncoveredInstances": 0,
    "uncoveredReasons": {},
    "legacyBands": 5,
    "compactBands": 3,
    "minimalBands": 0,
    "d1Bands": 10
  }
}
```

## Data Sizes

- **Activities** (`act/`): 2,246,590,862 rows, 256 buckets (~30.2 GB)
- **Played-With** (`pw/`): 1,001 bands (~13.0 GB)
- **Total**: ~43 GB

## Type System Updates

### TierInfo Source

`archive.service.ts`:
```typescript
source: 'lite' | 'extract' | 'compact_ids' | 'gap_lean' | 'merged' | 'none' | 'pending' | 'd1_act'
```

### PlayerActivitiesCoverage Source

`lean-activity.types.ts`:
```typescript
source: 'lite' | 'extract' | 'compact_ids' | 'gap_lean' | 'merged' | 'none' | 'pending' | 'archive' | 'd1_act'
```

### PlayedWithCoverage

`played-with.service.ts`:
```typescript
interface PlayedWithCoverage {
  complete: boolean;
  totalInstances: number;
  coveredInstances: number;
  uncoveredInstances: number;
  uncoveredReasons: Record<string, number>;
  legacyBands: number;
  compactBands: number;
  minimalBands: number;
  d1Bands: number;  // NEW
}
```

## Differences from D2 Indexes

### Compact Index (D2)

- **Hard-codes game**: Existing compact index code assumes `game = 'D2'`
- **No game column**: Compact parquet files don't store game
- **Layout**: `COMPACT_INDEX_ROOT/mid_bucket=N/instances.parquet`

### D1 Act Index

- **Stores game**: D1 parquet files have a `game` VARCHAR column (value `'D1'`)
- **Separate root**: Lives under `D1_INDEX_ROOT`, not mixed with D2
- **Full schema**: Has period, activity_hash, mode, etc. (not just instance IDs)
- **Layout**: `D1_INDEX_ROOT/act/mid_bucket=N/instances.parquet`

### D1 Played-With

- **Extra column**: Has `membership_type` (D2 compact pw does not)
- **Numeric types**: `membership_id` and `character_id` are `BIGINT` (D2 uses `VARCHAR` in newer indexes)
- **Layout**: `D1_INDEX_ROOT/pw/iid_band=N/pw.parquet`

## Testing

Tests are in `src/__tests__/d1-support.test.ts`.

**Coverage**:
- Bucket hash calculation (test vector)
- D1 activity index lookup
- Game parameter filtering (D1 vs D2 requests)
- NULL display_name handling
- character_id = 0 handling (Nov 17 2014 Bungie data)
- D1 played-with band planning
- D1/D2 instance ID overlap
- Account key format (platform + membershipId)

**Run tests**:
```bash
npm test -- d1-support
```

## Migration Notes

### For Existing Deployments

1. D1 support is **completely opt-in**
2. No changes required if you don't configure D1 index roots
3. Server behavior is **identical** without D1 configuration
4. No breaking changes to existing API contracts

### Adding D1 Support

1. Set `D1_INDEX_ROOT` environment variable
2. Optionally set `D1_PLAYED_WITH_ROOT` for played-with features
3. Restart the server
4. D1 tier will activate for `game=D1` requests

## Future Enhancements

- [ ] Support for other D1 billions (if data becomes available)
- [ ] D1 lite/extract tiers (currently only act tier implemented)
- [ ] D1-specific watermark (currently uses D2 watermark logic)
- [ ] D1 Bungie Name support (if Bungie adds it)

## See Also

- [Multi-tier Archive Lookup](README.md#multi-tier-archive-lookup)
- [PGCR Game Routing Tests](../src/__tests__/pgcr-game-routing.test.ts)
- [Played-With Service](../src/services/played-with.service.ts)
