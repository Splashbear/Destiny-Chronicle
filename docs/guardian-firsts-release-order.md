# Guardian Firsts – Raid & Dungeon Release Order

This document defines the **release order** used to sort raid and dungeon cards in the **Guardian Firsts** tab (newest first). The same order is used in `player-search.component.ts` and `activity-breakdown.service.ts`.

Display order is **most recently released → oldest**. In code, arrays are stored **oldest → newest** (index 0 = oldest); sorting uses `index(b) - index(a)` so newest (highest index) appears first.

---

## Destiny 1 Raids (oldest → newest)

| Order | Activity        | Release (reference) |
|-------|-----------------|--------------------|
| 1     | Vault of Glass  | 2014-09-16         |
| 2     | Crota's End     | 2014-12-09         |
| 3     | King's Fall     | 2015-09-18         |
| 4     | Wrath of the Machine | 2016-09-23 |

---

## Destiny 2 Raids (oldest → newest)

| Order | Activity                    | Release (reference) |
|-------|-----------------------------|---------------------|
| 1     | Leviathan                   | 2017-09-13          |
| 2     | Leviathan, Eater of Worlds  | 2017-12-05          |
| 3     | Leviathan, Spire of Stars   | 2017-12-05          |
| 4     | Last Wish                   | 2018-09-14          |
| 5     | Scourge of the Past         | 2018-12-07          |
| 6     | Crown of Sorrow             | 2019-06-04          |
| 7     | Garden of Salvation         | 2019-10-05          |
| 8     | Deep Stone Crypt            | 2020-11-21          |
| 9     | Vault of Glass (D2)         | 2021-05-22          |
| 10    | Vow of the Disciple        | 2022-03-05          |
| 11    | King's Fall (D2)           | 2022-08-26          |
| 12    | Root of Nightmares         | 2023-03-10          |
| 13    | Crota's End (D2)           | 2023-09-01          |
| 14    | Salvation's Edge           | 2024-06-07          |
| 15    | The Desert Perpetual       | (future)            |

**Note:** Display names in Guardian Firsts use `Vault of Glass` and `King's Fall` for D2 (no “(D2)” suffix in the card title); the list above matches `getBaseActivityName()` / manifest names where needed.

---

## Destiny 2 Dungeons (oldest → newest)

| Order | Activity            | Release (reference) |
|-------|---------------------|---------------------|
| 1     | The Shattered Throne | 2018-09-25         |
| 2     | Pit of Heresy       | 2019-10-29          |
| 3     | Prophecy            | 2020-06-09          |
| 4     | Grasp of Avarice    | 2021-12-07          |
| 5     | Duality             | 2022-05-27          |
| 6     | Spire of the Watcher | 2022-12-09        |
| 7     | Ghosts of the Deep  | 2023-05-26          |
| 8     | Warlord's Ruin      | 2023-12-01          |
| 9     | Vesper's Host       | 2024-10-01          |
| 10    | Sundered Doctrine   | 2024-02-07          |
| 11    | Equilibrium         | (see manifest/script) |

---

## The Pantheon (newest first in UI)

Display order: **Nezarec Sublime → Rhulk Indomitable → Oryx Exalted → Atraks Sovereign**.

- The Pantheon: Nezarec Sublime  
- The Pantheon: Rhulk Indomitable  
- The Pantheon: Oryx Exalted  
- The Pantheon: Atraks Sovereign  

---

## Code references

- **Guardian Firsts ordering:**  
  `src/app/components/player-search/player-search.component.ts`  
  - `D1_RAID_RELEASE_ORDER`, `D2_RAID_RELEASE_ORDER`, `D2_DUNGEON_RELEASE_ORDER`  
  - `sortGroupsByReleaseOrder()`  
  - `sortPantheonRaids()` / `sortPantheonGroupsByReleaseOrder()`
- **Activity breakdown ordering:**  
  `src/app/services/activity-breakdown.service.ts`  
  - `RAID_RELEASE_ORDER_D1`, `RAID_RELEASE_ORDER_D2`, `DUNGEON_RELEASE_ORDER` (lowercase for name matching)
- **Release dates (for display/reference):**  
  `src/app/models/activity-release-dates.ts` – `ACTIVITY_RELEASE_DATES`

When adding a new raid or dungeon, add it to the appropriate array in both the component and the breakdown service (and to `ACTIVITY_RELEASE_DATES` if you have a date), and update this doc.
