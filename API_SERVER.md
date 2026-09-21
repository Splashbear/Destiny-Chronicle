# PGCR Read API

This directory contains the Destiny Chronicle PGCR (Post Game Carnage Report) read API server.

## Quick Start

See [`api-server/README.md`](./api-server/README.md) for full documentation.

### Local Setup

1. Configure environment variables:
   ```bash
   cd api-server
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build and run:
   ```bash
   npm run build
   npm start
   ```

### Archive Paths

Point the API to archive Parquet files in your `.env`:

```bash
PGCR_LEAN_ACTIVITIES_PATH=D:\DestinyChronicleDB\lean\splashbear_activities.parquet
PGCR_MEMBERSHIP_PATH=D:\DestinyChronicleDB\by_membership\splashbear.parquet
PGCR_WATERMARK_PATH=D:\DestinyChronicleDB\coverage_watermark.json
```

### API Endpoints

- `GET /health` - Health check
- `GET /api/pgcr/watermark` - Current watermark info
- `GET /api/pgcr/activities?membershipId=<id>` - All activities for membership
- `GET /api/pgcr/:instanceId` - Single activity with watermark routing

See the [full README](./api-server/README.md) for details.
