import { selectByCalendarDay, selectByIndexedDay } from './calendar-day-query';

describe('calendar day query', () => {
  const rows = [
    { id: 'utc-midnight', period: '2020-10-16T00:00:00Z' },
    { id: 'utc-late', period: '2020-10-16T23:30:00.000Z' },
    { id: 'previous-utc-day', period: '2020-10-15T23:30:00Z' },
    { id: 'next-utc-day', period: '2020-10-17T03:00:00Z' },
    { id: 'older-year', period: '2014-10-16T12:00:00Z' },
    { id: 'other-month', period: '2020-11-16T12:00:00Z' },
    { id: 'blank', period: '' },
    { id: 'missing' },
  ];

  it('matches the old full-list filter with and without a year', () => {
    expect(selectByIndexedDay(rows, 10, 16)).toEqual(selectByCalendarDay(rows, 10, 16));
    expect(selectByIndexedDay(rows, 10, 16, 2020)).toEqual(selectByCalendarDay(rows, 10, 16, 2020));
    expect(selectByCalendarDay(rows, 10, 16).map(row => row.id)).toEqual(['utc-midnight', 'utc-late', 'older-year']);
    expect(selectByCalendarDay(rows, 10, 16, 2020).map(row => row.id)).toEqual(['utc-midnight', 'utc-late']);
  });
});
