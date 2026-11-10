import { eraNameForYmd, seasonStarts } from './season-starts';
import { SeasonService } from '../services/season.service';
import {
  TIME_STORY_D2_ERA_STARTS,
  TIME_STORY_ERA_COVERAGE,
  timeStoryEraNameForYmd,
  timeStoryEraStarts,
} from './time-story-era-starts';
import {
  buildTimeStoryEras,
  canonicalEraActivityName,
  eraNameForPeriod,
  formatTimeStoryEraHours,
  formatTimeStoryEraLabel,
  TIME_STORY_UNKNOWN_ACTIVITY,
} from './time-story-eras';

describe('SeasonService calendar (unchanged shared table)', () => {
  const seasons = new SeasonService();

  it('keeps SeasonService calendar boundaries', () => {
    expect(seasons.getSeasonForDate('D2', 2025, 2, 3)).toBe('Episode: Revenant');
    expect(seasons.getSeasonForDate('D2', 2025, 2, 4)).toBe('Episode: Heresy');
    expect(seasons.getSeasonForDate('D2', 2025, 10, 19)).toBe('Season of Reclamation');
    expect(seasons.getSeasonForDate('D2', 2026, 10, 19)).toBe('Season of the Lawless');
    expect(eraNameForYmd('D1', 2016, 9, 19)).toBe('The Taken King');
    expect(eraNameForYmd('D1', 2016, 9, 20)).toBe('Rise of Iron');
  });

  it('does not treat Forsaken as a SeasonService label', () => {
    expect(eraNameForYmd('D2', 2017, 9, 5)).toBeNull();
    expect(eraNameForYmd('D1', 2014, 9, 8)).toBeNull();
    expect(seasonStarts('D2').some(s => s.name === 'Forsaken')).toBeFalse();
    expect(eraNameForYmd('D2', 2018, 9, 4)).toBe('Season of the Outlaw');
  });
});

describe('Time Story era coverage', () => {
  it('covers Age of Triumph and keeps earlier D1 boundaries', () => {
    expect(timeStoryEraNameForYmd('D1', 2016, 9, 19)).toBe('The Taken King');
    expect(timeStoryEraNameForYmd('D1', 2016, 9, 20)).toBe('Rise of Iron');
    expect(timeStoryEraNameForYmd('D1', 2017, 3, 27)).toBe('Rise of Iron');
    expect(timeStoryEraNameForYmd('D1', 2017, 3, 28)).toBe('Age of Triumph');
    expect(timeStoryEraNameForYmd('D1', 2017, 9, 6)).toBe('Age of Triumph');
    expect(timeStoryEraStarts('D1').some(s => s.name === 'Age of Triumph')).toBeTrue();
  });

  it('uses expansion names on expansion launch days and fills official gaps', () => {
    expect(timeStoryEraNameForYmd('D2', 2018, 9, 3)).toBe('Warmind');
    expect(timeStoryEraNameForYmd('D2', 2018, 9, 4)).toBe('Forsaken');
    expect(timeStoryEraNameForYmd('D2', 2019, 10, 1)).toBe('Shadowkeep');
    expect(timeStoryEraNameForYmd('D2', 2020, 11, 10)).toBe('Beyond Light');
    expect(timeStoryEraNameForYmd('D2', 2022, 2, 22)).toBe('Witch Queen');
    expect(timeStoryEraNameForYmd('D2', 2023, 2, 28)).toBe('Lightfall');
    expect(timeStoryEraNameForYmd('D2', 2024, 4, 8)).toBe('Season of the Wish');
    expect(timeStoryEraNameForYmd('D2', 2024, 4, 9)).toBe('Into the Light');
    expect(timeStoryEraNameForYmd('D2', 2024, 6, 3)).toBe('Into the Light');
    expect(timeStoryEraNameForYmd('D2', 2024, 6, 4)).toBe('The Final Shape');
    expect(timeStoryEraNameForYmd('D2', 2024, 6, 10)).toBe('The Final Shape');
    expect(timeStoryEraNameForYmd('D2', 2024, 6, 11)).toBe('Episode: Echoes');
    expect(timeStoryEraNameForYmd('D2', 2025, 2, 3)).toBe('Episode: Revenant');
    expect(timeStoryEraNameForYmd('D2', 2025, 2, 4)).toBe('Episode: Heresy');
    expect(timeStoryEraNameForYmd('D2', 2025, 5, 6)).toBe('Rite of the Nine');
    expect(timeStoryEraNameForYmd('D2', 2025, 7, 15)).toBe('The Edge of Fate');
    expect(timeStoryEraNameForYmd('D2', 2025, 9, 9)).toBe('Ash & Iron');
    expect(timeStoryEraNameForYmd('D2', 2025, 12, 2)).toBe('Renegades');
    expect(timeStoryEraNameForYmd('D2', 2026, 6, 9)).toBe('Monument of Triumph');
  });

  it('does not use the unverified Lawless 2025-11-02 date or unshipped Shadow & Order 2026-03-03', () => {
    expect(TIME_STORY_D2_ERA_STARTS.some(s => s.name.includes('Lawless'))).toBeFalse();
    expect(TIME_STORY_D2_ERA_STARTS.some(s => s.year === 2025 && s.month === 11 && s.day === 2)).toBeFalse();
    expect(timeStoryEraNameForYmd('D2', 2025, 11, 2)).toBe('Ash & Iron');
    expect(TIME_STORY_D2_ERA_STARTS.some(s => s.name === 'Shadow & Order' || s.name.includes('Shadow and Order'))).toBeFalse();
    expect(timeStoryEraNameForYmd('D2', 2026, 3, 3)).toBe('Renegades');
  });

  it('keeps activity after the last verified start in that last era instead of inventing a later name', () => {
    expect(TIME_STORY_ERA_COVERAGE.D2.openEnded).toBeTrue();
    expect(TIME_STORY_ERA_COVERAGE.D1.openEnded).toBeTrue();
    expect(timeStoryEraNameForYmd('D2', 2026, 10, 19)).toBe('Monument of Triumph');
    expect(timeStoryEraNameForYmd('D2', 2017, 9, 5)).toBeNull();
  });

  it('assigns a late UTC period using the IANA calendar date', () => {
    // 2025-02-04T03:00:00Z is still 3 Feb 2025 in America/New_York.
    expect(eraNameForPeriod('D2', '2025-02-04T03:00:00Z', 'America/New_York')).toBe('Episode: Revenant');
    expect(eraNameForPeriod('D2', '2025-02-04T03:00:00Z', 'UTC')).toBe('Episode: Heresy');
  });
});

describe('buildTimeStoryEras', () => {
  const names = (game: 'D1' | 'D2', hash: string) =>
    ({ D2: { '16631': 'Last Wish', '0': '' } as Record<string, string>, D1: { '7': "King's Fall" } as Record<string, string> }[game][hash] || '');

  it('picks the most-played activity by time in each era and skips empty eras', () => {
    const items = buildTimeStoryEras(
      [
        { period: '2018-09-10T12:00:00Z', game: 'D2', activityHash: '16631', timeSeconds: 140 * 3600 },
        { period: '2018-09-11T12:00:00Z', game: 'D2', activityHash: '99', timeSeconds: 10 * 3600 },
        { period: '2018-12-10T12:00:00Z', game: 'D2', activityHash: '200', timeSeconds: 20 * 3600 },
      ],
      { timeZone: 'UTC', games: ['D2'], resolveActivityName: names }
    );
    expect(items.map(i => i.label)).toEqual([
      'Season of the Forge · Unknown activity · 20h',
      'Forsaken · Last Wish · 140h',
    ]);
    expect(items[1].hoursLabel).toBe('140h');
    expect(items.some(i => i.eraName === 'Red War')).toBeFalse();
    expect(formatTimeStoryEraLabel('Forsaken', 'Last Wish', 140 * 3600)).toBe('Forsaken · Last Wish · 140h');
    expect(formatTimeStoryEraHours(45 * 60)).toBe('45m');
  });

  it('breaks duration ties by more games, then by stable activity hash', () => {
    const tied = buildTimeStoryEras(
      [
        { period: '2018-09-10T12:00:00Z', game: 'D2', activityHash: 'aaa', timeSeconds: 3600 },
        { period: '2018-09-11T12:00:00Z', game: 'D2', activityHash: 'bbb', timeSeconds: 3600 },
      ],
      { timeZone: 'UTC', games: ['D2'] }
    );
    expect(tied.length).toBe(1);
    expect(tied[0].activityHash).toBe('aaa');

    const moreGames = buildTimeStoryEras(
      [
        { period: '2018-09-10T12:00:00Z', game: 'D2', activityHash: 'aaa', timeSeconds: 3600 },
        { period: '2018-09-11T12:00:00Z', game: 'D2', activityHash: 'bbb', timeSeconds: 1800 },
        { period: '2018-09-12T12:00:00Z', game: 'D2', activityHash: 'bbb', timeSeconds: 1800 },
      ],
      { timeZone: 'UTC', games: ['D2'] }
    );
    expect(moreGames[0].activityHash).toBe('bbb');
    expect(moreGames[0].games).toBe(2);
  });

  it('counts unknown activities and labels a missing name as Unknown activity', () => {
    const items = buildTimeStoryEras(
      [
        { period: '2018-09-10T12:00:00Z', game: 'D2', activityHash: '0', timeSeconds: 7200 },
        { period: '2018-09-11T12:00:00Z', game: 'D2', activityHash: '16631', timeSeconds: 3600 },
      ],
      { timeZone: 'UTC', games: ['D2'], resolveActivityName: names }
    );
    expect(items[0].activityName).toBe(TIME_STORY_UNKNOWN_ACTIVITY);
    expect(items[0].label).toContain('Unknown activity · 2h');
  });

  it('prefers canonical family names over long variant aliases', () => {
    expect(canonicalEraActivityName('The Nether: Explore: Exploration - Private')).toBe('The Nether');
    expect(canonicalEraActivityName('Last Wish: Standard')).toBe('Last Wish');
    const items = buildTimeStoryEras(
      [{ period: '2018-09-10T12:00:00Z', game: 'D2', activityHash: '1', timeSeconds: 3600 }],
      {
        timeZone: 'UTC',
        games: ['D2'],
        resolveActivityName: () => 'Warlord\'s Ruin: Standard',
      }
    );
    expect(items[0].activityName).toBe("Warlord's Ruin");
    expect(items[0].label).toBe("Forsaken · Warlord's Ruin · 1h");
  });

  it('isolates D1/D2 and does not leak D2 time into a D1 era', () => {
    const items = buildTimeStoryEras(
      [
        { period: '2016-10-01T12:00:00Z', game: 'D1', activityHash: '7', timeSeconds: 50 * 3600 },
        { period: '2016-10-01T12:00:00Z', game: 'D2', activityHash: '16631', timeSeconds: 999 * 3600 },
      ],
      { timeZone: 'UTC', games: ['D1'], resolveActivityName: names }
    );
    expect(items.length).toBe(1);
    expect(items[0].game).toBe('D1');
    expect(items[0].eraName).toBe('Rise of Iron');
    expect(items[0].activityName).toBe("King's Fall");
    expect(items[0].seconds).toBe(50 * 3600);
  });

  it('places verified late D1 activity in Age of Triumph', () => {
    const items = buildTimeStoryEras(
      [{ period: '2017-04-01T12:00:00Z', game: 'D1', activityHash: '7', timeSeconds: 3600 }],
      { timeZone: 'UTC', games: ['D1'], resolveActivityName: names }
    );
    expect(items[0].eraName).toBe('Age of Triumph');
  });

  it('ranks by lean timeSeconds once and does not need a full activity object', () => {
    const rows = [
      { period: '2018-09-10T12:00:00Z', game: 'D2' as const, activityHash: '16631', timeSeconds: 100 },
      { period: '2018-09-10T12:00:00Z', game: 'D2' as const, activityHash: '16631', timeSeconds: 50 },
    ];
    const first = buildTimeStoryEras(rows, { timeZone: 'UTC', games: ['D2'], resolveActivityName: names });
    const again = buildTimeStoryEras(rows, { timeZone: 'UTC', games: ['D2'], resolveActivityName: names });
    expect(first[0].seconds).toBe(150);
    expect(again).toEqual(first);
    expect(rows[0].activityHash).toBe('16631');
  });
});
