import { activityDurationSeconds } from './activity-duration-seconds';
import { calendarDateInTimeZone } from './time-story-drilldown';
import { yearOfPeriod, type TimeStoryYearFilter } from './time-story-by-year';

/** Visible cards per page for the year+group results view. */
export const TIME_STORY_RESULTS_PAGE_SIZE = 40;

export interface TimeStoryYearGroupResultRow {
  instanceId?: string;
  period: string;
  /** Local calendar date (YYYY-MM-DD) in the chart time zone. */
  date: string;
  game?: 'D1' | 'D2';
  membershipId?: string;
  characterId?: string;
  activityHash?: string | number;
  mode?: number;
  seconds: number;
  group: string;
}

export interface TimeStoryYearGroupResults {
  year: TimeStoryYearFilter;
  group: string;
  timeZone?: string;
  allowedGames: Array<'D1' | 'D2'>;
  rows: TimeStoryYearGroupResultRow[];
  totalGames: number;
  /** Game count shown on the chart for this year+group, when provided. */
  chartGames: number | null;
  countMatchesChart: boolean;
}

export interface TimeStoryYearGroupPage {
  page: number;
  pageSize: number;
  pageCount: number;
  startIndex: number;
  endIndex: number;
  rows: TimeStoryYearGroupResultRow[];
  days: Array<{ date: string; rows: TimeStoryYearGroupResultRow[] }>;
}

/**
 * Build the year+group result list with the same year, group, duration, and
 * skip rules as `buildTimeStoryByYear`. Incoming rows must already use the
 * same classify/dedupe as the chart (D1/D2 keyed). Newest period first.
 */
export function buildTimeStoryYearGroupResults<
  T extends {
    period?: string;
    timeSeconds?: number;
    game?: 'D1' | 'D2';
    membershipId?: string;
    characterId?: string;
    instanceId?: string;
    activityHash?: string | number;
    mode?: number;
    group?: string | null;
  },
>(
  activities: T[],
  opts: {
    year: TimeStoryYearFilter;
    group: string;
    timeZone?: string;
    allowedGames?: Array<'D1' | 'D2'>;
    classify: (activity: T) => string | null;
    chartGames?: number | null;
  }
): TimeStoryYearGroupResults {
  const rows: TimeStoryYearGroupResultRow[] = [];
  for (const activity of activities) {
    if (opts.allowedGames?.length) {
      const game = activity.game === 'D1' ? 'D1' : 'D2';
      if (!opts.allowedGames.includes(game)) continue;
    }
    const year = yearOfPeriod(activity.period, opts.timeZone);
    if (year == null) continue;
    if (opts.year !== 'all' && year !== opts.year) continue;
    const group = opts.classify(activity);
    if (group == null || group !== opts.group) continue;
    const seconds =
      typeof activity.timeSeconds === 'number'
        ? activity.timeSeconds
        : activityDurationSeconds(activity);
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    const date = calendarDateInTimeZone(activity.period, opts.timeZone);
    if (!date || !activity.period) continue;
    rows.push({
      instanceId: activity.instanceId,
      period: activity.period,
      date,
      game: activity.game === 'D1' ? 'D1' : activity.game === 'D2' ? 'D2' : undefined,
      membershipId: activity.membershipId,
      characterId: activity.characterId,
      activityHash: activity.activityHash,
      mode: activity.mode,
      seconds,
      group,
    });
  }
  rows.sort(compareResultRowsNewestFirst);
  const totalGames = rows.length;
  const chartGames = opts.chartGames == null ? null : opts.chartGames;
  return {
    year: opts.year,
    group: opts.group,
    timeZone: opts.timeZone,
    allowedGames: opts.allowedGames?.length ? [...opts.allowedGames] : [],
    rows,
    totalGames,
    chartGames,
    countMatchesChart: chartGames == null || chartGames === totalGames,
  };
}

export function compareResultRowsNewestFirst(
  a: { period: string; instanceId?: string },
  b: { period: string; instanceId?: string }
): number {
  const byPeriod = Date.parse(b.period) - Date.parse(a.period);
  if (byPeriod !== 0) return byPeriod;
  return String(b.instanceId || '').localeCompare(String(a.instanceId || ''));
}

export function pageTimeStoryYearGroupResults(
  rows: TimeStoryYearGroupResultRow[],
  page: number,
  pageSize: number = TIME_STORY_RESULTS_PAGE_SIZE
): TimeStoryYearGroupPage {
  const size = Math.max(1, Math.floor(pageSize) || TIME_STORY_RESULTS_PAGE_SIZE);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const startIndex = total === 0 ? 0 : (current - 1) * size;
  const endIndex = Math.min(total, startIndex + size);
  const pageRows = rows.slice(startIndex, endIndex);
  return {
    page: current,
    pageSize: size,
    pageCount,
    startIndex,
    endIndex,
    rows: pageRows,
    days: groupResultRowsByDate(pageRows),
  };
}

/** Keep local date order as already sorted (newest day first). */
export function groupResultRowsByDate(
  rows: TimeStoryYearGroupResultRow[]
): Array<{ date: string; rows: TimeStoryYearGroupResultRow[] }> {
  const days: Array<{ date: string; rows: TimeStoryYearGroupResultRow[] }> = [];
  const index = new Map<string, { date: string; rows: TimeStoryYearGroupResultRow[] }>();
  for (const row of rows) {
    let day = index.get(row.date);
    if (!day) {
      day = { date: row.date, rows: [] };
      index.set(row.date, day);
      days.push(day);
    }
    day.rows.push(row);
  }
  return days;
}

const dateLabelByZone = new Map<string, Intl.DateTimeFormat>();
const timeLabelByZone = new Map<string, Intl.DateTimeFormat>();

function dateLabelFormat(timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone || 'local';
  let fmt = dateLabelByZone.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    dateLabelByZone.set(key, fmt);
  }
  return fmt;
}

function timeLabelFormat(timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone || 'local';
  let fmt = timeLabelByZone.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : {}),
      hour: 'numeric',
      minute: '2-digit',
    });
    timeLabelByZone.set(key, fmt);
  }
  return fmt;
}

export function resetTimeStoryResultFormatters(): void {
  dateLabelByZone.clear();
  timeLabelByZone.clear();
}

export function formatTimeStoryResultDate(dateYmd: string, timeZone?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) return dateYmd;
  const iso = `${match[1]}-${match[2]}-${match[3]}T12:00:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return dateYmd;
  return dateLabelFormat(undefined).format(date);
}

export function formatTimeStoryResultTime(period: string, timeZone?: string): string {
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return '';
  return timeLabelFormat(timeZone).format(date);
}
