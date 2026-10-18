/** A stored activity row, only the fields the cross-batch key needs. */
export interface BatchActivity {
  id?: number;
  game?: string;
  membershipId?: string;
  characterId?: string;
  period?: string;
  activityDetails?: { instanceId?: string | number };
  values?: {
    timePlayedSeconds?: { basic?: { value?: number } };
    kills?: { basic?: { value?: number } };
  };
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

function statValue(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Kills or time played. A lite/index row with neither is a stub, even with a period. */
export function hasPlayStats(row: BatchActivity | null | undefined): boolean {
  return statValue(row?.values?.timePlayedSeconds?.basic?.value) > 0
    || statValue(row?.values?.kills?.basic?.value) > 0;
}

export function isZeroStatStub(row: BatchActivity | null | undefined): boolean {
  return !hasPlayStats(row);
}

/**
 * Empty period yields to a real period. A zero-stat stub yields to kills or duration.
 * A row that already has stats is left in place, so a stub cannot overwrite it.
 */
function preferReal<T extends BatchActivity>(current: T, incoming: T): T {
  const fillsPeriod = !hasRealPeriod(current) && hasRealPeriod(incoming);
  const fillsStats = isZeroStatStub(current) && hasPlayStats(incoming);
  if (fillsPeriod || fillsStats) {
    return current.id != null ? { ...incoming, id: current.id } : incoming;
  }
  return current;
}

/**
 * Dedupe across batches. Same game + membership + character + instance collapses
 * to one row. An empty-period placeholder, or a zero-stat archive stub, is
 * replaced by the live row. A row that already has stats is left in place.
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
    const chosen = preferReal(already, row);
    if (chosen !== already) {
      writes.push(chosen);
    }
  }
  return writes;
}
