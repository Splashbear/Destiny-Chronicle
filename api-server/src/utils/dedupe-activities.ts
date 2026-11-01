/**
 * The archive can hold the same game more than once for a player (overlapping
 * sources, or one account with two character rows in the same game).
 * Exactly one row is kept per (membership_id, instance_id). When there are several,
 * the winner is chosen deterministically, independent of input order:
 *   1. a completed row beats a not-completed one,
 *   2. then the longest duration_seconds,
 *   3. then the highest character_id (numeric compare).
 * The winner keeps the list position of the first row seen for that game.
 * Rows with a blank instance_id are always kept.
 */
export interface DedupeLike {
  instance_id?: string | number | null;
  membership_id?: string | number | null;
  completed?: boolean | null;
  duration_seconds?: number | null;
  character_id?: string | number | null;
}

function charRank(v: string | number | null | undefined): bigint {
  if (v == null || v === '') return -1n;
  try {
    return BigInt(v);
  } catch {
    return -1n;
  }
}

/** True if `a` should replace `b` as the kept row. Strictly better only; ties keep the existing row. */
function isBetter(a: DedupeLike, b: DedupeLike): boolean {
  const ac = a.completed === true ? 1 : 0;
  const bc = b.completed === true ? 1 : 0;
  if (ac !== bc) return ac > bc;
  const ad = Number(a.duration_seconds ?? 0) || 0;
  const bd = Number(b.duration_seconds ?? 0) || 0;
  if (ad !== bd) return ad > bd;
  return charRank(a.character_id) > charRank(b.character_id);
}

export function dedupeActivitiesByInstance<T extends DedupeLike>(rows: readonly T[]): { kept: T[]; removed: number } {
  const slot = new Map<string, number>(); // key -> index in kept
  const kept: T[] = [];
  let removed = 0;
  for (const row of rows) {
    if (row.instance_id == null || row.instance_id === '') {
      kept.push(row);
      continue;
    }
    const key = `${row.membership_id ?? ''}:${row.instance_id}`;
    const at = slot.get(key);
    if (at === undefined) {
      slot.set(key, kept.length);
      kept.push(row);
      continue;
    }
    removed++;
    if (isBetter(row, kept[at])) kept[at] = row;
  }
  return { kept, removed };
}
