# Regression baselines (CODE_CLEANUP_SPEC Step 1)

Committed snapshot for Splashbear#1078 Cross Save PSN (D2 `…2437`) + Puddlecubs PSN (D1 `…4164`).

## Contents

- `splashbear-psn-puddlecubs-d1.json` — activity count, activity time (seconds), seal count, raid/dungeon firsts, Played With top 10

Accounts are keyed by `game` + `membershipId` (+ `membershipType`), never by display name.

## Commands

```bash
# Compare against committed baseline
npm run e2e:regression

# Recapture after intentional data/behavior changes
npm run e2e:regression:update
```

Headless title / Played With fetches can flake; the e2e soft-skips those fields when empty and still hard-fails on activity count, time, and firsts.
