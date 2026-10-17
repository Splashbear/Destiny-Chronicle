/**
 * O(1) stand-in for the archive-load scan. Equality is the existing rule:
 * the same activityDetails.instanceId. Game and character are already fixed
 * for that scan (one character load), so adding them would keep rows the
 * old check dropped when an id was missing on one side.
 */
export interface InstanceRow {
  instanceId?: string | number;
  activityDetails?: { instanceId?: string | number };
}

export function instanceIdOf(row: InstanceRow): string {
  const id = row.activityDetails?.instanceId ?? row.instanceId;
  return id == null ? '' : String(id);
}

export function excludeExistingInstances<T extends InstanceRow>(existing: T[], incoming: T[]): T[] {
  const seen = new Set<string>();
  for (const row of existing) {
    seen.add(instanceIdOf(row));
  }
  return incoming.filter(row => !seen.has(instanceIdOf(row)));
}

/**
 * Database write dedupe. Same rule as the old findIndex check:
 * membership id, character id, and instance id. First row wins.
 * Game is included so a D1 row and a D2 row that share an instance id
 * stay separate; within one game the kept rows match the old check.
 */
export interface StoredDedupeRow extends InstanceRow {
  game?: string;
  membershipId?: string;
  characterId?: string;
}

export function storedActivityKey(row: StoredDedupeRow): string {
  return `${row.game || ''}|${row.membershipId || ''}|${row.characterId || ''}|${instanceIdOf(row)}`;
}

export function firstOfEachStored<T extends StoredDedupeRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = storedActivityKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return out;
}
