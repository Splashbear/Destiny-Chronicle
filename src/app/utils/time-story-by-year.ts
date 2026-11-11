import { activityDurationSeconds } from './activity-duration-seconds';
import {
  TIME_STORY_GROUP_IDS,
  type TimeStoryGroupId,
} from './time-story-groups';

export interface TimeStoryActivityLike {
  period?: string;
  /** Precomputed duration; when omitted, activityDurationSeconds() is used. */
  timeSeconds?: number;
}

export interface TimeStoryGroupStat {
  group: string;
  seconds: number;
  games: number;
}

export interface TimeStoryYearBar {
  year: number;
  seconds: number;
  games: number;
  groups: TimeStoryGroupStat[];
}

export interface TimeStoryByYearResult {
  years: TimeStoryYearBar[];
  /** Sum of every year's seconds (time in activities). */
  totalSeconds: number;
  totalGames: number;
}

const ONE_MINUTE = 60;

const yearFormatByZone = new Map<string, Intl.DateTimeFormat>();

function yearFormat(timeZone: string): Intl.DateTimeFormat {
  let fmt = yearFormatByZone.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' });
    yearFormatByZone.set(timeZone, fmt);
  }
  return fmt;
}

/** Test helper: drop cached Intl.DateTimeFormat instances. */
export function resetYearOfPeriodFormatters(): void {
  yearFormatByZone.clear();
}

/** Calendar year of an activity period in the given IANA time zone (or local if omitted). */
export function yearOfPeriod(period: string | undefined | null, timeZone?: string): number | null {
  if (!period) return null;
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return null;
  if (!timeZone) return date.getFullYear();
  const year = Number(yearFormat(timeZone).format(date));
  return Number.isFinite(year) ? year : null;
}

export function emptyGroupStats(): TimeStoryGroupStat[] {
  return TIME_STORY_GROUP_IDS.map(group => ({ group, seconds: 0, games: 0 }));
}

function orderedGroupIds(seen: Iterable<string>, groupOrder?: readonly string[]): string[] {
  const remaining = new Set(seen);
  const ids: string[] = [];
  for (const id of groupOrder ?? TIME_STORY_GROUP_IDS) {
    if (remaining.has(id)) {
      ids.push(id);
      remaining.delete(id);
    }
  }
  ids.push(...[...remaining].sort());
  return ids;
}

/**
 * Build stacked year bars from classified activities.
 * Years with no games are omitted. Newest year first.
 * `classify` may return null to skip a row (e.g. excluded encounter nodes).
 */
export function buildTimeStoryByYear(
  activities: Array<{
    period?: string;
    timeSeconds?: number;
    activity?: object;
  }>,
  classify: (activity: any) => string | null,
  timeZone?: string,
  groupOrder?: readonly string[]
): TimeStoryByYearResult {
  const byYear = new Map<number, { seconds: number; games: number; groups: Map<string, TimeStoryGroupStat> }>();

  for (const row of activities) {
    const activity = (row.activity ?? row) as TimeStoryActivityLike & Record<string, unknown>;
    const year = yearOfPeriod(activity.period ?? row.period, timeZone);
    if (year == null) continue;
    const group = classify(activity);
    if (group == null) continue;
    const seconds =
      typeof row.timeSeconds === 'number' ? row.timeSeconds : activityDurationSeconds(activity);
    if (!Number.isFinite(seconds) || seconds < 0) continue;

    let bucket = byYear.get(year);
    if (!bucket) {
      bucket = { seconds: 0, games: 0, groups: new Map() };
      byYear.set(year, bucket);
    }
    bucket.seconds += seconds;
    bucket.games += 1;
    const current = bucket.groups.get(group) || { group, seconds: 0, games: 0 };
    current.seconds += seconds;
    current.games += 1;
    bucket.groups.set(group, current);
  }

  const years: TimeStoryYearBar[] = [...byYear.entries()]
    .filter(([, bucket]) => bucket.games > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([year, bucket]) => ({
      year,
      seconds: bucket.seconds,
      games: bucket.games,
      groups: orderedGroupIds(bucket.groups.keys(), groupOrder).map(
        group => bucket.groups.get(group) || { group, seconds: 0, games: 0 }
      ).filter(stat => stat.games > 0 || stat.seconds > 0),
    }));

  const totalSeconds = years.reduce((sum, bar) => sum + bar.seconds, 0);
  const totalGames = years.reduce((sum, bar) => sum + bar.games, 0);
  return { years, totalSeconds, totalGames };
}

/** True when every year's group seconds add up to the year total within 1 minute. */
export function timeStoryGroupsReconcile(result: TimeStoryByYearResult, toleranceSeconds = ONE_MINUTE): boolean {
  if (Math.abs(result.years.reduce((s, y) => s + y.seconds, 0) - result.totalSeconds) > toleranceSeconds) {
    return false;
  }
  return result.years.every(bar => {
    const groupSum = bar.groups.reduce((s, g) => s + g.seconds, 0);
    return Math.abs(groupSum - bar.seconds) <= toleranceSeconds;
  });
}

export function groupSharePercent(seconds: number, yearSeconds: number): number {
  if (!yearSeconds) return 0;
  return (seconds / yearSeconds) * 100;
}

export type TimeStoryYearFilter = number | 'all';

export interface TimeStoryGroupTableRow {
  group: string;
  seconds: number;
  games: number;
  percent: number;
}

export interface TimeStoryGroupTable {
  year: TimeStoryYearFilter;
  seconds: number;
  games: number;
  rows: TimeStoryGroupTableRow[];
}

/** Group rows for one year or all years, using the same totals as the year bars. */
export function timeStoryGroupTable(
  result: TimeStoryByYearResult | null | undefined,
  year: TimeStoryYearFilter = 'all'
): TimeStoryGroupTable {
  const empty: TimeStoryGroupTable = { year, seconds: 0, games: 0, rows: [] };
  if (!result?.years.length) return empty;
  const bars = year === 'all' ? result.years : result.years.filter(bar => bar.year === year);
  if (!bars.length) return empty;
  const byGroup = new Map<string, { seconds: number; games: number }>();
  let seconds = 0;
  let games = 0;
  for (const bar of bars) {
    seconds += bar.seconds;
    games += bar.games;
    for (const part of bar.groups) {
      const cur = byGroup.get(part.group) || { seconds: 0, games: 0 };
      cur.seconds += part.seconds;
      cur.games += part.games;
      byGroup.set(part.group, cur);
    }
  }
  const rows = orderedGroupIds(byGroup.keys()).map(group => {
    const cur = byGroup.get(group) || { seconds: 0, games: 0 };
    return {
      group,
      seconds: cur.seconds,
      games: cur.games,
      percent: groupSharePercent(cur.seconds, seconds),
    };
  }).filter(row => row.games > 0 || row.seconds > 0);
  return { year, seconds, games, rows };
}
