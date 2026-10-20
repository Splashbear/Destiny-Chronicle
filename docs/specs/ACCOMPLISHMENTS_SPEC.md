# Accomplishments tab — spec for Cursor

Product owner: Splashbear. Design: Chronicle Lab. Status: approved, ready to build.

Source: Chronicle Lab handoff (`ACCOMPLISHMENTS_SPEC.md`, 2026-10-20). Copied into the site repo as W63.

## Goal
Extend Destiny Chronicle from "what was I doing on this day" to "what did I accomplish". Keep it simple. Do NOT copy Braytech's layout, design or depth.

## Scope (in)
1. **Medals (D2)** — every medal the account has earned: Bungie icon, name, times earned. Group by mode (Crucible, Gambit, Strikes/Vanguard, Trials, Iron Banner, other). Hide medals with 0.
2. **Badges (D2 Collections → Badges)** — earned if ANY character on the account completed it. Otherwise show "x of y" and how many remain.
3. **Emblems (D2 Collections → Emblems)** — owned emblems only, as an icon grid with names. Hide unowned.
4. **Completed seals' triumphs (D2)** — for each seal the player has completed, list its triumphs (all complete by definition). Incomplete seals stay on the existing Titles & Seals page; don't duplicate progress trees here.
5. **D1 Record Books (D1)** — per record book: name, icon, records completed of total. Expand to show completed records.
6. **D1 medals** — if available from D1 historical stats, same format as D2 medals, in a separate D1 section.

## Scope (out)
- Armor, weapons, exotics, ships, sparrows, ghosts, shaders, ornaments.
- Full triumph trees or incomplete-triumph browsing.
- Leaderboards, rarity rankings, comparisons.
- Earn dates: Bungie does not provide them. Never display or guess them.

## Data sources (live Bungie, not the PGCR archive)
- D2 GetProfile with components: Profiles(100), Characters(200), Collectibles(800), Records(900), PresentationNodes(700), Metrics(1100) as needed.
- D2 medal counts: account historical stats (GetHistoricalStatsForAccount / GetHistoricalStats) medal groups; icons and names from the manifest (DestinyHistoricalStatsDefinition).
- Badge and emblem structure: presentation nodes under Collections in the manifest (DestinyPresentationNodeDefinition), collectible state per character (bit check: not "NotAcquired").
- Seal triumphs: Seals presentation node → children records; only for seals whose completion record is complete.
- D1: GetAdvisors / record books via the D1 platform API and D1 manifest; D1 medals from D1 account historical stats. English-only like the rest of D1.
- Merge characters: an item is owned/complete if any character (or profile-level state) has it.
- Key everything by platform + membership ID, never name.

## Honesty rules
- If the player's Bungie privacy settings hide collections or triumphs, show "Hidden by this player's privacy settings", never zero.
- Retired or renamed medals: show only what Bungie reports.
- Show a "Data from Bungie as of {timestamp}" line.

## Save / snapshot
- "Save snapshot" stores a dated JSON of IDs and counts only (medal hash → count, badge hash → x/y, owned emblem hashes, completed seal hashes, D1 record book counts). Icons and names resolve from the manifest at view time.
- Include the latest snapshot in the offline archive zip and the `.chronicle.zip` export.
- Later (not now): compare two snapshots ("since your last snapshot you earned 3 badges and 40 Rainmakers").

## UI
- One new tab: **Accomplishments**, with sections Medals, Badges, Emblems, Seal Triumphs, and a D1 section (Record Books, Medals).
- Icon grids in the full view; plain text lists in the text view (`?view=text`), same order and counts.
- Lazy-load each section; one profile call per account, cached for the session.

## Performance / lean UI (Splashbear, W63)
Keep the tab usable on weaker machines and devices. Prefer Chronicle's existing patterns over dense third-party collection UIs (e.g. Braytech medal walls with rarity %, heavy card chrome, and large always-mounted grids).

- Virtualize or paginate long medal/emblem lists; do not mount hundreds of heavy cards at once.
- Prefer simple rows or compact icon+label cells; avoid nested cards, multi-layer shadows, and decorative percentages.
- Lazy-load section bodies; defer images (manifest icons) until the section is visible; reuse cached icon URLs.
- One profile/historical-stats fetch per account per session; no per-medal network calls.
- Text view must stay cheap (plain lists, no icon DOM).
- Respect existing account tiles, D1/D2 selector, and account/platform indicators without duplicating chrome.

## Standing rules (site-wide)
- Accounts keyed by platform + membership ID; games by game + instanceId.
- Bungie-accurate. Keep account tiles, the D1/D2 selector, and account/platform indicators.
- Test D1 and D2 and the no-accounts-selected case before reporting done.

## Acceptance test
On the Splashbear accounts, spot-check against the game or another site:
- 5 medal counts, 5 badges (earned and x/y), 5 emblems, 1 completed seal's triumph list, 1 D1 record book count.
- Privacy-hidden account shows the hidden message, not zeros.
- Text view shows the same numbers.

Build order: Medals → Badges → Emblems → Seal Triumphs → D1 Record Books → snapshot save.
