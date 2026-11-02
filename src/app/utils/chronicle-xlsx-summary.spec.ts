import {
  findDuplicateSummaryTotals,
  isValidCalendarMonthDay,
  latestLocalActivityDate,
  onThisDayCountGrid,
  summarizeActivitiesForAccount,
} from './chronicle-xlsx-summary';

describe('chronicle-xlsx-summary', () => {
  const acts = [
    {
      membershipId: 'mid-a',
      game: 'D2' as const,
      period: '2020-02-22T20:00:00.000Z',
      values: {
        completed: { basic: { value: 1 } },
        timePlayedSeconds: { basic: { value: 600 } },
      },
    },
    {
      membershipId: 'mid-a',
      game: 'D1' as const,
      period: '2015-02-22T20:00:00.000Z',
      values: {
        completed: { basic: { value: 1 } },
        timePlayedSeconds: { basic: { value: 1200 } },
      },
    },
    {
      membershipId: 'mid-b',
      game: 'D2' as const,
      period: '2021-06-01T12:00:00.000Z',
      values: {
        completed: { basic: { value: 0 } },
        timePlayedSeconds: { basic: { value: 300 } },
      },
    },
  ];

  it('scopes summary totals by membershipId AND game (no D1=D2 copy)', () => {
    const d2 = summarizeActivitiesForAccount(acts, 'mid-a', 'D2');
    const d1 = summarizeActivitiesForAccount(acts, 'mid-a', 'D1');
    expect(d2.activities).toBe(1);
    expect(d2.completions).toBe(1);
    expect(d2.timeInActivitiesSeconds).toBe(600);
    expect(d1.activities).toBe(1);
    expect(d1.timeInActivitiesSeconds).toBe(1200);
    expect(d1.timeInActivitiesSeconds).not.toBe(d2.timeInActivitiesSeconds);
  });

  it('flags duplicate numeric fingerprints across different accounts', () => {
    expect(
      findDuplicateSummaryTotals([
        { key: 'D2|1|a', timeInActivitiesSeconds: 100, activities: 5, completions: 3, seals: 2, firsts: 1 },
        { key: 'D1|1|a', timeInActivitiesSeconds: 100, activities: 5, completions: 3, seals: 2, firsts: 1 },
      ])
    ).toEqual(['D2|1|a', 'D1|1|a']);
    expect(
      findDuplicateSummaryTotals([
        { key: 'D2|1|a', timeInActivitiesSeconds: 100, activities: 5, completions: 3, seals: 2, firsts: 1 },
        { key: 'D1|1|a', timeInActivitiesSeconds: 50, activities: 2, completions: 1, seals: 0, firsts: 0 },
      ])
    ).toBeNull();
  });

  it('builds On This Day counts and greys invalid calendar days', () => {
    const grid = onThisDayCountGrid(acts);
    expect(grid[1][21]).toBeGreaterThanOrEqual(1); // Feb 22 (month index 1, day index 21)
    expect(isValidCalendarMonthDay(2, 30)).toBe(false);
    expect(isValidCalendarMonthDay(2, 28)).toBe(true);
    expect(isValidCalendarMonthDay(4, 31)).toBe(false);
    expect(latestLocalActivityDate(acts).length).toBe(10);
  });
});
