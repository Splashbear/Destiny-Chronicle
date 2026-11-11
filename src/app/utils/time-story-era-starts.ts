/**
 * Time Story era start dates. Kept separate from SeasonService / season-starts.ts
 * so other site season labels are unchanged.
 *
 * Months are 1-based. Do not invent later eras; see TIME_STORY_ERA_COVERAGE.
 *
 * Sources (official Bungie pages unless noted):
 * - D1 vanilla through Rise of Iron: the dates already used by SeasonService
 *   (noted there as Wikipedia "Destiny post-release content").
 * - Age of Triumph, 2017-03-28, 10:00 AM Pacific: This Week at Bungie, 2017-03-23
 *   https://www.bungie.net/7/en/News/article/45776/7_This-Week-at-Bungie--03232017
 * - D2 through Season of the Wish: the calendar dates already used by SeasonService.
 *   On expansion launch days, Time Story uses the expansion name to match the
 *   spec example "Forsaken · Last Wish · 140h":
 *   Forsaken 2018-09-04, Shadowkeep 2019-10-01, Beyond Light 2020-11-10,
 *   Witch Queen 2022-02-22, Lightfall 2023-02-28.
 * - Into the Light, 2024-04-09: Bungie Help and press; Bungie.net recap the same day
 *   https://help.bungie.net/hc/en-us/articles/24175204478100-Destiny-2-Into-The-Light
 *   https://press.bungie.com/Bungie-Announces-Details-on-Destiny-2-Into-the-Light-Upcoming-Two-Mont
 * - The Final Shape, 2024-06-04: Bungie Press Room, "Launches Worldwide"
 *   https://press.bungie.com/Destiny-2-The-Final-Shape-Launches-Worldwide
 * - Episode: Echoes, 2024-06-11 (ends 2024-10-08 at weekly reset): Bungie Help
 *   https://help.bungie.net/hc/en-us/articles/26202951671828-Destiny-2-Episode-Echoes
 * - Episode: Revenant, 2024-10-08: Bungie Press Room, Revenant Act I launches today
 *   https://press.bungie.com/Destiny-2-Revenant-Act-I-Launches-Today
 * - Episode: Heresy, 2025-02-04: Bungie Press Room, Heresy Act I launches today
 *   https://press.bungie.com/Destiny-2-Heresy-Act-I-Launches-Today
 * - Rite of the Nine, 2025-05-06: Bungie Press Room, Year of Prophecy roadmap
 *   https://press.bungie.com/D-estiny-2-The-Fate-Saga-Revealed-Year-of-Prophecy-and-Core-Game-Updat
 * - The Edge of Fate, 2025-07-15: same roadmap; TWID 2025-07-17 notes that
 *   Season: Reclamation started the same day. Time Story uses the expansion name.
 *   https://www.bungie.net/7/en/News/Article/twid_07_17_2025
 * - Ash & Iron, 2025-09-09: Year of Prophecy roadmap and TWID 2025-07-17
 * - Renegades, 2025-12-02: Bungie Press Room launch post. The Renegades Launch Blog
 *   and TWID 2025-07-17 also start Season: Lawless on this day. Time Story uses
 *   the expansion name. The previous SeasonService table's "Season of the Lawless"
 *   on 2025-11-02 was unverified and is not used here.
 *   https://press.bungie.com/Destiny-2-Renegades-a-Star-Wars--Inspired-Expansion-Launches-Today
 *   https://www.bungie.net/7/en/News/Article/renegades_launch_blog
 * - Monument of Triumph, 2026-06-09: Bungie.net, "Monument of Triumph is Live"
 *   https://www.bungie.net/7/en-us/News/Article/monument_of_triumph_is_live
 *   Announced earlier as Shadow & Order on 2026-03-03; delayed and renamed
 *   (TWID 2026-02-19). The 2026-03-03 date is not an era start.
 *
 * Rite of the Nine, Ash & Iron, and Monument of Triumph are official named
 * content beats (event / major updates) in the Year of Prophecy structure.
 * They are included so activity in those windows is not absorbed into the
 * previous era under a less specific name.
 */

import { compareYmd, type SeasonStartYmd } from './season-starts';

export type TimeStoryEraStartYmd = SeasonStartYmd;

export const TIME_STORY_D1_ERA_STARTS: readonly TimeStoryEraStartYmd[] = [
  { year: 2014, month: 9, day: 9, name: 'Destiny' },
  { year: 2014, month: 12, day: 9, name: 'The Dark Below' },
  { year: 2015, month: 5, day: 19, name: 'House of Wolves' },
  { year: 2015, month: 9, day: 15, name: 'The Taken King' },
  { year: 2016, month: 9, day: 20, name: 'Rise of Iron' },
  { year: 2017, month: 3, day: 28, name: 'Age of Triumph' },
];

export const TIME_STORY_D2_ERA_STARTS: readonly TimeStoryEraStartYmd[] = [
  { year: 2017, month: 9, day: 6, name: 'Red War' },
  { year: 2017, month: 12, day: 5, name: 'Curse of Osiris' },
  { year: 2018, month: 5, day: 8, name: 'Warmind' },
  { year: 2018, month: 9, day: 4, name: 'Forsaken' },
  { year: 2018, month: 12, day: 4, name: 'Season of the Forge' },
  { year: 2019, month: 3, day: 5, name: 'Season of the Drifter' },
  { year: 2019, month: 6, day: 4, name: 'Season of Opulence' },
  { year: 2019, month: 10, day: 1, name: 'Shadowkeep' },
  { year: 2019, month: 12, day: 10, name: 'Season of Dawn' },
  { year: 2020, month: 3, day: 10, name: 'Season of the Worthy' },
  { year: 2020, month: 6, day: 9, name: 'Season of Arrivals' },
  { year: 2020, month: 11, day: 10, name: 'Beyond Light' },
  { year: 2021, month: 2, day: 9, name: 'Season of the Chosen' },
  { year: 2021, month: 5, day: 11, name: 'Season of the Splicer' },
  { year: 2021, month: 8, day: 24, name: 'Season of the Lost' },
  { year: 2022, month: 2, day: 22, name: 'Witch Queen' },
  { year: 2022, month: 5, day: 24, name: 'Season of the Haunted' },
  { year: 2022, month: 8, day: 23, name: 'Season of Plunder' },
  { year: 2022, month: 12, day: 6, name: 'Season of the Seraph' },
  { year: 2023, month: 2, day: 28, name: 'Lightfall' },
  { year: 2023, month: 5, day: 23, name: 'Season of the Deep' },
  { year: 2023, month: 8, day: 22, name: 'Season of the Witch' },
  { year: 2023, month: 11, day: 28, name: 'Season of the Wish' },
  { year: 2024, month: 4, day: 9, name: 'Into the Light' },
  { year: 2024, month: 6, day: 4, name: 'The Final Shape' },
  { year: 2024, month: 6, day: 11, name: 'Episode: Echoes' },
  { year: 2024, month: 10, day: 8, name: 'Episode: Revenant' },
  { year: 2025, month: 2, day: 4, name: 'Episode: Heresy' },
  { year: 2025, month: 5, day: 6, name: 'Rite of the Nine' },
  { year: 2025, month: 7, day: 15, name: 'The Edge of Fate' },
  { year: 2025, month: 9, day: 9, name: 'Ash & Iron' },
  { year: 2025, month: 12, day: 2, name: 'Renegades' },
  { year: 2026, month: 6, day: 9, name: 'Monument of Triumph' },
];

/** How far the Time Story table is verified, researched 2026-11-10. */
export const TIME_STORY_ERA_COVERAGE = {
  researchedOn: '2026-11-10',
  D1: {
    lastName: 'Age of Triumph',
    lastStart: { year: 2017, month: 3, day: 28 },
    /** No later official D1 content start was verified. */
    openEnded: true as const,
  },
  D2: {
    lastName: 'Monument of Triumph',
    lastStart: { year: 2026, month: 6, day: 9 },
    /**
     * No later official D2 season, episode, expansion, or major-update start
     * was verified as of researchedOn. Activity after this start stays in
     * Monument of Triumph; it is not given an invented later name.
     * Shadow & Order (announced 2026-03-03) did not ship on that date.
     */
    openEnded: true as const,
  },
} as const;

export const TIME_STORY_ERA_COVERAGE_NOTE =
  'Era dates are verified through Monument of Triumph (June 9, 2026). Later activity stays in that era until a newer official start is added.';

export function timeStoryEraStarts(game: 'D1' | 'D2'): readonly TimeStoryEraStartYmd[] {
  return game === 'D1' ? TIME_STORY_D1_ERA_STARTS : TIME_STORY_D2_ERA_STARTS;
}

/**
 * Latest listed Time Story era start on or before the calendar date, or null
 * before the first start. After the last verified start, the last era is used
 * only because that last era is documented as open-ended.
 */
export function timeStoryEraNameForYmd(
  game: 'D1' | 'D2',
  year: number,
  month: number,
  day: number
): string | null {
  const ymd = { year, month, day };
  const list = timeStoryEraStarts(game);
  const first = list[0];
  if (!first || compareYmd(ymd, first) < 0) return null;
  let name: string | null = null;
  for (const start of list) {
    if (compareYmd(ymd, start) >= 0) name = start.name;
    else break;
  }
  return name;
}

export interface TimeStoryEraRange {
  game: 'D1' | 'D2';
  name: string;
  start: TimeStoryEraStartYmd;
  /** Next listed start, exclusive. Null = last listed era (open-ended). */
  endExclusive: TimeStoryEraStartYmd | null;
}

export function timeStoryEraRanges(game: 'D1' | 'D2'): TimeStoryEraRange[] {
  const list = timeStoryEraStarts(game);
  return list.map((start, i) => ({
    game,
    name: start.name,
    start,
    endExclusive: list[i + 1] ?? null,
  }));
}
