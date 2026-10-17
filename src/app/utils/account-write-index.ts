import { activityBatchKey, BatchActivity, hasRealPeriod, planActivityWrites } from './activity-batch-merge';

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
