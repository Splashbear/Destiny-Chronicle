/**
 * Local calendar-day matching for On This Day.
 * Activities and Anniversaries must use the same rule: the user's timezone, where they are.
 */

/** Local calendar match used by getActivitiesByDate (same rule as anniversary firsts). */
export function matchesCalendarDay(
  period: string | undefined,
  month: number,
  day: number,
  year?: number
): boolean {
  if (!period) {
    return false;
  }
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const sameDay = date.getMonth() + 1 === month && date.getDate() === day;
  return year ? sameDay && date.getFullYear() === year : sameDay;
}

/** Full-list filter. This is the result the UI already shows. */
export function selectByCalendarDay<T extends { period?: string }>(
  rows: T[],
  month: number,
  day: number,
  year?: number
): T[] {
  return rows.filter(row => matchesCalendarDay(row.period, month, day, year));
}

export function scanYears(year: number | undefined, latestYear = new Date().getFullYear()): number[] {
  if (year) {
    return [year];
  }
  const end = Math.max(latestYear, 2014);
  const years: number[] = [];
  for (let y = 2014; y <= end; y++) {
    years.push(y);
  }
  return years;
}

/**
 * Inclusive start, exclusive end as ISO strings covering the user's local calendar day.
 * Spans adjacent UTC days when the local offset crosses midnight UTC.
 */
export function localDayWindow(year: number, month: number, day: number): { start: string; end: string } {
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function periodInDayWindow(period: string, start: string, end: string): boolean {
  return period >= start && period < end;
}

/** What the narrow per-year index ranges return, before the exact filter. */
export function rowsInDayWindows<T extends { period?: string }>(
  rows: T[],
  month: number,
  day: number,
  year?: number,
  latestYear?: number
): T[] {
  const windows = scanYears(year, latestYear).map(y => localDayWindow(y, month, day));
  return rows.filter(row => {
    if (!row.period) {
      return false;
    }
    return windows.some(window => periodInDayWindow(row.period as string, window.start, window.end));
  });
}

/** Index windows, then the same calendar filter. Must match selectByCalendarDay for ISO periods. */
export function selectByIndexedDay<T extends { period?: string }>(
  rows: T[],
  month: number,
  day: number,
  year?: number,
  latestYear?: number
): T[] {
  return selectByCalendarDay(rowsInDayWindows(rows, month, day, year, latestYear), month, day, year);
}
