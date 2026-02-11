# Activity Breakdown Groupings – DestinyActivityModeType

The **Activity Breakdown** tab categorizes activities by the **Bungie API `DestinyActivityModeType`** enum (the numeric `activityDetails.mode` value from GetActivityHistory). Each mode maps to a section header in the breakdown view (e.g. "Raid – D1", "Dungeon – D2", "Control – D2").

**Sources:** `activityDetails.mode` from GetActivityHistory; the enum is defined in `bungie-api-ts/destiny2/interfaces.js` (DestinyActivityModeType).

**D1 vs D2:** Both games use the same mode enum. D1 activities report modes such as 2 (Story), 3 (Strike), 4 (Raid), 6 (Patrol), 16 (Nightfall), etc. The breakdown shows each mode as its own section, grouped by game (D1 / D2).

**Exclusions:** Activities whose **base name** is in `EXCLUDE_FROM_BREAKDOWN` are not shown as standalone rows. This avoids dungeon/raid *encounter* nodes (e.g. **Locus of Wailing Grief**, a Warlord's Ruin encounter) appearing as their own row.

---

## DestinyActivityModeType Reference

| Mode | Name |
|------|------|
| 0 | None |
| 2 | Story |
| 3 | Strike |
| 4 | Raid |
| 5 | AllPvP |
| 6 | Patrol |
| 7 | AllPvE |
| 10 | Control |
| 12 | Clash |
| 16 | Nightfall |
| 17 | HeroicNightfall |
| 18 | AllStrikes |
| 19 | IronBanner |
| 25 | AllMayhem |
| 31 | Supremacy |
| 37 | Survival |
| 38 | Countdown |
| 46 | ScoredNightfall |
| 47 | ScoredHeroicNightfall |
| 48 | Rumble |
| 49 | AllDoubles |
| 50 | Doubles |
| 63 | Gambit |
| 75 | GambitPrime |
| 76 | Reckoning |
| 77 | Menagerie |
| 78 | VexOffensive |
| 79 | NightmareHunt |
| 80 | Elimination |
| 81 | Momentum |
| 82 | Dungeon |
| 83 | Sundial |
| 84 | TrialsOfOsiris |
| 85 | Dares |
| 86 | Offensive |
| 87 | LostSector |
| 88 | Rift |
| 89 | ZoneControl |
| 90 | IronBannerRift |
| 91 | IronBannerZoneControl |
| 92 | Relic |

*Reserved modes (9, 11, 13, 20–22, 24, 26–30, etc.) display as `ReservedN` or `Mode N`.*

---

## Section Display Order

Sections are ordered for UX. Lower order = shown earlier:

| Order | Modes | Description |
|-------|-------|-------------|
| 0 | 4 | Raid |
| 1 | 82 | Dungeon |
| 2 | 16, 17, 46, 47 | Nightfall variants |
| 3 | 3, 18 | Strike, AllStrikes |
| 4 | 2 | Story |
| 5 | 87 | LostSector |
| 6 | 92, 85, 83, 77, 78, 86 | Relic, Dares, Sundial, Menagerie, VexOffensive, Offensive |
| 7 | 63, 75, 76, 67 | Gambit |
| 8 | PvP modes | Control, Clash, IronBanner, TrialsOfOsiris, Survival, etc. |
| 9 | 79, 80, 81, 58, 64, 66 | NightmareHunt, Elimination, Momentum, HeroicAdventure, etc. |
| 10 | 6, 7, 40 | Patrol, AllPvE, Social |
| 11 | 0 | None |
| 999 | Unknown | Mode N (displayed as "Mode {n}") |

---

## Row Sorting Within Sections

- **Story (2):** Ordered by campaign (Red War → Final Shape) via `STORY_CAMPAIGN_BY_BASE_NAME`.
- **Raid (4):** Ordered by release (VoG → Salvation's Edge for D2; VoG → Wrath for D1).
- **Dungeon (82):** Ordered by release (Shattered Throne → Equilibrium).
- **Relic (92), Dares (85), Sundial (83), Menagerie (77), etc.:** Ordered by exotic-mission release (Whisper → Starcrossed).
- **Other modes:** Alphabetically by base name, then variant.

---

## Hybrid Categorization (Name-Based Overrides)

Some activities are **pulled into dedicated sections** based on their **base name**, regardless of mode. This improves grouping (e.g. "Battlegrounds", "Story Strikes", "Exotic Story Missions", "Seasonal Arena").

| Override Section | Source modes | Detection |
|------------------|--------------|-----------|
| **Battlegrounds** | 2, 3, 18, 46, 47, 86 | `baseName.includes('battleground')` |
| **Story Strikes** | 2 | Pirate Hideout, Sever (pattern) |
| **Exotic Story Missions** | 2 | Curated list (Whisper, Zero Hour, Presage, Encore, Kell's Fall, etc.) |
| **Seasonal Arena** | 2, 16, 86 | Curated list (The Coil, Tomb of Elders, Ketchcrash, Deep Dives, etc.) |

**Order of checks:** Battlegrounds → Story Strikes → Exotic Story Missions → Seasonal Arena. First match wins. See `activity-breakdown-curated-lists.md` for full lists and test-site verification.

**Implemented in:** `activity-breakdown.service.ts` – `getSectionOverride()`, `groupRowsByType()`, `sortRowsForSection()`.

---

## Implementation

- **Service:** `activity-breakdown.service.ts`
- **Mapping:** `DESTINY_ACTIVITY_MODE_NAMES` (mode → display name)
- **Order:** `MODE_ORDER` (mode → display order)
- **Grouping:** `groupRowsByType()` groups by `row.mode` and `row.game`, then builds section labels via `modeToLabel(mode)`.
- **Overrides:** Name-based subcategorization (see `activity-breakdown-curated-lists.md`).
