/**
 * Static season / expansion start dates already used by the site (SeasonService).
 * Months are 1-based. Do not invent later or missing eras from these lists.
 */
export interface SeasonStartYmd {
  year: number;
  month: number;
  day: number;
  name: string;
}

/** Destiny 1 expansion/era starts. Source noted in SeasonService: Wikipedia Destiny post-release content. */
export const D1_SEASON_STARTS: readonly SeasonStartYmd[] = [
  { year: 2014, month: 9, day: 9, name: 'Destiny' },
  { year: 2014, month: 12, day: 9, name: 'The Dark Below' },
  { year: 2015, month: 5, day: 19, name: 'House of Wolves' },
  { year: 2015, month: 9, day: 15, name: 'The Taken King' },
  { year: 2016, month: 9, day: 20, name: 'Rise of Iron' },
];

/**
 * Destiny 2 season/episode starts.
 * Sources noted in SeasonService: Bungie Help, gamertweak, community wikis.
 */
export const D2_SEASON_STARTS: readonly SeasonStartYmd[] = [
  { year: 2017, month: 9, day: 6, name: 'Red War' },
  { year: 2017, month: 12, day: 5, name: 'Curse of Osiris' },
  { year: 2018, month: 5, day: 8, name: 'Warmind' },
  { year: 2018, month: 9, day: 4, name: 'Season of the Outlaw' },
  { year: 2018, month: 12, day: 4, name: 'Season of the Forge' },
  { year: 2019, month: 3, day: 5, name: 'Season of the Drifter' },
  { year: 2019, month: 6, day: 4, name: 'Season of Opulence' },
  { year: 2019, month: 10, day: 1, name: 'Season of the Undying' },
  { year: 2019, month: 12, day: 10, name: 'Season of Dawn' },
  { year: 2020, month: 3, day: 10, name: 'Season of the Worthy' },
  { year: 2020, month: 6, day: 9, name: 'Season of Arrivals' },
  { year: 2020, month: 11, day: 10, name: 'Season of the Hunt' },
  { year: 2021, month: 2, day: 9, name: 'Season of the Chosen' },
  { year: 2021, month: 5, day: 11, name: 'Season of the Splicer' },
  { year: 2021, month: 8, day: 24, name: 'Season of the Lost' },
  { year: 2022, month: 2, day: 22, name: 'Season of the Risen' },
  { year: 2022, month: 5, day: 24, name: 'Season of the Haunted' },
  { year: 2022, month: 8, day: 23, name: 'Season of Plunder' },
  { year: 2022, month: 12, day: 6, name: 'Season of the Seraph' },
  { year: 2023, month: 2, day: 28, name: 'Season of Defiance' },
  { year: 2023, month: 5, day: 23, name: 'Season of the Deep' },
  { year: 2023, month: 8, day: 22, name: 'Season of the Witch' },
  { year: 2023, month: 11, day: 28, name: 'Season of the Wish' },
  { year: 2024, month: 6, day: 11, name: 'Episode: Echoes' },
  { year: 2024, month: 10, day: 8, name: 'Episode: Revenant' },
  { year: 2025, month: 2, day: 4, name: 'Episode: Heresy' },
  { year: 2025, month: 7, day: 15, name: 'Season of Reclamation' },
  { year: 2025, month: 11, day: 2, name: 'Season of the Lawless' },
];

export function seasonStarts(game: 'D1' | 'D2'): readonly SeasonStartYmd[] {
  return game === 'D1' ? D1_SEASON_STARTS : D2_SEASON_STARTS;
}

export function compareYmd(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number }
): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Latest listed start on or before the calendar date, or null before the first start. */
export function eraNameForYmd(game: 'D1' | 'D2', year: number, month: number, day: number): string | null {
  const ymd = { year, month, day };
  const list = seasonStarts(game);
  const first = list[0];
  if (!first || compareYmd(ymd, first) < 0) return null;
  let name: string | null = null;
  for (const start of list) {
    if (compareYmd(ymd, start) >= 0) name = start.name;
    else break;
  }
  return name;
}

export interface SeasonEraRange {
  game: 'D1' | 'D2';
  name: string;
  start: SeasonStartYmd;
  /** Next listed start, exclusive. Null = last listed era (open-ended in the table). */
  endExclusive: SeasonStartYmd | null;
}

export function seasonEraRanges(game: 'D1' | 'D2'): SeasonEraRange[] {
  const list = seasonStarts(game);
  return list.map((start, i) => ({
    game,
    name: start.name,
    start,
    endExclusive: list[i + 1] ?? null,
  }));
}
