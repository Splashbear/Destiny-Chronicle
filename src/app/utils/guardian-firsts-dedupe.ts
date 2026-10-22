import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

/** Deduplication key for merging first completions across characters and accounts. */
export function guardianFirstsDedupKey(f: ActivityFirstCompletion): string {
  if (f.type === 'story' && f.storyReleaseId) {
    return `${f.game}|story|${f.storyReleaseId}`;
  }
  if ((f.game === 'D1' && f.type === 'raid') || (f.game === 'D2' && (f.type === 'raid' || f.type === 'dungeon'))) {
    return `${f.game}|${f.type}|${f.name}|${f.referenceId}`;
  }
  return `${f.game}|${f.type}|${f.name}`;
}

function mergeSoloFlags(into: ActivityFirstCompletion, from: ActivityFirstCompletion): void {
  into.isSolo = into.isSolo || from.isSolo;
  into.isSoloFlawless = into.isSoloFlawless || from.isSoloFlawless;
}

/**
 * Keep earliest completion per dedupe key; preserve solo / solo-flawless from either side.
 * Optionally skip rows that are not completed (stats path).
 */
export function dedupeFirstCompletionsEarliest(
  rows: ActivityFirstCompletion[],
  opts?: { requireCompleted?: boolean }
): ActivityFirstCompletion[] {
  const perName = new Map<string, ActivityFirstCompletion>();
  for (const f of rows) {
    if (opts?.requireCompleted) {
      const c: unknown = f.completed;
      if (!(c === 1 || c === true || Number(c) === 1)) continue;
    }
    const key = guardianFirstsDedupKey(f);
    const existing = perName.get(key);
    if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
      if (existing) {
        mergeSoloFlags(f, existing);
      }
      perName.set(key, f);
    } else {
      if (f.isSolo && !existing.isSolo) existing.isSolo = true;
      if (f.isSoloFlawless && !existing.isSoloFlawless) existing.isSoloFlawless = true;
    }
  }
  return Array.from(perName.values()).sort(
    (a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime()
  );
}

/** Merge many per-player lists into one earliest-wins aggregate (sorted). */
export function aggregateGuardianFirstsFromLists(
  lists: Iterable<ActivityFirstCompletion[] | undefined>
): ActivityFirstCompletion[] {
  const aggregate: ActivityFirstCompletion[] = [];
  for (const list of lists) {
    for (const f of list || []) {
      const key = guardianFirstsDedupKey(f);
      const existing = aggregate.find(x => guardianFirstsDedupKey(x) === key);
      if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
        if (existing) {
          const idx = aggregate.indexOf(existing);
          mergeSoloFlags(f, existing);
          aggregate[idx] = f;
        } else {
          aggregate.push(f);
        }
      } else {
        if (f.isSolo && !existing.isSolo) existing.isSolo = true;
        if (f.isSoloFlawless && !existing.isSoloFlawless) existing.isSoloFlawless = true;
      }
    }
  }
  return aggregate.sort(
    (a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime()
  );
}
