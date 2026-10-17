/** A stored activity row, only the fields the cross-batch key needs. */
export interface BatchActivity {
  id?: number;
  game?: string;
  membershipId?: string;
  characterId?: string;
  period?: string;
  activityDetails?: { instanceId?: string | number };
}

export function activityBatchKey(row: BatchActivity): string {
  const iid = row.activityDetails?.instanceId;
  return `${row.game || ''}|${row.membershipId || ''}|${row.characterId || ''}|${iid ?? ''}`;
}

export function hasRealPeriod(row: BatchActivity | null | undefined): boolean {
  return typeof row?.period === 'string' && row.period.length > 0 && !Number.isNaN(Date.parse(row.period));
}

function hasInstance(row: BatchActivity): boolean {
  const iid = row.activityDetails?.instanceId;
  return iid != null && iid !== '';
}

/** Keep the row that already has a period. A real row is never replaced by another real row. */
function preferReal<T extends BatchActivity>(current: T, incoming: T): T {
  if (!hasRealPeriod(current) && hasRealPeriod(incoming)) {
    return current.id != null ? { ...incoming, id: current.id } : incoming;
  }
  return current;
}

/**
 * Dedupe across batches. Same game + membership + character + instance collapses
 * to one row, and an empty-period placeholder is replaced by the real row.
 * A real row already stored is left in place.
 */
export function planActivityWrites<T extends BatchActivity>(existing: T[], incoming: T[]): T[] {
  const stored = new Map<string, T>();
  for (const row of existing) {
    if (!hasInstance(row)) {
      continue;
    }
    const key = activityBatchKey(row);
    const prior = stored.get(key);
    stored.set(key, prior ? preferReal(prior, row) : row);
  }

  const batch = new Map<string, T>();
  const unkeyed: T[] = [];
  for (const row of incoming) {
    if (!hasInstance(row)) {
      unkeyed.push(row);
      continue;
    }
    const key = activityBatchKey(row);
    const prior = batch.get(key);
    batch.set(key, prior ? preferReal(prior, row) : row);
  }

  const writes = [...unkeyed];
  for (const [key, row] of batch) {
    const already = stored.get(key);
    if (!already) {
      writes.push(row);
      continue;
    }
    if (!hasRealPeriod(already) && hasRealPeriod(row)) {
      writes.push(already.id != null ? { ...row, id: already.id } : row);
    }
  }
  return writes;
}
