# Destiny Chronicle - Cursor <-> Bot STATUS

> **Grokbot / handoff read this section first.**
> Bot owns `~/agent-tools/cursor-handoff/BOT_DECISIONS.md` (Cursor does not overwrite it).

## Current state (2026-10-03)

### Website
- **Shipped on `master`:** `a4789dc` (solo finishes UI). Live site stays on **Bungie** for now ? no archive cutover / no `ENABLE_GAP_LEAN` on `:3001`.
- D1: keep live Bungie until raw D1 PGCRs exist (D1 DECISION Oct 2).

### Gap-fill (Brief 5) - COMPLETE + light validate PASSED
- Extract + finish **DONE:** **256/256** ready, pieces empty. Live compact on D: **untouched**.
- Light validate **`passed: true`** ? 25,458,831,283 rows.

### Launch order (Splashear) ? from BOT_DECISIONS
1. ~~**W11** speed~~ **DONE**
2. ~~**W6** social hubs~~ **DONE** (incl. W13 blank social `1202765834`)
3. ~~**W2** / **W12** client delta fill~~ **DONE** (flag **OFF**)
4. **W13** report ready ? `api-server/docs/W13_MODE0_EXTRAS.md` (awaiting Splashear)
5. **W14** note only ? not a blocker
6. ~~**W15** size study~~ **DONE** ? `~/agent-tools/pgcr-proof/size_reduction/REPORT.md`
7. **W1 PARKED** ? new 16B?17B dump incoming
8. No merge / no `:3001` gap without Splashear yes

### W15 headline (estimate only; no deletes)
- Report: `~/agent-tools/pgcr-proof/size_reduction/REPORT.md` (+ `metrics.json`)
- Sample buckets 50 + 115 in scratch; live `ready/` untouched
- Best serve option: **typed light + sort (+ optional drop mid=0 / force D2)** ? **~14.3 B/row ? ~340 GiB** projected gap (vs ~664)
- With compact (~69 GiB): ~**409 GiB** total ? fits 1 TB comfortably
- Query cold: typed/sorted Splash **~0.05?0.10s** vs unsorted source **~2.9s**

### Option A dual-root API
- **Branch:** `cursor/brief5-option-a-gap-dual-root`
- Pushed tip: `6bbba5f` ? local has W12/W13 (+ STATUS) uncommitted
- Staging `:3002` gap lean on; live `:3001` unchanged

### Do not
- Touch live `:3001` / enable `ENABLE_GAP_LEAN` there
- Rewrite compact or ready in place
- Overwrite `BOT_DECISIONS.md`
