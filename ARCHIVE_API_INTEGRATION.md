# Archive API Integration for Fast Cold-Start

This document describes how to configure and use the archive player activities API integration for Destiny Chronicle.

## Overview

The archive API integration allows Destiny Chronicle to load pre-indexed player activity history from a local archive API instead of paginating through Bungie's activity history endpoints. This dramatically reduces cold-start time for accounts with extensive history and reduces pressure on Bungie's API.

## How It Works

1. **Archive API First**: When enabled, the app first attempts to fetch activity history from the archive API using the `/players/{membershipId}/activities` endpoint
2. **Light Activity Rows**: The archive API returns lightweight activity rows containing essential fields (instanceId, period, activityHash, mode, stats) without full PGCR bodies
3. **Lazy PGCR Loading**: Full PGCR data is still loaded on-demand when users click on specific activities via the existing `/pgcr/{instanceId}` endpoint
4. **Graceful Fallback**: If the archive API is unavailable or returns no data for a membership, the app falls back to the standard Bungie API pagination

## Configuration

### 1. Start the Archive API Server

The archive API should be running locally or on your network. For local testing:

```bash
# Example: Start your archive API server on port 3001
# (Actual command depends on your archive API implementation)
cd /path/to/archive-api
npm start
# or
./archive-api-server --port 3001
```

### 2. Configure Environment Settings

Edit `src/environments/environment.ts` (for development):

```typescript
export const environment = {
  // ... other settings ...
  
  // Point to your archive API
  pgcrApiRoot: 'http://localhost:3001',
  pgcrApiKey: '',  // Optional: Add API key if required
  
  // Enable external PGCR API (required for archive API to work)
  useExternalPgcr: true,
  
  // Enable archive activities integration
  useArchiveActivities: true,
  
  // ... rest of config ...
};
```

For production (`environment.prod.ts`), use your production archive API URL:

```typescript
pgcrApiRoot: 'https://archive-host.example.com',
```

### 3. Build and Run

```bash
npm run build
npm start
# or for development
ng serve
```

## Archive API Endpoints

The integration expects the following endpoints from your archive API:

### GET /players/:membershipId/activities

Fetch archived activities for a single player.

**Query Parameters:**
- `game` (optional): Filter by game (`D1` or `D2`)
- `from` (optional): ISO date string for start of range
- `to` (optional): ISO date string for end of range
- `limit` (optional): Maximum number of activities to return

**Response:**
```json
{
  "membershipId": "4611686018465122437",
  "coverage": {
    "source": "local-archive",
    "rowCount": 5432,
    "minPeriod": "2014-09-09T12:00:00Z",
    "maxPeriod": "2024-12-31T23:59:59Z",
    "watermarkNote": "Complete through 2024-12-31"
  },
  "activities": [
    {
      "instanceId": "123456789",
      "period": "2024-12-20T15:30:00Z",
      "activityHash": "1234567890",
      "mode": 4,
      "membershipId": "4611686018465122437",
      "membershipType": 2,
      "characterId": "2305843009265042360",
      "completed": 1,
      "deaths": 5,
      "kills": 125,
      "assists": 23,
      "durationSeconds": 1800,
      "game": "D2",
      "displayName": "Splashbear"
    }
    // ... more activities
  ]
}
```

### POST /players/activities/batch

Batch fetch activities for multiple players (more efficient for multi-account loading).

**Request Body:**
```json
{
  "membershipIds": ["4611686018465122437", "4611686018467890123"]
}
```

**Response:**
```json
{
  "4611686018465122437": {
    "membershipId": "4611686018465122437",
    "coverage": { /* ... */ },
    "activities": [ /* ... */ ]
  },
  "4611686018467890123": {
    "membershipId": "4611686018467890123",
    "coverage": { /* ... */ },
    "activities": [ /* ... */ ]
  }
}
```

## Testing

### Test with Known Account

To verify the integration works:

1. Ensure your archive API has data for test account (e.g., Splashbear PSN mid: `4611686018465122437`)
2. Configure `environment.ts` as described above
3. Start the Angular dev server: `ng serve`
4. Search for and select the test account
5. Check browser console for `[Archive]` log messages indicating archive API usage
6. Verify that activity loading is much faster than Bungie pagination
7. Confirm activities display correctly in the Activities tab

### Expected Console Output

When archive API is working:
```
[Archive] Found 5432 archived activities for 4611686018465122437 (D2): { coverage: {...}, characterId: "..." }
[Archive] Stored 1234 new activities from archive for character 2305843009265042360
```

When falling back to Bungie:
```
[Archive] Failed to load from archive API for 4611686018465122437, falling back to Bungie: Error: ...
```

## Performance Impact

**Before (Bungie Pagination):**
- ~250 activities per API request
- ~20-40 requests for accounts with 5000+ activities
- 30-60 seconds cold-start time
- Rate limited by Bungie API throttling

**After (Archive API):**
- Single batch request loads all archived activities
- ~2-5 seconds cold-start time
- No Bungie API calls for under-watermark history
- Full PGCR data still lazy-loaded on click

## Troubleshooting

### Archive API Not Being Called

1. Verify `useExternalPgcr` is `true` (required)
2. Verify `useArchiveActivities` is `true`
3. Verify `pgcrApiRoot` is set correctly
4. Check browser console for connection errors
5. Ensure archive API is running and accessible

### Empty Activities List

1. Check that archive API returns `coverage.rowCount > 0`
2. Verify `activities` array contains items for the requested `characterId`
3. Check browser console for `[Archive]` debug messages (enable `debug: true` in environment)
4. Verify light activity rows have valid `instanceId`, `period`, and `activityHash`

### Activities Not Displaying

1. Check that light activity rows are being converted correctly (see console logs)
2. Verify date filtering matches your test date
3. Ensure `game` field is set correctly (`D1` or `D2`)
4. Check IndexedDB in browser DevTools to see if activities were stored

## Security Notes

- The archive API should **NOT** be exposed to the public internet without authentication
- For local development, `http://localhost:3001` is safe
- For production deployments, use HTTPS and implement proper authentication via `pgcrApiKey`
- Never commit real API keys or production URLs to version control

## Future Enhancements

- Support for watermark-aware loading (fetch archive up to watermark, then paginate Bungie for recent activities)
- Parallel batch fetching for multiple selected accounts
- Archive coverage indicators in UI
- Archive sync status and last-updated timestamps
