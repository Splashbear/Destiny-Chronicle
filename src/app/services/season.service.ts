import { Injectable } from '@angular/core';

/**
 * Destiny 1 expansion/era start dates (post-release content).
 * Source: https://en.wikipedia.org/wiki/Destiny_post-release_content
 * D1 launched Sept 9, 2014; last content Rise of Iron (Sept 20, 2016).
 */
const D1_STARTS: { start: Date; name: string }[] = [
  { start: new Date(2014, 8, 9), name: 'Destiny' },
  { start: new Date(2014, 11, 9), name: 'The Dark Below' },
  { start: new Date(2015, 4, 19), name: 'House of Wolves' },
  { start: new Date(2015, 8, 15), name: 'The Taken King' },
  { start: new Date(2016, 8, 20), name: 'Rise of Iron' },
].sort((a, b) => b.start.getTime() - a.start.getTime());

/**
 * Destiny 2 season/episode start dates.
 * Sources: Bungie Help (Years of Destiny), gamertweak, community wikis.
 * Season that was active on a given date (not "current" season).
 */
const D2_STARTS: { start: Date; name: string }[] = [
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
  { start: new Date(2025, 6, 15), name: 'The Edge of Fate' },
].sort((a, b) => b.start.getTime() - a.start.getTime());

@Injectable({ providedIn: 'root' })
export class SeasonService {
  /**
   * Returns the Destiny 1 or Destiny 2 season/expansion name for the given date.
   * Uses the season that was active on that date (latest start date on or before the given date).
   */
  getSeasonForDate(game: 'D1' | 'D2', year: number, month: number, day: number): string | null {
    const d = new Date(year, month - 1, day);
    const ts = d.getTime();
    const list = game === 'D1' ? D1_STARTS : D2_STARTS;
    if (game === 'D1') {
      if (ts < D1_STARTS[D1_STARTS.length - 1].start.getTime()) return null;
    } else {
      if (ts < new Date(2017, 8, 6).getTime()) return null;
    }
    for (const s of list) {
      if (ts >= s.start.getTime()) return s.name;
    }
    return null;
  }

  /**
   * Returns the season/expansion name active at mid-year (July 1) for the given game and year.
   * Used to label year boxes in the activity list (e.g. "2021 (Season of the Splicer)").
   */
  getSeasonForYear(game: 'D1' | 'D2', year: number): string | null {
    return this.getSeasonForDate(game, year, 7, 1);
  }
}
