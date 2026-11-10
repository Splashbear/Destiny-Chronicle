import { buildTimeStoryByYear, timeStoryGroupsReconcile, yearOfPeriod } from './time-story-by-year';
import type { TimeStoryGroupId } from './time-story-groups';

describe('yearOfPeriod', () => {
  it('uses the IANA zone so a late UTC period can fall on the previous local year', () => {
    expect(yearOfPeriod('2023-01-01T03:00:00Z', 'America/New_York')).toBe(2022);
    expect(yearOfPeriod('2023-01-01T03:00:00Z', 'UTC')).toBe(2023);
  });

  it('skips missing or invalid periods', () => {
    expect(yearOfPeriod(undefined)).toBeNull();
    expect(yearOfPeriod('not-a-date')).toBeNull();
  });
});

describe('buildTimeStoryByYear', () => {
  const classify = (a: { group?: TimeStoryGroupId }) => a.group ?? 'other';

  it('skips empty years, sorts newest first, and reconciles group totals within a minute', () => {
    const result = buildTimeStoryByYear(
      [
        { period: '2022-06-01T12:00:00Z', timeSeconds: 3600, activity: { period: '2022-06-01T12:00:00Z', group: 'raids' } },
        { period: '2024-02-01T12:00:00Z', timeSeconds: 1800, activity: { period: '2024-02-01T12:00:00Z', group: 'trials' } },
        { period: '2024-08-01T12:00:00Z', timeSeconds: 7200, activity: { period: '2024-08-01T12:00:00Z', group: 'raids' } },
      ],
      classify as any,
      'UTC'
    );
    expect(result.years.map(y => y.year)).toEqual([2024, 2022]);
    expect(result.years.find(y => y.year === 2023)).toBeUndefined();
    expect(result.totalSeconds).toBe(12600);
    expect(result.totalGames).toBe(3);
    const y2024 = result.years[0];
    expect(y2024.seconds).toBe(9000);
    expect(y2024.games).toBe(2);
    expect(y2024.groups.map(g => g.group).sort()).toEqual(['raids', 'trials']);
    expect(timeStoryGroupsReconcile(result)).toBeTrue();
  });

  it('omits null classifications (excluded encounter nodes) and zero-game groups', () => {
    const result = buildTimeStoryByYear(
      [
        { period: '2021-05-01T00:00:00Z', timeSeconds: 100, activity: { period: '2021-05-01T00:00:00Z', group: 'raids' } },
        { period: '2021-05-02T00:00:00Z', timeSeconds: 50, activity: { period: '2021-05-02T00:00:00Z', skip: true } },
      ],
      (a: any) => (a.skip ? null : 'raids'),
      'UTC'
    );
    expect(result.totalSeconds).toBe(100);
    expect(result.totalGames).toBe(1);
    expect(result.years[0].groups.every(g => g.group === 'raids')).toBeTrue();
  });
});
