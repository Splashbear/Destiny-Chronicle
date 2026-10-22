import {
  aggregatePerTypeFromActivities,
  countSealsForPlatform,
  rollupPlatformStats,
  sumPlaytimeSecondsFromCharacters,
  totalActivityTimeOrFallback,
} from './account-stats-rollup';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ActivityHistory } from '../models/activity-history.model';

describe('account-stats-rollup', () => {
  it('aggregates per-type counts and times', () => {
    const act = (typeHint: number, secs: number) =>
      ({
        activityDetails: { referenceId: typeHint, mode: typeHint },
        values: { timePlayedSeconds: { basic: { value: secs } } },
      }) as unknown as ActivityHistory;

    const perType = aggregatePerTypeFromActivities(
      { a: [act(1, 10), act(2, 5)] },
      (ref) => (ref === 1 ? 'raid' : 'weird'),
      (a) => Number((a as any).values.timePlayedSeconds.basic.value)
    );
    expect(perType['raid']).toEqual({ count: 1, time: 10 });
    expect(perType['other']).toEqual({ count: 1, time: 5 });
  });

  it('sums playtime and falls back activity time', () => {
    const players = [
      { membershipId: '1', game: 'D2', displayName: 'P', membershipType: 2, platform: 'PS' },
    ] as PlayerSearchDisplay[];
    const chars = {
      'D2|1': [{ minutesPlayedTotal: 2 }],
    };
    const total = sumPlaytimeSecondsFromCharacters(players, chars, p => `${p.game}|${p.membershipId}`);
    expect(total).toBe(120);
    expect(totalActivityTimeOrFallback({}, total)).toBe(120);
    expect(totalActivityTimeOrFallback({ raid: { count: 1, time: 30 } }, total)).toBe(30);
  });

  it('counts seals per platform holders', () => {
    expect(
      countSealsForPlatform(
        [
          { locked: false, holders: [{ displayName: 'A', platform: 'Steam' }] },
          { locked: true, holders: [{ displayName: 'A', platform: 'Steam' }] },
        ],
        'A',
        'Steam'
      )
    ).toBe(1);
  });

  it('rollups platform stats and filters empty rows', () => {
    const players = [
      {
        membershipId: '1',
        game: 'D2',
        displayName: 'Splash',
        membershipType: 3,
        platform: 'Steam',
      },
    ] as PlayerSearchDisplay[];
    const counts = new Map([['1|D2', 3]]);
    const rows = rollupPlatformStats({
      players,
      charactersByKey: {
        'D2|1': [
          {
            minutesPlayedTotal: 1,
            dateLastPlayed: '2024-01-02',
            emblemPath: '/e.png',
            emblemBackgroundPath: '/bg.png',
            classType: 1,
            light: 100,
          },
        ],
      },
      aggregatedTitles: [],
      activityCountByKey: counts,
      getPlayerKey: p => `${p.game}|${p.membershipId}`,
      getClassName: () => 'Hunter',
    });
    expect(rows.length).toBe(1);
    expect(rows[0].totalActivities).toBe(3);
    expect(rows[0].emblemIcon).toBe('/e.png');
    expect(rows[0].className).toBe('Hunter');
  });
});
