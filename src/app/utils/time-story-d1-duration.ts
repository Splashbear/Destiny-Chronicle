import { ownPlayerTimePlayedSeconds } from './player-time-played-seconds';
import type { TimeStorySourceRow } from './time-story-source';

/** D1 rows with no proven player time and no lean duration need a cache backfill. */
export function needsD1DurationBackfill(row: TimeStorySourceRow): boolean {
  if (row.game !== 'D1') return false;
  if (ownPlayerTimePlayedSeconds(row) != null) return false;
  return !(typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds) && row.durationSeconds > 0);
}

/** Apply a cached PGCR/game duration as duration only — never as personal time. */
export function applyCachedD1Duration(row: TimeStorySourceRow, duration: number | null | undefined): TimeStorySourceRow {
  if (!needsD1DurationBackfill(row)) return row;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return row;
  return { ...row, durationSeconds: duration };
}

export type D1DurationLookup = (instanceId: string, period?: string) => Promise<number | null>;

/**
 * Fill missing D1 durations from a cache-only lookup. Rows with no cache hit stay
 * duration-unknown (0 time) rather than inventing seconds.
 */
export async function backfillD1DurationsFromCache(
  rows: TimeStorySourceRow[],
  lookup: D1DurationLookup
): Promise<TimeStorySourceRow[]> {
  const needed = rows.filter(row => needsD1DurationBackfill(row) && row.instanceId);
  if (!needed.length) return rows;
  const durations = new Map<string, number>();
  for (const row of needed) {
    const id = String(row.instanceId);
    const found = await lookup(id, row.period);
    if (typeof found === 'number' && Number.isFinite(found) && found > 0) {
      durations.set(`${id}|${row.period || ''}`, found);
    }
  }
  return rows.map(row => {
    if (!needsD1DurationBackfill(row) || !row.instanceId) return row;
    return applyCachedD1Duration(row, durations.get(`${row.instanceId}|${row.period || ''}`));
  });
}
