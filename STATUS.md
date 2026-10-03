# Destiny Chronicle - Cursor <-> Bot STATUS

> **Grokbot / handoff read this section first.**
> Bot owns `~/agent-tools/cursor-handoff/BOT_DECISIONS.md` (Cursor does not overwrite it).

## Current state (2026-10-03)

### Website
- **Shipped on `master`:** `a4789dc` (solo finishes UI). Live site stays on **Bungie** for now ? no archive cutover / no `ENABLE_GAP_LEAN` on `:3001`.
- D1: keep live Bungie until raw D1 PGCRs exist (D1 DECISION Oct 2).

### Gap-fill (Brief 5) - COMPLETE + light validate PASSED
- Extract + finish **DONE:** **256/256** ready, pieces empty. Live compact on D: **untouched**.
- Light validate **`passed: true`** ? 25,458,831,283 rows. Report: `D:\DestinyChronicleDB\logs\gap_fill_validate_light.json`
- Do **not** restart extract.

### Launch order (Splashear) ? from BOT_DECISIONS
1. ~~**W11** speed~~ **DONE** ? Splash **0.58s** / Kaiser **0.44s** full list; batch6 **9.45s**. Sorted gap `ready_by_mid` (buckets 50+115) + DuckDB threads + limit=100k + concurrent batch.
2. ~~**W6** social hubs~~ **DONE** on `:3002` ? default excludes mode 40 + mode-0 hub hashes. Smoke: Splash **16,683** / Kaiser **12,249** distinct; `includeSocialHubs=1` restores **21,767** / **17,534**.
3. ~~**W2** client delta fill~~ **DONE** (flag **OFF**) ? `environment.archiveBungieDeltaFill`. When ON + archive `full`: Bungie newest-first, stop at archive max iid. Partial lean still full-crawls for holes (W10).
4. **W1 PARKED** ? new 16B?17B dump incoming; do not build refresh job
5. No merge / no `:3001` gap without Splashear yes ? Bot reverify against pushed commit

### Closed blockers (this branch)
- **W3** coverage.level honesty (`full` only when D2, under limit, no W9 hole overlap/abut; D1 never full)
- **W7** force gap lean `game=D2`; skip gap when request `game=D1`
- **W8** mid=`0` documented / skipped (~245k rows in raw)
- **W9** 77,660 missing IIDs ? hole runs ? coverage partial (`api-server/data/gap_missing_iid_runs.json`)
- **W10** strip activities only for `compact_ids` partials; merged/gap keep rows labelled partial
- **W11 / W6 / W2** as above

### Option A dual-root API (draft - separate port)
- **Branch:** `cursor/brief5-option-a-gap-dual-root`
- **Staging:** `http://127.0.0.1:3002/health` ? gap lean on + `GAP_INDEX_SORTED_ROOT=...\ready_by_mid`
- Live `:3001` unchanged (`ENABLE_GAP_LEAN` off)

### Do not
- Touch live `:3001` / enable `ENABLE_GAP_LEAN` there
- Rewrite `D:\DestinyChronicleDB\cl_mid_index_compact` in place
- Run heavy `validate_gap_fill_brief5.py` as default gate
- Restart extract / parallel finish workers
- Overwrite `BOT_DECISIONS.md` (Bot appends; Cursor reads only)

### Paths
| What | Where |
|------|--------|
| Ready (gap lean) | `E:\DestinyChronicleDB\cl_mid_index_gap\ready\` |
| Sorted gap (W11) | `E:\DestinyChronicleDB\cl_mid_index_gap\ready_by_mid\` |
| Live compact (do not rewrite) | `D:\DestinyChronicleDB\cl_mid_index_compact\` |
| Light validate report | `D:\DestinyChronicleDB\logs\gap_fill_validate_light.json` |
| Finish / validate scripts | `~/agent-tools/pgcr-proof/` |
| Bot decisions | `~/agent-tools/cursor-handoff/BOT_DECISIONS.md` |

### Verification numbers (staging `:3002`)
| Check | Result |
|-------|--------|
| Windowed distinct (pre-W6 hubs) | Kaiser **17,534** / Splashbear **21,767** |
| After W6 hub filter | Kaiser **12,249** / Splashbear **16,683** |
| W11 full list cold | Kaiser **0.44s** / Splashbear **0.58s** |
| W11 batch 6 hole players | **9.45s** |
| Splash D1 | **736** rows, `partial` |
| Hole abut iid `2090141791` | `partial` + W9 note |
