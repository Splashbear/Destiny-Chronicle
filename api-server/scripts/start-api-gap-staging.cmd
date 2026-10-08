@echo off
REM Brief 5 Option A staging API — SEPARATE port from live :3001.
REM Does not modify live _start_api.cmd. Requires api-server build (npm run build).
cd /d "%~dp0.."

set PGCR_API_PORT=3002
set PGCR_ENABLE_CORS=true
set PGCR_LOG_LEVEL=info
set PGCR_LEAN_ACTIVITIES_PATH=D:\DestinyChronicleDB\lean\splashbear_activities.parquet
set PGCR_MEMBERSHIP_PATH=D:\DestinyChronicleDB\by_membership\splashbear.parquet
set PGCR_WATERMARK_PATH=D:\DestinyChronicleDB\coverage_watermark.json
set PLAYER_ACTIVITIES_LITE_PATH=D:\DestinyChronicleDB\lean\player_activities_lite.parquet
set MID_LIGHT_EXTRACT_DIR=D:\DestinyChronicleDB\lean
set COMPACT_INDEX_ROOT=D:\DestinyChronicleDB\cl_mid_index_compact
REM W27: slim serve copy. No _COMPLETE.json markers, so relax the marker check.
set GAP_INDEX_ROOT=E:\DestinyChronicleDB\ready_slim_E
set GAP_INDEX_SORTED_ROOT=E:\DestinyChronicleDB\ready_slim_E
set ENABLE_GAP_LEAN=true
set GAP_RELAX_COMPLETE=true
REM W11 speed: DuckDB threads + one-shot full player lists + concurrent batch
set PGCR_DUCKDB_THREADS=8
set PGCR_DUCKDB_MEMORY=8GB
set PGCR_MAX_ACTIVITIES_LIMIT=100000
set PGCR_BATCH_CONCURRENCY=4

if not exist "dist\server.js" (
  echo Building api-server...
  call npm run build
)

echo Starting Option A staging API on :3002 (gap lean ON^)
node dist\server.js 1>> D:\DestinyChronicleDB\logs\pgcr_api_gap_staging.out.log 2>> D:\DestinyChronicleDB\logs\pgcr_api_gap_staging.err.log
