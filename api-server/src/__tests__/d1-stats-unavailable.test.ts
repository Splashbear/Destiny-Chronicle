import { isD1StatsUnavailable } from '../utils/d1-stats-unavailable';

describe('isD1StatsUnavailable', () => {
  test('Speaker / Hero Return / Key Awaits', () => {
    expect(isD1StatsUnavailable({ game: 'D1', activity_hash: 3635588435, mode: 0 })).toBe(true);
    expect(isD1StatsUnavailable({ game: 'D1', activityHash: 1427585666, mode: 0 })).toBe(true);
    expect(isD1StatsUnavailable({ game: 'D1', activity_hash: 4239017990, mode: 0 })).toBe(true);
  });

  test('Weekly Heroic only in Feb 25–Mar 2 2015 window', () => {
    expect(
      isD1StatsUnavailable({
        game: 'D1',
        activity_hash: 3125074504,
        period: '2015-02-26T12:00:00Z',
      })
    ).toBe(true);
    expect(
      isD1StatsUnavailable({
        game: 'D1',
        activity_hash: 3125074504,
        period: '2015-04-01T12:00:00Z',
      })
    ).toBe(false);
  });

  test('D2 and normal D1 games are available', () => {
    expect(isD1StatsUnavailable({ game: 'D2', activity_hash: 3635588435 })).toBe(false);
    expect(isD1StatsUnavailable({ game: 'D1', activity_hash: 1, mode: 4 })).toBe(false);
  });
});
