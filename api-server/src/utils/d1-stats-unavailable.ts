/**
 * D1 rows that exist in archive/history but have no usable PGCR stats
 * (BOT_DECISIONS 2026-10-30 naming-fix addendum).
 * Show as "stats unavailable"; never zero-fill kills/time; exclude from
 * Bungie-comparable totals (Bungie history omits mode 0).
 */

/** Story / Speaker-era activities with no stats. */
export const D1_NO_STATS_ACTIVITY_HASHES: ReadonlySet<number> = new Set([
  3635588435, // The Speaker
  1427585666, // A Hero's Return
  4239017990, // A Key Awaits
]);

/** Weekly Heroic Strike variants that lack stats in a known window. */
export const D1_NO_STATS_WEEKLY_HEROIC_HASHES: ReadonlySet<number> = new Set([
  3125074504,
  3125074505,
  3125074507,
]);

const WEEKLY_HEROIC_NO_STATS_FROM = Date.parse('2015-02-25T00:00:00Z');
const WEEKLY_HEROIC_NO_STATS_TO = Date.parse('2015-03-03T00:00:00Z'); // exclusive end after 2015-03-02

export interface D1StatsCheckLike {
  game?: string | null;
  mode?: number | null;
  activity_hash?: number | null;
  activityHash?: number | null;
  period?: string | null;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  duration_seconds?: number | null;
  durationSeconds?: number | null;
  completed?: boolean | number | null;
}

function activityHashOf(row: D1StatsCheckLike): number {
  return Number(row.activity_hash ?? row.activityHash ?? NaN);
}

function periodMs(period: string | null | undefined): number | null {
  if (!period) return null;
  const t = Date.parse(period);
  return Number.isFinite(t) ? t : null;
}

/** True when this D1 row should expose null stats / "stats unavailable". */
export function isD1StatsUnavailable(row: D1StatsCheckLike): boolean {
  if (String(row.game || '').toUpperCase() !== 'D1') return false;
  const hash = activityHashOf(row);
  if (!Number.isFinite(hash)) return false;
  if (D1_NO_STATS_ACTIVITY_HASHES.has(hash)) return true;
  if (D1_NO_STATS_WEEKLY_HEROIC_HASHES.has(hash)) {
    const t = periodMs(row.period);
    if (t != null && t >= WEEKLY_HEROIC_NO_STATS_FROM && t < WEEKLY_HEROIC_NO_STATS_TO) {
      return true;
    }
  }
  return false;
}

/**
 * True when parquet/API source already has no stats (null/undefined),
 * including cl_patch D1 history stubs.
 */
export function leanStatsMissingInSource(row: {
  kills?: unknown;
  deaths?: unknown;
  assists?: unknown;
  duration_seconds?: unknown;
  completed?: unknown;
}): boolean {
  return (
    row.kills == null &&
    row.deaths == null &&
    row.assists == null &&
    row.duration_seconds == null &&
    (row.completed == null || row.completed === '')
  );
}
