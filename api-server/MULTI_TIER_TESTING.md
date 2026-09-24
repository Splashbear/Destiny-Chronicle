# Multi-Tier Archive Lookup Testing Guide

This guide provides curl examples for testing each tier of the multi-tier archive lookup system.

## Prerequisites

1. Start the API server: `npm run dev`
2. Configure environment variables in `.env`

## Test Membership IDs

- **Tier 1 (Lite)**: Use a membership ID that exists in `PLAYER_ACTIVITIES_LITE_PATH`
- **Tier 2 (Extract)**: Use a membership ID that has a file in `MID_LIGHT_EXTRACT_DIR`
- **Tier 3 (Compact)**: Use a membership ID in the compact index (e.g., `4611686018443970323`)
- **Tier 4 (Absent)**: Use any membership ID not in the above tiers (e.g., `9999999999999`)

## Curl Examples

### Tier 1: Full Coverage (Lite)

```bash
# Example with a lite-tier membership ID
curl -s "http://localhost:3001/players/{LITE_MID}/activities?game=D2&limit=10" | jq '.coverage'
```

Expected response:
```json
{
  "level": "full",
  "source": "lite",
  "rowCount": 8525,
  "minPeriod": "2017-09-06T17:45:00Z",
  "maxPeriod": "2024-12-31T23:59:00Z",
  "watermarkNote": "Archive contains activities up to instance ID 15999999999"
}
```

### Tier 2: Full Coverage (Extract)

```bash
# Example with an extract-tier membership ID
curl -s "http://localhost:3001/players/{EXTRACT_MID}/activities?game=D2&limit=10" | jq '.coverage'
```

Expected response:
```json
{
  "level": "full",
  "source": "extract",
  "rowCount": 8525,
  "minPeriod": "2017-09-06T17:45:00Z",
  "maxPeriod": "2024-12-31T23:59:00Z",
  "watermarkNote": "Archive contains activities up to instance ID 15999999999"
}
```

### Tier 3: Partial Coverage (Compact IDs)

```bash
# Test vector: mid 4611686018443970323 should map to bucket 115
curl -s "http://localhost:3001/players/4611686018443970323/activities?game=D2&limit=10" | jq '{coverage, sampleActivity: .activities[0]}'
```

Expected response:
```json
{
  "coverage": {
    "level": "partial",
    "source": "compact_ids",
    "rowCount": 8525,
    "minPeriod": null,
    "maxPeriod": null,
    "watermarkNote": "Archive contains activities up to instance ID 15999999999"
  },
  "sampleActivity": {
    "instanceId": "14387652901",
    "characterId": "2305843009504575107",
    "period": "",
    "activityHash": 0,
    "mode": 0,
    "membershipId": "4611686018443970323",
    "membershipType": 0,
    "completed": false,
    "deaths": 0,
    "durationSeconds": 0,
    "game": "D2"
  }
}
```

Note: `period`, `activityHash`, and `mode` are empty/zero because tier 3 only has instance IDs.

### Tier 4: Absent Coverage

```bash
# Example with a non-existent membership ID
curl -s "http://localhost:3001/players/9999999999999/activities?game=D2&limit=10" | jq '.coverage'
```

Expected response:
```json
{
  "level": "absent",
  "source": "none",
  "rowCount": 0,
  "minPeriod": null,
  "maxPeriod": null,
  "watermarkNote": "Archive contains activities up to instance ID 15999999999"
}
```

## Batch Queries

Test multiple membership IDs across different tiers:

```bash
curl -s -X POST "http://localhost:3001/players/activities/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "membershipIds": ["4611686018443970323", "9999999999999"],
    "game": "D2",
    "limit": 10
  }' | jq '.[] | {membershipId, coverage}'
```

Expected response shows different coverage levels:
```json
{
  "membershipId": "4611686018443970323",
  "coverage": {
    "level": "partial",
    "source": "compact_ids",
    "rowCount": 8525
  }
}
{
  "membershipId": "9999999999999",
  "coverage": {
    "level": "absent",
    "source": "none",
    "rowCount": 0
  }
}
```

## Bucket Hash Verification

Verify the bucket hash calculation for the test vector:

```bash
# Check server logs on startup for bucket hash type determination
# Should see: [INFO] Bucket hash type determined: VARCHAR
# Should see: Test vector mid 4611686018443970323 maps to bucket 115

# Verify the bucket directory exists (on data host):
ls -l "$COMPACT_INDEX_ROOT/mid_bucket=115/"
# Expected: instances.parquet, _COMPLETE.json
```

## Performance Testing

Measure response times for each tier:

```bash
# Tier 1 (Lite) - should be < 100ms
time curl -s "http://localhost:3001/players/{LITE_MID}/activities?limit=1000" > /dev/null

# Tier 2 (Extract) - should be < 250ms
time curl -s "http://localhost:3001/players/{EXTRACT_MID}/activities?limit=1000" > /dev/null

# Tier 3 (Compact) - should be < 250ms
time curl -s "http://localhost:3001/players/4611686018443970323/activities?limit=1000" > /dev/null

# Tier 4 (Absent) - should be < 50ms (no data)
time curl -s "http://localhost:3001/players/9999999999999/activities?limit=1000" > /dev/null
```

## Health Check

Verify the server is running and archive is available:

```bash
curl -s "http://localhost:3001/health" | jq '.'
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-09-24T22:30:00.000Z",
  "archive_available": true,
  "watermark_loaded": true
}
```

## Troubleshooting

### Archive not available
- Check that `PLAYER_ACTIVITIES_LITE_PATH`, `MID_LIGHT_EXTRACT_DIR`, or `COMPACT_INDEX_ROOT` is configured
- Verify file paths are accessible from the server
- Check server logs for initialization errors

### Bucket not found (Tier 3)
- Verify `COMPACT_INDEX_ROOT` is set
- Check that bucket directory exists: `mid_bucket=N`
- Verify `_COMPLETE.json` marker exists in bucket
- Check server logs for bucket hash calculation

### Invalid coverage level
- Verify DuckDB is installed and working
- Check server logs for bucket hash type determination
- Ensure test vector verification passed on startup
