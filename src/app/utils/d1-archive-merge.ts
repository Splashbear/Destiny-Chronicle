/**
 * W55: D1 archive rows and live Bungie rows.
 * A game is keyed by game + instance id, so a D1 activity and a D2 activity
 * that share an instance id both stay. Within one game, one row remains.
 * An empty period is replaced by a real period. A real row is left in place.
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
  values?: { timePlayedSeconds?: { basic?: { value?: number } } };
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

function playedSeconds(row: D1MergeRow): number {
  const v = row.values?.timePlayedSeconds?.basic?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Incoming wins only when it fills an empty period or a zero-time stub. */
function preferFilled<T extends D1MergeRow>(current: T, incoming: T): T {
  const fillsPeriod = !hasRealD1Period(current) && hasRealD1Period(incoming);
  const fillsTime = playedSeconds(current) <= 0 && playedSeconds(incoming) > 0;
  if (fillsPeriod || fillsTime) {
    return current.id != null ? { ...incoming, id: current.id } : incoming;
  }
  return current;
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
  const byKey = new Map<string, D1MergeRow>();
  for (const row of stored) {
    if (!hasD1Instance(row)) {
      continue;
    }
    byKey.set(d1MergeKey(row), row);
  }
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
