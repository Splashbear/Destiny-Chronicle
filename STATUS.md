# Destiny Chronicle - Cursor <-> Bot STATUS

> **Grokbot / handoff read this section first.**
> Bot owns `~/agent-tools/cursor-handoff/BOT_DECISIONS.md` (Cursor does not overwrite it).

## Current state (2026-10-08 ~00:10 ET)

### Website
- **Shipped on `master`:** see latest merge (W26 favorites/First Ever fix shipping). Live site stays on **Bungie** for now — no archive cutover / no `ENABLE_GAP_LEAN` on `:3001`.
- D1: keep live Bungie until raw D1 PGCRs exist (D1 DECISION Oct 2).
- **Played With UI:** `enablePlayedWith: false` (dev+prod). Not routed. Do not show at launch.

### W26 headline (6-account favorites + First Ever)
- **Root cause (accounts):** `0a69190` load-token guards + mid-sync `loadAllFilteredActivities` bumping `currentLoadToken` cancelled queued favorites after the first 1–2 finished.
- **Root cause (First Ever empty while story firsts show):** cold-start (`b754b2f`) removed D1 force-backfill and left First Ever on a separate IDB scan; story milestones still populate from `getFirstCompletions`.
- **Fix:** derive First Ever from already-loaded Guardian Firsts (prefer A Guardian Rises / Homecoming), with IDB scan as fallback only. Also: load-token / game-scoped character keys from prior W26 ship.
- **Deploy:** user approved ship to live GitHub Pages.

### Gap-fill (Brief 5) - COMPLETE + light validate PASSED
- Extract + finish **DONE:** **256/256** ready, pieces empty. Live compact on D: **untouched**.
- Light validate **`passed: true`** ? 25,458,831,283 rows.

### Launch order / work items
1. ~~**W11?W17**~~ mostly **DONE** (see headlines below)
2. ~~**W12** partial delta fill~~ **DONE** in client (`archiveBungieDeltaFill`, default OFF) ? lean `partial` uses newest-first stop at archive max iid when flag ON
3. **W18** Played With raw extract — **STOPPED** (Oct 3). Replaced by W22, then deferred to W1 by W23. Feature stays off.
4. **W19** ship prep without Played With ? **DONE** (docs/scripts; no `:3001` deploy)
5. **W20** hardware note ? **DONE** (in launch_prep REPORT)
6. **W21** slim rebuild — buckets **COMPLETE**; range coverage **partial** (see W21 headline). Not fully verified until Splashbear/Kaiser spot checks.
7. **W1 PARKED** ? 16B?17B dump incoming
8. No merge / no `:3001` gap without Splashear yes

### W18 headline (Played With raw extract)
- **STOPPED** Oct 3 when W22 replaced the raw re-scan. W23 (Oct 5) then deferred the long-term Played With build to W1. `enablePlayedWith` stays false.
- Do not treat `played_with_index` as a live job.

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

### W21 headline (slim serve copy — variant E)
- Build **COMPLETE** `E_typed_light_sorted` → `<data-drive>\DestinyChronicleDB\ready_slim_E` (finished 2026-10-08 00:07 ET)
- **256/256** buckets, validate ok/fail **256/0**, **25,458,831,283** rows, **342.69 GiB**, ~14.45 B/row
- Range **11.79M..10B is partial**: **77,660** missing instance IDs in **2,313** runs. Same hole set as the 2026-10-02 source scan (row total matches; slim was not DISTINCT-scanned again). The 40 largest runs cover 75,387 of those IDs; the other 2,273 runs are single IDs. Sampled holes are absent in raw and Bungie 404 (never existed or purged).
- List: `%USERPROFILE%\agent-tools\pgcr-proof\size_reduction\W21_COVERAGE.md`
- Splashbear/Kaiser spot checks against the slim files are still open. Source `ready/` untouched. Not wired to `:3001`.

### W25 headline (D1 PGCR backup)
- **DONE** 2026-10-06. Out: `<data-drive>\DestinyChronicleDB\d1_pgcr_raw`
- **8,344 / 8,344** files, validate `passed: true`, missing 0, parse fails 0, ~12.7 MiB
- Source list: `<data-drive>\DestinyChronicleDB\lean\cl_patch_d1_activity_history_w25.parquet`
- Log: `%USERPROFILE%\agent-tools\pgcr-proof\d1_backup\w25_pgcr_backup.log`
- This is the dumped-account D1 PGCR backup only. Live site D1 still comes from Bungie (D1 DECISION Oct 2).

