/**
 * The archive can hold the same game more than once for a player (overlapping
 * sources). Keep the first row per (membership_id, instance_id).
 */
export interface DedupeLike {
  instance_id?: string | number | null;
  membership_id?: string | number | null;
}

export function dedupeActivitiesByInstance<T extends DedupeLike>(rows: readonly T[]): { kept: T[]; removed: number } {
  const seen = new Set<string>();
  const kept: T[] = [];
  let removed = 0;
  for (const row of rows) {
    if (row.instance_id == null || row.instance_id === '') {
      kept.push(row);
      continue;
    }
    const key = `${row.membership_id ?? ''}:${row.instance_id}`;
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return { kept, removed };
}
