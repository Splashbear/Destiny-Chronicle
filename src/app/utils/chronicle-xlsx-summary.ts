import { resolveGame } from './destiny-game';
import { activityDurationSeconds } from './activity-duration-seconds';
import { localDateYmd } from './chronicle-xlsx';

/** Minimal activity shape for summary rollups (game-scoped). */
export interface SummaryActivityRow {
  membershipId?: string;
  game?: 'D1' | 'D2' | string;
  period?: string;
  values?: {
    completed?: { basic?: { value?: number | boolean } };
    timePlayedSeconds?: { basic?: { value?: number } };
    secondsPlayed?: { basic?: { value?: number } } | number;
    activityDurationSeconds?: { basic?: { value?: number } };
  };
}

export interface AccountSummaryTotals {
  timeInActivitiesSeconds: number;
  activities: number;
  completions: number;
}

/**
 * Totals for one archive account row: membershipId AND game.
 * Prevents the old sheet bug where D1 rows mirrored D2 (membership-only rollup).
 */
export function summarizeActivitiesForAccount(
  activities: SummaryActivityRow[],
  membershipId: string,
  game: 'D1' | 'D2'
): AccountSummaryTotals {
  let timeInActivitiesSeconds = 0;
  let activitiesCount = 0;
  let completions = 0;
  for (const a of activities) {
    if (a.membershipId !== membershipId) continue;
    const rowGame = resolveGame({ game: a.game, instanceId: (a as any).instanceId ?? (a as any).activityDetails?.instanceId }) as string;
    if (rowGame !== game) continue;
    activitiesCount += 1;
    timeInActivitiesSeconds += activityDurationSeconds(a);
    const completed = a.values?.completed?.basic?.value;
    if (completed === 1 || completed === true || Number(completed) === 1) {
      completions += 1;
    }
  }
  return { timeInActivitiesSeconds, activities: activitiesCount, completions };
}

export interface SummaryNumericFingerprint {
  timeInActivitiesSeconds: number;
  activities: number;
  completions: number;
  seals: number;
  firsts: number;
}

/**
 * Spec accuracy guard: fail if two different accounts share identical totals
 * across every numeric column (symptoms of the D1=D2 copy bug).
 */
export function findDuplicateSummaryTotals(
  rows: Array<{ key: string } & SummaryNumericFingerprint>
): [string, string] | null {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.key === b.key) continue;
      if (
        a.timeInActivitiesSeconds === b.timeInActivitiesSeconds &&
        a.activities === b.activities &&
        a.completions === b.completions &&
        a.seals === b.seals &&
        a.firsts === b.firsts &&
        // Only flag when there is real data — empty accounts matching is fine.
        (a.activities > 0 || a.timeInActivitiesSeconds > 0 || a.seals > 0 || a.firsts > 0)
      ) {
        return [a.key, b.key];
      }
    }
  }
  return null;
}

/** Latest local calendar day among activities (archive-through). */
export function latestLocalActivityDate(activities: SummaryActivityRow[]): string {
  let bestTs = 0;
  let best = '';
  for (const a of activities) {
    if (!a.period) continue;
    const ts = new Date(a.period).getTime();
    if (!Number.isFinite(ts) || ts <= bestTs) continue;
    bestTs = ts;
    best = localDateYmd(a.period);
  }
  return best;
}

/** 12×31 local month/day activity counts. months 1–12, days 1–31. */
export function onThisDayCountGrid(
  activities: SummaryActivityRow[]
): number[][] {
  const grid = Array.from({ length: 12 }, () => Array.from({ length: 31 }, () => 0));
  for (const a of activities) {
    if (!a.period) continue;
    const d = new Date(a.period);
    if (Number.isNaN(d.getTime())) continue;
    const month = d.getMonth(); // 0-11
    const day = d.getDate(); // 1-31
    if (month < 0 || month > 11 || day < 1 || day > 31) continue;
    grid[month][day - 1] += 1;
  }
  return grid;
}

/** True when month/day is valid in a non-leap reference year (Feb 29 greyed). */
export function isValidCalendarMonthDay(month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const daysInMonth = new Date(2001, month, 0).getDate();
  return day <= daysInMonth;
}
