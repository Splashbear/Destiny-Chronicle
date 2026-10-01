# Brief 5: Gap fill ↔ compact index merge design

Status: draft PR implementation (Option A). Do not enable on live `:3001` / Pages until Splashear go.

## What we have after finish

| Store | Path | Shape |
| --- | --- | --- |
| Live compact (unchanged) | `D:\DestinyChronicleDB\cl_mid_index_compact\mid_bucket=N\instances.parquet` | 3-col ID index. Missing ~11.79M..10B. |
| Gap ready (new) | `E:\DestinyChronicleDB\cl_mid_index_gap\ready\mid_bucket=N\instances.parquet` | Lean **20-column** rows for the filled range. Does not rewrite compact. |

## Option A — API reads gap dir alongside compact (this PR)

**How:** When `ENABLE_GAP_LEAN=true` and `GAP_INDEX_ROOT` is set, archive lookup unions gap lean rows with lite/extract/compact results. Dedupe by `(instance_id, membership_id, character_id)`; prefer richer lean rows. Incomplete gap buckets (`_COMPLETE.json` missing) are skipped with a note.

**Env (staging `:3002` only)**

```
PGCR_API_PORT=3002
COMPACT_INDEX_ROOT=D:\DestinyChronicleDB\cl_mid_index_compact
GAP_INDEX_ROOT=E:\DestinyChronicleDB\cl_mid_index_gap\ready
ENABLE_GAP_LEAN=true
```

Live `:3001` must leave `ENABLE_GAP_LEAN` unset/false.

**Rollback:** set `ENABLE_GAP_LEAN=false` or stop the `:3002` process.

## Option B — later

Offline rebuild into a unified tree + atomic swap. Not in this PR.

## Smoke before cutover

- Wait 256/256 ready + light validate `passed: true`
- Splashbear / KaiserHughes activity counts on `:3002` only
- Spot-check ≥10 D2 PGCRs vs Bungie
- Do not point Pages / prod client at `:3002` until Splashear says go
