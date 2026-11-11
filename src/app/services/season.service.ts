import { Injectable } from '@angular/core';
import { eraNameForYmd } from '../utils/season-starts';

@Injectable({ providedIn: 'root' })
export class SeasonService {
  /**
   * Returns the Destiny 1 or Destiny 2 season/expansion name for the given date.
   * Uses the season that was active on that date (latest start date on or before the given date).
   * Dates come from the static table in season-starts.ts (same starts previously inlined here).
   */
  getSeasonForDate(game: 'D1' | 'D2', year: number, month: number, day: number): string | null {
    return eraNameForYmd(game, year, month, day);
  }

  /**
   * Returns the season/expansion name active at mid-year (July 1) for the given game and year.
   * Used to label year boxes in the activity list (e.g. "2021 (Season of the Splicer)").
   */
  getSeasonForYear(game: 'D1' | 'D2', year: number): string | null {
    return this.getSeasonForDate(game, year, 7, 1);
  }
}
