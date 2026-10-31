# Trials in the Activity Breakdown: Brief for Cursor

**Goal:** show Trials as its own section in the current Activity Breakdown (the existing layout, not the engram/Iron Wolves theme). Trials is the PvP endgame, and PvP players should see it separately from general Crucible.

Source: Chronicle Lab handoff (`TRIALS_BREAKDOWN_SPEC.md`, 2026-10-27). Copied into the site repo. Acceptance account: **datto#6446** (D1 covered by unit fixtures + spot-check if present).

## Classification (from game report data only, no guessing from map or name)
Use the report's full `modes` array, falling back to `activityDetails.mode` when `modes` is missing. Key every game by game (D1/D2) + instance ID.

| Game | Bucket | Rule |
|---|---|---|
| D2 | Trials of Osiris | `modes` contains `TrialsOfOsiris` (84). This covers 2021+ Trials, including Freelance. |
| D2 | Trials of the Nine (Y1) | `modes` contains `TrialsOfTheNine` (39), `TrialsCountdown` (41) or `TrialsSurvival` (42). |
| D1 | Trials of Osiris | D1 `DestinyActivityModeType` **TrialsOfOsiris = 14** (not D2's 84; do not reuse D2 numbers). |

- **Freelance vs fireteam (D2 ToO):** split by the playlist/director activity hash. Build a small hash-to-label map from the manifest, and test every hash in it. Unknown hashes count as plain "Trials of Osiris".
- **Unknown hashes:** still count by mode; show "Unknown activity" only for the activity name.
- **One shared helper** (e.g. `classifyPvp(game, modes, hash)`) used by the site, the archive API and the Discord bot, so the numbers match everywhere.

## Display (current Activity Breakdown)
- **Trials tiles** within PvP, shown above general Crucible, with Bungie's Trials icon.
  - **Trials of Osiris** (D2 mode 84 + Freelance + D1 mode 14 / D1 playlist hashes) and **Trials of the Nine** (modes 39/41/42) are **separate tiles** — do not merge them.
- **Totals must add up:** Trials stays inside the PvP total, and the general Crucible row shows PvP minus Trials. Don't double count, and don't drop games.
- **Game scope:** Breakdown loads by membershipId **+ game** (same as Account Summary). Never load both games for a mid then hope a post-filter works — D1 and D2 often share a membershipId.
- **Expanded Trials view:**
  - Matches, W/L, win rate, kills, deaths, KD/efficiency, time played.
  - Sub-rows for Trials of Osiris (D2), Freelance, Trials of the Nine and D1 Trials, hiding any that are empty.
  - A by-weekend list (Fri–Tue reset week): date range, map, matches, W/L. Clicking a weekend lists its game reports.
  - Teammates: the top Trials teammates from the Played With data.
- **D1/D2 toggle** keeps working, and "All" combines both games but labels each game.
- **Coverage honesty:** if the account's history is only partly loaded, show "Trials through <date>", never a 0.

## What we CAN'T show (state it in the UI/docs)
- **Flawless runs, Lighthouse trips and card win counts are not in game reports.** Don't infer them from win streaks.
- You can show Bungie's own Flawless count, Trials seal and title (Flawless / Flawless[x]) as "from Bungie", but **never invent dates** for them.
- Opponents are out of scope (no nemesis or rival lists).

## Test and acceptance
1. For one veteran account (**datto#6446**), count Trials games by bucket. D1 Trials covered by fixtures (and spot-check if that account has D1 history).
2. Spot-check **5 game reports** against Bungie: one ToO, one Freelance, one Trials of the Nine, one D1 Trials and one non-Trials Crucible game. All must classify correctly.
3. Trials + other Crucible = the old PvP total for the test account (exact match).
4. Unit tests for `classifyPvp`: every bucket, an unknown hash, a missing `modes` array, D1 vs D2 mode collisions.

## Does not cover
Live or in-progress Trials cards, the Lighthouse, opponent stats, or a leaderboard.
