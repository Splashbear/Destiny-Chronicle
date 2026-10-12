# W29: usage logging, weekly summary, health checks

All of this runs inside the API process. Nothing stores IPs, user agents, referers or any other visitor data.

## Usage log
- `USAGE_LOG_DIR`: one `usage-YYYY-MM-DD.jsonl` (UTC day) per day. Each line: time, route, game, `membership_ids` looked up (parsed from `/players/:id/activities`, `?membershipId=`, batch bodies), PGCR `instance_id`, status, ms, rows, coverage.
- `USAGE_EXCLUDE_MIDS`: comma list of the owner's/smoke accounts. Excluded IDs are dropped from `membership_ids`, redacted to `:excluded` in `route`, and the line is marked `self: true` (left out of summaries).
- The server's own nightly sample lookup is tagged `self` with a per-process token.

## Retention and summaries (checked every 15 min)
- `USAGE_RETAIN_DAYS` (default 180): older `usage-*.jsonl` files are deleted. Nothing else in the folder is touched.
- `USAGE_OUT_DIR`: `weekly-YYYY-Www.json` + `.md` for the last completed ISO week (Mon-Sun UTC), written once; `SUMMARY.md` = rolling last 7 days. Both have overall counts, per-account lookups (top 100), by route/game, errors, p50/p95 ms. Point `USAGE_SUMMARY_PATH` at `SUMMARY.md` for `/admin/usage`.

## Health
- Nightly self-check at `HEALTH_CHECK_HOUR_ET` (default 4) and once 1 minute after start: `/health`, `_COMPLETE.json` count in the gap root (`HEALTH_EXPECT_COMPLETE`, default 256), compact root present, watermark parses, free disk (`HEALTH_MIN_FREE_GIB`, default 50), and a sample lookup (`HEALTH_SAMPLE_MID`, `HEALTH_SAMPLE_GAME`).
- Writes `HEALTH.json`, `HEALTH.md` and appends `HEALTH_LOG.md` in `USAGE_OUT_DIR`.
- `USAGE_MAINTENANCE=false` turns all of it off.
- Restart on crash/hang is outside the process: the boot task (restart on failure) plus `scripts/watchdog-api.ps1` (restarts when `/health` fails).
