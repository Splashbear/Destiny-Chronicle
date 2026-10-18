import { hasPlayStats, isZeroStatStub } from './activity-batch-merge';

/**
 * W55/W56: D1 archive rows and live Bungie rows.
 * A game is keyed by game + instance id, so a D1 activity and a D2 activity
 * that share an instance id both stay. Within one game, one row remains.
 * An empty period, or a zero-stat archive stub, is replaced by the live row.
 * A row that already has kills or duration is left in place.
 * membershipType 0 and an empty period are valid archive rows, not drops.
 */

export interface D1MergeRow {
  id?: number;
  game?: string;
  membershipId?: string;
  characterId?: string;
  period?: string;
  membershipType?: number;
  activityDetails?: { instanceId?: string | number };
  values?: {
    timePlayedSeconds?: { basic?: { value?: number } };
    kills?: { basic?: { value?: number } };
  };
}

export function d1MergeKey(row: D1MergeRow): string {
  const iid = row.activityDetails?.instanceId;
  return `${row.game || ''}|${iid ?? ''}`;
}

export function hasD1Instance(row: D1MergeRow): boolean {
  const iid = row.activityDetails?.instanceId;
  return iid != null && iid !== '';
}

export function hasRealD1Period(row: D1MergeRow | null | undefined): boolean {
  return typeof row?.period === 'string' && row.period.length > 0 && !Number.isNaN(Date.parse(row.period));
}

/** Incoming wins when it fills an empty period or replaces a zero-stat stub. */
function preferFilled<T extends D1MergeRow>(current: T, incoming: T): T {
  const fillsPeriod = !hasRealD1Period(current) && hasRealD1Period(incoming);
  const fillsStats = isZeroStatStub(current) && hasPlayStats(incoming);
  if (fillsPeriod || fillsStats) {
    return current.id != null ? { ...incoming, id: current.id } : incoming;
  }
  return current;
}

function storedByKey(stored: D1MergeRow[]): Map<string, D1MergeRow> {
  const byKey = new Map<string, D1MergeRow>();
  for (const row of stored) {
    if (!hasD1Instance(row)) {
      continue;
    }
    byKey.set(d1MergeKey(row), row);
  }
  return byKey;
}

/**
 * Bungie rows worth writing after the archive list is already on screen.
 * New games, and live stats for a zero-stat stub. Rows that already have
 * kills or duration are left alone.
 */
export function d1RowsToIngest<T extends D1MergeRow>(page: T[], stored: D1MergeRow[]): T[] {
  const byKey = storedByKey(stored);
  return page.filter(row => {
    if (!hasD1Instance(row)) {
      return false;
    }
    const existing = byKey.get(d1MergeKey(row));
    if (!existing) {
      return true;
    }
    return isZeroStatStub(existing) && hasPlayStats(row);
  });
}

/**
 * Newest-first handoff. A whole page of rows that already have stats means
 * older pages were stored on an earlier pass, so Bungie can stop.
 * A page of archive stubs is not caught up: those still need live stats,
 * and older holes may sit on the next page.
 */
export function d1BungiePageCaughtUp(page: D1MergeRow[], stored: D1MergeRow[]): boolean {
  if (page.length === 0) {
    return false;
  }
  const byKey = storedByKey(stored);
  return page.every(row => {
    if (!hasD1Instance(row)) {
      return true;
    }
    const existing = byKey.get(d1MergeKey(row));
    return !!existing && !isZeroStatStub(existing);
  });
}

/**
 * Combine archive rows and live rows. D1 and D2 ids that collide stay as two
 * rows. Overlap within one game collapses, and the live row replaces an
 * archive placeholder.
 */
export function mergeD1ArchiveAndLive<T extends D1MergeRow>(archive: T[], live: T[]): T[] {
  const out = new Map<string, T>();
  for (const row of archive) {
    if (!hasD1Instance(row)) {
      continue;
    }
    const key = d1MergeKey(row);
    const prior = out.get(key);
    out.set(key, prior ? preferFilled(prior, row) : row);
  }
  for (const row of live) {
    if (!hasD1Instance(row)) {
      continue;
    }
    const key = d1MergeKey(row);
    const prior = out.get(key);
    out.set(key, prior ? preferFilled(prior, row) : row);
  }
  return [...out.values()];
}

/**
 * Split incoming rows against rows already stored for this character.
 * Match is game + instance id. A different game with the same id is a new row.
 */
export function partitionD1AgainstStored<T extends D1MergeRow>(
  incoming: T[],
  stored: D1MergeRow[]
): { fresh: T[]; replacements: T[] } {
  const byKey = storedByKey(stored);
  const fresh: T[] = [];
  const replacements: T[] = [];
  for (const row of incoming) {
    if (!hasD1Instance(row)) {
      continue;
    }
    const existing = byKey.get(d1MergeKey(row));
    if (!existing) {
      fresh.push(row);
      continue;
    }
    const chosen = preferFilled(existing, row);
    if (chosen !== existing) {
      replacements.push(chosen as T);
    }
  }
  return { fresh, replacements };
}
