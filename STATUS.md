# Destiny Chronicle - Cursor <-> Bot STATUS

> **Grokbot / handoff read this section first.**
> Bot owns `~/agent-tools/cursor-handoff/BOT_DECISIONS.md` (Cursor does not overwrite it).

## Current state (2026-10-03)

### Website
- **Shipped on `master`:** `a4789dc` / PR #16 (`656e864`). Live site stays on **Bungie** for now ? no archive cutover / no `ENABLE_GAP_LEAN` on `:3001`.
- D1: keep live Bungie until raw D1 PGCRs exist (D1 DECISION Oct 2).
- **Played With UI:** `enablePlayedWith: false` (dev+prod). Not routed. Do not show at launch.

### Gap-fill (Brief 5) - COMPLETE + light validate PASSED
- Extract + finish **DONE:** **256/256** ready, pieces empty. Live compact on D: **untouched**.
- Light validate **`passed: true`** ? 25,458,831,283 rows.

### Launch order / work items
1. ~~**W11?W17**~~ mostly **DONE** (see headlines below)
2. ~~**W12** partial delta fill~~ **DONE** in client (`archiveBungieDeltaFill`, default OFF) ? lean `partial` uses newest-first stop at archive max iid when flag ON
3. **W18** Played With extract ? **RUNNING** in background (main PC)
4. **W19** ship prep without Played With ? **DONE** (docs/scripts; no `:3001` deploy)
5. **W20** hardware note ? **DONE** (in launch_prep REPORT)
6. **W21** slim rebuild ? **NOT STARTED** (wait for user go)
7. **W1 PARKED** ? 16B?17B dump incoming
8. No merge / no `:3001` gap without Splashear yes

### W18 headline (Played With extract ? background)
- Space: C 168 / D 432 / **E 1001** / F 24 GiB free ? out on **`E:\DestinyChronicleDB\played_with_index\`**
- Space report: `~/agent-tools/pgcr-proof/played_with/SPACE_REPORT.md`
- Extract: idle-priority, 1 shard at a time, resume via `status.json` + `.parquet.partial`
- Progress: see `E:\DestinyChronicleDB\played_with_index\status.json` and `~/agent-tools/pgcr-proof/played_with/EXTRACT_PROGRESS.md`
- Not wired to `:3001`/`:3002`/site. 10B+ out of scope until W1 dump.

### W19 / W20 headline (home PC ship prep)
- Report: `~/agent-tools/pgcr-proof/launch_prep/REPORT.md`
- Scripts: `api-server/scripts/home-pc.env.example`, `start-api-home.cmd`, `register-home-api-task.ps1`, `smoke-home-api.mjs`
- CORS: `PGCR_CORS_ORIGIN` allowlist support added (empty = `*` as before)
- Storage plans: **(a) 1 TB** slim+compact only; **(b) 2 TB** + Played With. Hardware-agnostic env roots.
- Scratch: 45 files already archived under `~/agent-tools/pgcr-proof/repo-scratch-archive/2026-10-03-w17/`

### W15 / W16 / W17 (prior)
- W15 size study: `~/agent-tools/pgcr-proof/size_reduction/REPORT.md` (~340 GiB slim)
- W16 plan: `~/agent-tools/pgcr-proof/played_with/REPORT.md`
- W17 on-demand timing: `~/agent-tools/pgcr-proof/played_with/ON_DEMAND_TIMING.md` (200 games ~10?16 min; full veteran hours ? prefer prebuilt)

### Option A dual-root API
- **Branch:** `cursor/brief5-option-a-gap-dual-root`
- Staging `:3002` gap lean on; live `:3001` unchanged

### Do not
- Touch live `:3001` / enable `ENABLE_GAP_LEAN` there without yes
- Rewrite compact or ready in place
- Overwrite `BOT_DECISIONS.md`
- Start W21 slim rebuild without user go
- Wire Played With into API/site before validation
