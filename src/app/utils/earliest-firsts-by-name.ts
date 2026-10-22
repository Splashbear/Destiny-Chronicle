import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

/**
 * Earliest completion per display name.
 * D1 raids keep variants distinct via name|referenceId.
 */
export function earliestFirstsByName(
  list: ActivityFirstCompletion[]
): ActivityFirstCompletion[] {
  const map = new Map<string, ActivityFirstCompletion>();
  for (const first of list) {
    const key =
      first.game === 'D1' && first.type === 'raid'
        ? `${first.name}|${first.referenceId}`
        : first.name;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, first);
      continue;
    }
    if (new Date(first.completionDate) < new Date(existing.completionDate)) {
      map.set(key, first);
    }
  }
  return Array.from(map.values());
}
