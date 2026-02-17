import { Injectable } from '@angular/core';

/** D2 season/episode start dates. For a given date, returns the active season name. */
const SEASON_STARTS: { start: Date; name: string }[] = [
  { start: new Date(2017, 8, 6), name: 'Red War' },
  { start: new Date(2017, 11, 5), name: 'Curse of Osiris' },
  { start: new Date(2018, 4, 8), name: 'Warmind' },
  { start: new Date(2018, 8, 4), name: 'Season of the Outlaw' },
  { start: new Date(2018, 11, 4), name: 'Season of the Forge' },
  { start: new Date(2019, 2, 5), name: 'Season of the Drifter' },
  { start: new Date(2019, 5, 4), name: 'Season of Opulence' },
  { start: new Date(2019, 9, 1), name: 'Season of the Undying' },
  { start: new Date(2019, 11, 10), name: 'Season of Dawn' },
  { start: new Date(2020, 2, 10), name: 'Season of the Worthy' },
  { start: new Date(2020, 5, 9), name: 'Season of Arrivals' },
  { start: new Date(2020, 10, 10), name: 'Season of the Hunt' },
  { start: new Date(2021, 1, 9), name: 'Season of the Chosen' },
  { start: new Date(2021, 4, 11), name: 'Season of the Splicer' },
  { start: new Date(2021, 7, 24), name: 'Season of the Lost' },
  { start: new Date(2022, 1, 22), name: 'Season of the Risen' },
  { start: new Date(2022, 4, 24), name: 'Season of the Haunted' },
  { start: new Date(2022, 7, 23), name: 'Season of Plunder' },
  { start: new Date(2022, 11, 6), name: 'Season of the Seraph' },
  { start: new Date(2023, 1, 28), name: 'Season of Defiance' },
  { start: new Date(2023, 4, 23), name: 'Season of the Deep' },
  { start: new Date(2023, 7, 22), name: 'Season of the Witch' },
  { start: new Date(2023, 10, 28), name: 'Season of the Wish' },
  { start: new Date(2024, 5, 11), name: 'Episode: Echoes' },
  { start: new Date(2024, 9, 8), name: 'Episode: Revenant' },
  { start: new Date(2025, 1, 10), name: 'Episode: Heresy' },
].sort((a, b) => b.start.getTime() - a.start.getTime()); // descending so we find latest <= date

@Injectable({ providedIn: 'root' })
export class SeasonService {
  /**
   * Returns the Destiny 2 season/episode name for the given date.
   * D1 has no seasons in the same sense; returns null for pre-D2 dates.
   */
  getSeasonForDate(year: number, month: number, day: number): string | null {
    const d = new Date(year, month - 1, day);
    const ts = d.getTime();
    // D2 launched Sept 6, 2017
    if (ts < new Date(2017, 8, 6).getTime()) return null;
    for (const s of SEASON_STARTS) {
      if (ts >= s.start.getTime()) return s.name;
    }
    return null;
  }
}
