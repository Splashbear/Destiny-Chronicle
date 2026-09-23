# Destiny Chronicle PGCR Read API

A lightweight API server that provides read access to Destiny Chronicle's archived PGCR (Post Game Carnage Report) data with automatic fallback to live Bungie API.

## Features

- **Watermark-based routing**: Automatically routes requests to archived data (below watermark) or live Bungie API (above watermark)
- **Lean activity format**: Returns standardized, minimal activity data structure
- **Player activities API**: Fast cold-start queries for player activity lists with filtering (game, date range, limit)
- **Batch queries**: Fetch activities for multiple players in a single request (up to 20 players)
- **Membership lookup**: Query all activities for a specific membership ID
- **Instance lookup**: Get individual activity details by instance ID
- **Configurable paths**: Point to Parquet archive files via environment variables

## API Endpoints

### Player Activities (Cold-Start Optimized)

#### `GET /players/:membershipId/activities`
Get activities for a player with optional filtering. Optimized for fast cold-start queries.

**Query Parameters:**
- `game` (optional): Filter by game (`D1` or `D2`)
- `from` (optional): ISO 8601 start date (e.g., `2021-01-01T00:00:00Z`)
- `to` (optional): ISO 8601 end date
- `limit` (optional): Maximum results (default: 1000, max: 10000)

**Response:**
```json
{
  "membershipId": "4611686018465122437",
  "coverage": {
    "source": "archive",
    "rowCount": 7501,
    "minPeriod": "2017-09-06T17:45:00Z",
    "maxPeriod": "2024-12-31T23:59:00Z",
    "watermarkNote": "Archive contains activities up to instance ID 15999999999"
  },
  "activities": [
    {
      "instanceId": "12345678901",
      "period": "2021-04-23T19:30:00Z",
      "activityHash": 123456,
      "mode": 4,
      "membershipId": "4611686018465122437",
      "membershipType": 2,
      "characterId": "2305843009504575107",
      "completed": true,
      "deaths": 5,
      "kills": 150,
      "assists": 20,
      "durationSeconds": 1800,
      "game": "D2",
      "displayName": "Guardian"
    }
  ]
}
```

#### `POST /players/activities/batch`
Get activities for multiple players in a single request.

**Request Body:**
```json
{
  "membershipIds": ["4611686018465122437", "4611686018488107374"],
  "game": "D2",
  "from": "2021-01-01T00:00:00Z",
  "to": "2021-12-31T23:59:59Z",
  "limit": 1000
}
```

**Response:**
```json
{
  "4611686018465122437": {
    "membershipId": "4611686018465122437",
    "coverage": { ... },
    "activities": [ ... ]
  },
  "4611686018488107374": {
    "membershipId": "4611686018488107374",
    "coverage": { ... },
    "activities": [ ... ]
  }
}
```

**Limits:**
- Maximum 20 membership IDs per batch request
- Each player query respects the same filtering and limit options

### Admin/Debug Endpoints

### `GET /health`
Health check endpoint showing server status and archive availability.

### `GET /api/pgcr/watermark`
Returns current coverage watermark information.

### `GET /api/pgcr/activities?membershipId=<membershipId>`
Get all archived activities for a membership ID.

**Query Parameters:**
- `membershipId` (required): The Bungie membership ID

**Response:**
```json
{
  "membership_id": "4611686018488107374",
  "activities": [...],
  "source": "archive",
  "count": 7387
}
```

### `GET /api/pgcr/:instanceId`
Get a specific activity by instance ID. Uses watermark routing:
- Instance ID ≤ watermark → archive lookup
- Instance ID > watermark → live Bungie API

**Response:**
```json
{
  "instance_id": "12345678901",
  "activity": {
    "instance_id": "12345678901",
    "period": "2021-04-23T19:30:00Z",
    "activity_hash": 123456,
    "membership_id": "4611686018488107374",
    "display_name": "Guardian",
    "kills": 150,
    "deaths": 5,
    ...
  },
  "source": "archive"
}
```

## Setup

### Prerequisites

- Node.js 18+
- TypeScript
- Access to Parquet archive files (for archive functionality)

### Installation

```bash
cd api-server
npm install
```

### Configuration

Create a `.env` file in the `api-server` directory:

```bash
# Server configuration
PGCR_API_PORT=3001
PGCR_ENABLE_CORS=true
PGCR_LOG_LEVEL=info

# Archive Parquet paths
# Point these to your local paths or network share
PGCR_LEAN_ACTIVITIES_PATH=D:\DestinyChronicleDB\lean\splashbear_activities.parquet
PGCR_MEMBERSHIP_PATH=D:\DestinyChronicleDB\by_membership\splashbear.parquet
PGCR_WATERMARK_PATH=D:\DestinyChronicleDB\coverage_watermark.json

# Player activities lite path (optional, defaults to PGCR_LEAN_ACTIVITIES_PATH)
# Use for lightweight parquet files optimized for cold-start queries
# PLAYER_ACTIVITIES_LITE_PATH=D:\DestinyChronicleDB\lean\player_activities_lite_6acct.parquet

# Bungie API (for live fallback)
BUNGIE_API_KEY=your_bungie_api_key_here
BUNGIE_API_ROOT=https://www.bungie.net/Platform
```

### Pointing to Archive Files

If running on a different machine with access to the archive host via network share:

**Windows (mapped drive):**
```bash
PGCR_LEAN_ACTIVITIES_PATH=Z:\DestinyChronicleDB\lean\splashbear_activities.parquet
PLAYER_ACTIVITIES_LITE_PATH=Z:\DestinyChronicleDB\lean\player_activities_lite_6acct.parquet
PGCR_MEMBERSHIP_PATH=Z:\DestinyChronicleDB\by_membership\splashbear.parquet
PGCR_WATERMARK_PATH=Z:\DestinyChronicleDB\coverage_watermark.json
```

**Windows (UNC path):**
```bash
PGCR_LEAN_ACTIVITIES_PATH=\\ARCHIVE-HOST\DestinyChronicleDB\lean\splashbear_activities.parquet
PLAYER_ACTIVITIES_LITE_PATH=\\ARCHIVE-HOST\DestinyChronicleDB\lean\player_activities_lite_6acct.parquet
PGCR_MEMBERSHIP_PATH=\\ARCHIVE-HOST\DestinyChronicleDB\by_membership\splashbear.parquet
PGCR_WATERMARK_PATH=\\ARCHIVE-HOST\DestinyChronicleDB\coverage_watermark.json
```

**Linux/Mac (mounted share):**
```bash
PGCR_LEAN_ACTIVITIES_PATH=/mnt/archive-host/DestinyChronicleDB/lean/splashbear_activities.parquet
PLAYER_ACTIVITIES_LITE_PATH=/mnt/archive-host/DestinyChronicleDB/lean/player_activities_lite_6acct.parquet
PGCR_MEMBERSHIP_PATH=/mnt/archive-host/DestinyChronicleDB/by_membership/splashbear.parquet
PGCR_WATERMARK_PATH=/mnt/archive-host/DestinyChronicleDB/coverage_watermark.json
```

### Running the Server

**Build:**
```bash
npm run build
```

**Start:**
```bash
npm start
```

**Development (rebuild and start):**
```bash
npm run dev
```

The server will start on `http://localhost:3001` (or the port specified in your `.env`).

## Testing Locally

### Without Archive (Live Bungie API only)

If you don't have access to the Parquet files, the server will still work using only the live Bungie API:

1. Comment out or remove the archive paths from `.env`
2. Keep only `BUNGIE_API_KEY` and `BUNGIE_API_ROOT`
3. The server will fetch all requests from live Bungie API

### With Mock Data

For testing, you can create minimal test fixtures:

**Create `coverage_watermark.json`:**
```json
{
  "max_instance_id": "15999999999",
  "as_of": "2026-09-17T00:00:00Z",
  "dump_id": "d2-pgcr-archive-v1"
}
```

See `api-server/src/__tests__/fixtures/` for example test data.

## Architecture

```
┌─────────────────┐
│  Client Request │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PGCR Router    │  (static routes BEFORE param routes)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Watermark Check │──────► Instance ID ≤ max_instance_id?
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  YES        NO
    │         │
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ Archive │ │  Bungie API  │
│ Service │ │   Service    │
│ (DuckDB)│ │              │
└─────────┘ └──────────────┘
    │              │
    └──────┬───────┘
           │
           ▼
    ┌─────────────┐
    │   Response  │
    └─────────────┘
```

## Key Implementation Details

### DuckDB for Parquet Reading

The server uses **DuckDB** (via `duckdb-async`) to read Parquet files instead of `parquetjs`. This is critical because:
- DuckDB can read ZSTD-compressed Parquet files written by DuckDB
- Supports efficient SQL filtering on large files
- Works reliably with Parquet exports

### Route Registration Order

Routes are registered in this specific order to avoid conflicts:
1. `GET /api/pgcr/watermark` (static)
2. `GET /api/pgcr/activities` (static with query params)
3. `GET /api/pgcr/:instanceId` (parameterized - MUST be last)

### Membership Query

The `/activities` endpoint queries the **lean activities** Parquet file directly by `membership_id`, not the separate membership mapping file. This returns all activity entries (which may be multiple per instance if there are multiple players).

## Lean Activity Schema

The API returns activities in a standardized "lean" format:

```typescript
interface LeanActivity {
  instance_id: string;
  period: string;                    // ISO 8601 timestamp
  activity_hash: number;             // Bungie activity definition hash
  director_activity_hash: number;
  mode: number;                      // Activity mode (PvE, PvP, etc.)
  membership_id: string;
  membership_type: number;
  display_name: string;
  character_id: string;
  completed: boolean;
  deaths: number;
  kills: number;
  assists: number;
  duration_seconds: number;
  standing: number;
  starting_phase_index: number;
  fireteam_id: string;
  is_private: boolean;
  dump_id: string;
  game: 'D1' | 'D2';
}
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PGCR_API_PORT` | No | `3001` | Server port |
| `PGCR_LEAN_ACTIVITIES_PATH` | No | - | Path to lean activities Parquet file |
| `PLAYER_ACTIVITIES_LITE_PATH` | No | Falls back to `PGCR_LEAN_ACTIVITIES_PATH` | Path to lite activities Parquet (optimized for cold-start) |
| `PGCR_MEMBERSHIP_PATH` | No | - | Path to membership Parquet file (currently unused) |
| `PGCR_WATERMARK_PATH` | No | - | Path to watermark JSON file |
| `BUNGIE_API_KEY` | **Yes** (unless archive configured) | - | Bungie API key for live fallback |
| `BUNGIE_API_ROOT` | No | `https://www.bungie.net/Platform` | Bungie API root URL |
| `PGCR_ENABLE_CORS` | No | `false` | Enable CORS headers |
| `PGCR_LOG_LEVEL` | No | `info` | Logging level: `debug`, `info`, `warn`, `error` |

## Troubleshooting

### "Archive not available"
- Verify Parquet file paths are correct and accessible
- Check file permissions
- For network shares, ensure the share is mounted and accessible
- DuckDB must be able to read the Parquet files (ZSTD compression is supported)

### "Watermark not available"
- Verify `PGCR_WATERMARK_PATH` points to a valid JSON file
- Check the watermark file format matches the expected schema

### Route ordering issues
- If `/api/pgcr/watermark` returns "Invalid instance ID", the routes are registered in the wrong order
- Static routes MUST be registered before parameterized routes

### Slow queries
- DuckDB with SQL filtering is much faster than sequential scans
- Large result sets (thousands of activities) may take a few seconds
- Consider adding indexes if performance is critical

### "Invalid ENUM value" or Parquet read errors
- The server requires DuckDB-readable Parquet files
- If you're using older Parquet exports, re-export with DuckDB or use SNAPPY/uncompressed format
- `parquetjs` is not used and may not be compatible with all Parquet flavors

## Cold-Start Optimization

The `/players/:membershipId/activities` endpoints are designed for fast cold-start queries to support the ≤60-second cold-load goal for ~6 accounts:

1. **Lite Parquet Files**: Use `PLAYER_ACTIVITIES_LITE_PATH` to point to a lightweight parquet file with only essential columns
2. **DuckDB SQL Filtering**: Efficient filtering by membership_id, game, and date range
3. **Batch Support**: Fetch up to 20 players in one request to minimize round trips
4. **Sensible Limits**: Default 1000 activities per player (max 10000) to balance completeness and speed

For the test dataset (`player_activities_lite_6acct.parquet`), queries return sub-second for typical use cases.

## Future Enhancements

- [ ] Use hash-partitioned membership lookups for better performance
- [x] Batch membership queries (implemented)
- [ ] Response caching
- [ ] Fireteam co-play queries (stretch goal)
- [ ] Connection pooling for DuckDB

## Known Limitations

- Membership query returns all activity entries (may be multiple rows per instance)
- `PGCR_MEMBERSHIP_PATH` is currently unused (queries lean activities directly)
- Large result sets may take a few seconds to return
- Archive reads require DuckDB-compatible Parquet files
- Player activities endpoints are archive-only (no live Bungie API fallback)

## License

ISC
