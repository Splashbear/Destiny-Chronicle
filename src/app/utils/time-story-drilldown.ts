import { yearOfPeriod } from './time-story-by-year';
import { ymdInTimeZone } from './time-story-eras';
import type { TimeStoryGroupId } from './time-story-groups';

const ymdhmsByZone = new Map<string, Intl.DateTimeFormat>();

function ymdhmsFormat(timeZone: string): Intl.DateTimeFormat {
  let fmt = ymdhmsByZone.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    ymdhmsByZone.set(timeZone, fmt);
  }
  return fmt;
}

function num(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find(part => part.type === type)?.value);
}

/**
 * Inclusive start, exclusive end as ISO instants covering the calendar year
 * in the given IANA zone (or the runtime local zone when omitted).
 * Same local-year rule as the Time Story chart.
 */
export function localYearWindow(year: number, timeZone?: string): { start: string; end: string } {
  if (!timeZone) {
    return {
      start: new Date(year, 0, 1, 0, 0, 0, 0).toISOString(),
      end: new Date(year + 1, 0, 1, 0, 0, 0, 0).toISOString(),
    };
  }
  return {
    start: zonedLocalMidnightIso(year, 1, 1, timeZone),
    end: zonedLocalMidnightIso(year + 1, 1, 1, timeZone),
  };
}

export function zonedLocalMidnightIso(
  year: number,
  month: number,
  day: number,
  timeZone: string
): string {
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const parts = ymdhmsFormat(timeZone).formatToParts(new Date(guess));
    const asUtc = Date.UTC(
      num(parts, 'year'),
      num(parts, 'month') - 1,
      num(parts, 'day'),
      num(parts, 'hour') || 0,
      num(parts, 'minute') || 0,
      num(parts, 'second') || 0
    );
    const want = Date.UTC(year, month - 1, day, 0, 0, 0);
    const delta = want - asUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess).toISOString();
}

export function calendarDateInTimeZone(
  period: string | undefined,
  timeZone?: string
): string | null {
  if (!period) return null;
  if (!timeZone) {
    const date = new Date(period);
    if (Number.isNaN(date.getTime())) return null;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
  const ymd = ymdInTimeZone(period, timeZone);
  if (!ymd) return null;
  return `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
}

/** Most recent local calendar day in `year` that has at least one period. */
export function landingDateForTimeStoryYear(
  periods: Array<string | undefined>,
  year: number,
  timeZone?: string
): string | null {
  let best: { key: string; t: number } | null = null;
  for (const period of periods) {
    if (yearOfPeriod(period, timeZone) !== year) continue;
    const key = calendarDateInTimeZone(period, timeZone);
    if (!key) continue;
    const t = Date.parse(period as string);
    if (!Number.isFinite(t)) continue;
    if (!best || t > best.t) best = { key, t };
  }
  return best?.key ?? null;
}

export function fallbackDateForTimeStoryYear(year: number): string {
  return `${year}-12-31`;
}

export function filterActivitiesForTimeStoryDrilldown<
  T extends { period?: string; game?: 'D1' | 'D2' },
>(
  activities: T[],
  opts: {
    year: number;
    group: TimeStoryGroupId;
    timeZone?: string;
    allowedGames?: Array<'D1' | 'D2'>;
    classify: (activity: T) => TimeStoryGroupId | null;
  }
): T[] {
  return activities.filter(activity => {
    if (opts.allowedGames?.length) {
      const game = activity.game === 'D1' ? 'D1' : 'D2';
      if (!opts.allowedGames.includes(game)) return false;
    }
    if (yearOfPeriod(activity.period, opts.timeZone) !== opts.year) return false;
    return opts.classify(activity) === opts.group;
  });
}

export interface TimeStoryOpenGroupHost {
  getSelectedDate(): string;
  setSelectedDate(date: string): void;
  getTimeStoryDateBeforeFilter(): string | null;
  setTimeStoryDateBeforeFilter(date: string | null): void;
  getTimeStoryGroupFilter(): TimeStoryGroupId | string | null;
  getTimeStoryYearFilter(): number | null;
  setTimeStoryGroupFilter(group: TimeStoryGroupId | null): void;
  setTimeStoryYearFilter(year: number | null): void;
  clearFilteredActivitiesCache(): void;
  changeToActivitiesTab(): Promise<void>;
  loadActivities(force: boolean): Promise<void>;
  fetchYearActivities(
    year: number,
    timeZone: string
  ): Promise<Array<{ period?: string; game?: 'D1' | 'D2' }>>;
  classify(activity: { period?: string; game?: 'D1' | 'D2' }): TimeStoryGroupId | null;
  allowedGames(): Array<'D1' | 'D2'>;
  timeZone(): string;
  detectChanges(): void;
}

/** Set year+group filters, land on a day in that year that has matches, then reload Activities. */
export async function openTimeStoryGroupOnHost(
  host: TimeStoryOpenGroupHost,
  event: { group: TimeStoryGroupId; year: number }
): Promise<void> {
  if (!host.getTimeStoryDateBeforeFilter()) {
    host.setTimeStoryDateBeforeFilter(host.getSelectedDate() || null);
  }
  host.setTimeStoryGroupFilter(event.group);
  host.setTimeStoryYearFilter(event.year);
  host.clearFilteredActivitiesCache();
  const timeZone = host.timeZone();
  const yearRows = await host.fetchYearActivities(event.year, timeZone);
  const matching = filterActivitiesForTimeStoryDrilldown(yearRows, {
    year: event.year,
    group: event.group,
    timeZone,
    allowedGames: host.allowedGames(),
    classify: activity => host.classify(activity),
  });
  const landing =
    landingDateForTimeStoryYear(
      matching.map(row => row.period),
      event.year,
      timeZone
    ) || fallbackDateForTimeStoryYear(event.year);
  host.setSelectedDate(landing);
  await host.changeToActivitiesTab();
  await host.loadActivities(true);
  host.detectChanges();
}

/** Clear year+group filters and restore the date used before the drilldown. */
export async function clearTimeStoryDrilldownOnHost(host: TimeStoryOpenGroupHost): Promise<void> {
  if (!host.getTimeStoryGroupFilter() && host.getTimeStoryYearFilter() == null) return;
  host.setTimeStoryGroupFilter(null);
  host.setTimeStoryYearFilter(null);
  const restore = host.getTimeStoryDateBeforeFilter();
  host.setTimeStoryDateBeforeFilter(null);
  host.clearFilteredActivitiesCache();
  if (restore) host.setSelectedDate(restore);
  await host.loadActivities(true);
  host.detectChanges();
}
