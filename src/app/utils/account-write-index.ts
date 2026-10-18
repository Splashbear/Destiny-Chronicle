import { activityBatchKey, BatchActivity, hasRealPeriod, planActivityWrites } from './activity-batch-merge';

/** Empty-period rows to delete when a real row with the same key is already stored. */
export function placeholderIdsToDrop(rows: BatchActivity[]): number[] {
  const best = new Map<string, BatchActivity>();
  const drop: number[] = [];
  for (const row of rows) {
    const iid = row.activityDetails?.instanceId;
    if (row.id == null || iid == null || iid === '') {
      continue;
    }
    const key = activityBatchKey(row);
    const prior = best.get(key);
    if (!prior) {
      best.set(key, row);
      continue;
    }
    if (!hasRealPeriod(prior) && hasRealPeriod(row)) {
      drop.push(prior.id as number);
      best.set(key, row);
      continue;
    }
    if (!hasRealPeriod(row)) {
      drop.push(row.id);
    }
  }
  return drop;
}

/**
 * Give inserted rows the id they will have in IndexedDB, and overwrite a placeholder in place.
 * Returns the rows to remember, including ids.
 */
export function persistPlannedRows<T extends BatchActivity>(
  table: T[],
  planned: T[],
  nextId: () => number
): T[] {
  const stored: T[] = [];
  for (const row of planned) {
    if (row.id != null) {
      const at = table.findIndex(existing => existing.id === row.id);
      const saved = { ...row } as T;
      if (at >= 0) {
        table[at] = saved;
      } else {
        table.push(saved);
      }
      stored.push(saved);
      continue;
    }
    const saved = { ...row, id: nextId() } as T;
    table.push(saved);
    stored.push(saved);
  }
  return stored;
}

/**
 * Existing-row keys for one account, loaded once and updated after each write.
 * Later batches do not read IndexedDB again.
 */
export class AccountWriteIndex {
  private readonly loaded = new Set<string>();
  private readonly byAccount = new Map<string, Map<string, BatchActivity>>();

  has(membershipId: string): boolean {
    return this.loaded.has(membershipId);
  }

  load(membershipId: string, rows: BatchActivity[]): void {
    const map = new Map<string, BatchActivity>();
    for (const row of rows) {
      const iid = row.activityDetails?.instanceId;
      if (iid == null || iid === '') {
        continue;
      }
      const key = activityBatchKey(row);
      const prior = map.get(key);
      if (!prior || (!hasRealPeriod(prior) && hasRealPeriod(row))) {
        map.set(key, prior && prior.id != null ? { ...row, id: prior.id } : row);
      }
    }
    this.byAccount.set(membershipId, map);
    this.loaded.add(membershipId);
  }

  existing(membershipIds: string[]): BatchActivity[] {
    const rows: BatchActivity[] = [];
    for (const membershipId of membershipIds) {
      const map = this.byAccount.get(membershipId);
      if (!map) {
        continue;
      }
      rows.push(...map.values());
    }
    return rows;
  }

  /** Remember rows that were actually written, so the next batch sees them. */
  commit(written: BatchActivity[]): void {
    for (const row of written) {
      const membershipId = row.membershipId;
      if (!membershipId) {
        continue;
      }
      if (!this.byAccount.has(membershipId)) {
        this.byAccount.set(membershipId, new Map());
        this.loaded.add(membershipId);
      }
      const iid = row.activityDetails?.instanceId;
      if (iid == null || iid === '') {
        continue;
      }
      this.byAccount.get(membershipId)!.set(activityBatchKey(row), row);
    }
  }

  plan(membershipIds: string[], incoming: BatchActivity[]): BatchActivity[] {
    return planActivityWrites(this.existing(membershipIds), incoming);
  }

  keys(membershipId: string): string[] {
    return [...(this.byAccount.get(membershipId)?.keys() || [])];
  }

  drop(membershipId?: string): void {
    if (!membershipId) {
      this.loaded.clear();
      this.byAccount.clear();
      return;
    }
    this.loaded.delete(membershipId);
    this.byAccount.delete(membershipId);
  }
}
