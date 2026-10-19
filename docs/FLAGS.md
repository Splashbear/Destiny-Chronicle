# Flags

Two places hold switches: the site build, and the archive API process. Names only. No values.

## Site build

Set in the development and production environment files. A production build uses the production file. Pushing a branch that is not `master` does not change the live site.

| Flag | Development | Production | What it does |
| --- | --- | --- | --- |
| `enableD1Archive` | off | on | Destiny 1 history is read from the archive first. Live Bungie still fills games that list does not already have. |
| `enablePlayedWith` | on | on | Shows the Played With tab and calls the summary API. |
| `useArchiveActivities` | on | on | Cold start loads activities from the archive before Bungie. |
| `archiveBungieDeltaFill` | on | on | Destiny 2 catch-up from Bungie stops at the archive-complete line (10 billion) so holes above that are not skipped. Destiny 1 still walks live history. |
| `useExternalPgcr` | on | on | Report reads can go through `<API_ROOT>`. |
| `offlineMode` | off | off | Reads a prepared offline archive instead of the network. |
| `traceGuardianFirsts` | off | off | Extra console tracing while Firsts are built. |
| `debug` | off | off | Extra console logging. |
| `testMode` | off | off | Test-only behavior. |
| `mockData.enabled` | off | off | Uses mock rows instead of the network. |
| `useBungieDevProxy` | off | off | Sends Bungie calls through the local dev proxy. |

`pgcrApiRoot` is `/dc-archive` in development (the dev server strips that prefix and forwards to `<API_ROOT>`) and `<API_ROOT>` in production.

Do not turn `enableD1Archive` on in a build until a check shows Destiny 2 rows unchanged, Destiny 1 rows that exist in both sources still have their duration, and duplicate instance ids stay at zero.

Do not turn `enablePlayedWith` on until the summary API is up and a one-account request returns partners or a clear "still building" state.

## Archive API process

These are environment variable names. Empty means that tier is unused.

| Name | Default idea | Before turning it on |
| --- | --- | --- |
| `D1_INDEX_ROOT` | empty | Destiny 1 activity reads. Confirm billion 1 only, and that coverage stays partial. |
| `D1_PLAYED_WITH_ROOT` | empty | Destiny 1 Played With. The site tab does not send Destiny 1-only accounts today. |
| `ENABLE_GAP_LEAN` | off | Gap-fill lean reads. Leave off on the public API until a staging check matches expected row counts. |
| `GAP_RELAX_COMPLETE` | off | Looser "complete" coverage. Leave off unless a check shows it does not mark a hole as full. |
| `FIX_ON_VIEW_ENABLED` | off | Correct a flagged Destiny 2 report when it is opened. Needs `FLAG_LOOKUP_ROOT`. |
| `FLAG_FILTER` | `all` | `sharp` keeps a stricter subset of flagged reports. |
| `PGCR_ENABLE_CORS` | off | Browser callers need this, with `PGCR_CORS_ORIGIN` set to the site origin. |

Other names the process reads, with no switch of their own: `PGCR_API_PORT`, `PGCR_LEAN_ACTIVITIES_PATH`, `PGCR_MEMBERSHIP_PATH`, `PGCR_WATERMARK_PATH`, `PLAYER_ACTIVITIES_LITE_PATH`, `MID_LIGHT_EXTRACT_DIR`, `COMPACT_INDEX_ROOT`, `GAP_INDEX_ROOT`, `GAP_INDEX_SORTED_ROOT`, `GAP_MISSING_IID_RUNS_PATH`, `BUNGIE_API_KEY`, `BUNGIE_API_ROOT`, `FLAG_LOOKUP_ROOT`, `PGCR_OVERRIDE_STORE_ROOT`, `FIX_ON_VIEW_WAIT_MS`, `PGCR_LOG_LEVEL`, `PLAYED_WITH_LEGACY_ROOT`, `PLAYED_WITH_COMPACT_ROOT`, `PLAYED_WITH_MIN_ROOT`, `PLAYED_WITH_SUMMARY_DIR`, `PLAYED_WITH_NAME_CACHE`, `PLAYED_WITH_SPLIT_IID`, `PLAYED_WITH_COMPACT_MAX_IID`, `USAGE_LOG_DIR`, `USAGE_OUT_DIR`, `USAGE_RETAIN_DAYS`, `USAGE_EXCLUDE_MIDS`, `PGCR_RATE_PER_MIN`, `PGCR_GLOBAL_RATE_PER_MIN`.
