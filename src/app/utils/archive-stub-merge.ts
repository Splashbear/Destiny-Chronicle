/**
 * The archive's D1 activity lists ("lite" rows) carry instance id, period and
 * mode only: duration, kills, deaths and completion are all 0. If those rows
 * land in IndexedDB first, the Bungie crawl's instance-id dedupe drops the real
 * Bungie rows, so the heatmap (which sums timePlayedSeconds) shows nothing for D1.
 *
 * These helpers let a real Bungie row replace a zero-stat stub for the same
 * instance, keeping the stored row's primary key.
 */
export interface MergeableActivity {
  id?: number;
  activityDetails?: { instanceId?: string | number };
  values?: { timePlayedSeconds?: { basic?: { value?: number } } };
}

export function storedActivitySeconds(activity: MergeableActivity | null | undefined): number {
  const v = activity?.values?.timePlayedSeconds?.basic?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** True when `incoming` has real time and `existing` is a zero-time stub. */
export function shouldReplaceStub(existing: MergeableActivity, incoming: MergeableActivity): boolean {
  return storedActivitySeconds(existing) <= 0 && storedActivitySeconds(incoming) > 0;
}

/**
 * Split incoming rows into brand-new rows and replacements for stored stubs.
 * Replacements carry the stored row's `id` so a bulkPut overwrites in place.
 */
export function partitionAgainstStored<T extends MergeableActivity>(
  incoming: T[],
  stored: MergeableActivity[]
): { fresh: T[]; replacements: T[] } {
  const byIid = new Map<string, MergeableActivity>();
  for (const row of stored) {
    const iid = row.activityDetails?.instanceId;
    if (iid != null && iid !== '') byIid.set(String(iid), row);
  }
  const fresh: T[] = [];
  const replacements: T[] = [];
  for (const row of incoming) {
    const iid = row.activityDetails?.instanceId;
    const existing = iid != null && iid !== '' ? byIid.get(String(iid)) : undefined;
    if (!existing) {
      fresh.push(row);
    } else if (shouldReplaceStub(existing, row)) {
      replacements.push(existing.id != null ? { ...row, id: existing.id } : row);
    }
  }
  return { fresh, replacements };
}
