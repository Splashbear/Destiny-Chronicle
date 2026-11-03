import {
  localDayWindow,
  matchesCalendarDay,
  parseLocalCalendarDate,
  selectByCalendarDay,
  selectByIndexedDay,
} from './calendar-day-query';

function localIso(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

describe('calendar day query', () => {
  const rows = [
    { id: 'local-midnight', period: localIso(2020, 10, 16, 0, 0) },
    { id: 'local-late', period: localIso(2020, 10, 16, 23, 30) },
    { id: 'previous-local-day', period: localIso(2020, 10, 15, 23, 30) },
    { id: 'next-local-day', period: localIso(2020, 10, 17, 3, 0) },
    { id: 'older-year', period: localIso(2014, 10, 16, 12, 0) },
    { id: 'other-month', period: localIso(2020, 11, 16, 12, 0) },
    { id: 'blank', period: '' },
    { id: 'missing' },
  ];

  it('matches On This Day in the user local timezone (with and without year)', () => {
    expect(selectByIndexedDay(rows, 10, 16)).toEqual(selectByCalendarDay(rows, 10, 16));
    expect(selectByIndexedDay(rows, 10, 16, 2020)).toEqual(selectByCalendarDay(rows, 10, 16, 2020));
    expect(selectByCalendarDay(rows, 10, 16).map(row => row.id)).toEqual([
      'local-midnight',
      'local-late',
      'older-year',
    ]);
    expect(selectByCalendarDay(rows, 10, 16, 2020).map(row => row.id)).toEqual([
      'local-midnight',
      'local-late',
    ]);
  });

  it('localDayWindow covers local midnight through next local midnight', () => {
    const { start, end } = localDayWindow(2020, 10, 16);
    expect(start).toBe(localIso(2020, 10, 16, 0, 0));
    expect(end).toBe(localIso(2020, 10, 17, 0, 0));
    expect(matchesCalendarDay(start, 10, 16, 2020)).toBe(true);
    expect(matchesCalendarDay(end, 10, 16, 2020)).toBe(false);
  });

  it('keeps an evening-US clear on the local calendar day even when UTC has rolled over', () => {
    // 11pm EST on Feb 22 = Feb 23 04:00 UTC — must still match local Feb 22.
    const eveningUs = '2022-02-23T04:00:00.000Z';
    const offsetMinutes = new Date(eveningUs).getTimezoneOffset();
    // Only assert the rollover case when the runtime is west of UTC (offset > 0).
    if (offsetMinutes > 0) {
      expect(matchesCalendarDay(eveningUs, 2, 22, 2022)).toBe(true);
      expect(matchesCalendarDay(eveningUs, 2, 23, 2022)).toBe(false);
    } else {
      // UTC / east: same instant is still Feb 23 locally.
      expect(matchesCalendarDay(eveningUs, 2, 23)).toBe(true);
    }
  });

  it('parseLocalCalendarDate reads a bare YYYY-MM-DD as that calendar day in any timezone', () => {
    expect(parseLocalCalendarDate('2022-02-22')).toEqual({ year: 2022, month: 2, day: 22 });
    expect(parseLocalCalendarDate('not a date')).toBeNull();
    const instant = new Date(2022, 1, 22, 23, 30);
    expect(parseLocalCalendarDate(instant.toISOString())).toEqual({ year: 2022, month: 2, day: 22 });
  });

  it('selects a late-evening clear on its local day, not the UTC day (getActivitiesByDateCached rule)', () => {
    const lateEvening = { id: 'late', period: localIso(2022, 2, 22, 23, 30) };
    const target = parseLocalCalendarDate('2022-02-22')!;
    expect(selectByCalendarDay([lateEvening], target.month, target.day, target.year)).toEqual([lateEvening]);
  });
});
