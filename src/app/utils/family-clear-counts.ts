import { baseActivityNameFromVersioned } from './date-activity-grouping';

/**
 * Count unique completed clears per raid/dungeon family from stored history.
 * Source: IndexedDB activity rows with Bungie completed === 1 (or equivalent),
 * keyed by game + instance id so multi-character rows do not double-count.
 */

export interface FamilyClearCountActivity {
  game?: string;
  period?: string;
  activityDetails?: {
    referenceId?: string | number;
    instanceId?: string | number;
    mode?: number;
  };
  values?: unknown;
}

export function countClearsByBaseName(
  activities: FamilyClearCountActivity[],
  opts: {
    game: 'D1' | 'D2';
    familyMap: Record<string, string>;
    isCompletion: (activity: FamilyClearCountActivity) => boolean;
    /** Optional: only count hashes that look like raids/dungeons via manifest type. */
    isRaidOrDungeon?: (referenceId: string | number, mode?: number) => boolean;
  }
): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const a of activities) {
    if ((a.game as string | undefined) && a.game !== opts.game) continue;
    if (!opts.isCompletion(a)) continue;
    const referenceId = a.activityDetails?.referenceId;
    if (referenceId == null || referenceId === '') continue;
    const mode = a.activityDetails?.mode;
    if (opts.isRaidOrDungeon && !opts.isRaidOrDungeon(referenceId, mode)) continue;

    const family = opts.familyMap[String(referenceId)];
    if (!family) continue;
    const baseName = baseActivityNameFromVersioned(family);
    if (!baseName) continue;

    const instanceId = a.activityDetails?.instanceId;
    const dedupeKey = instanceId != null && String(instanceId) !== ''
      ? `${opts.game}:${String(instanceId)}`
      : `${opts.game}:${referenceId}:${a.period ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    counts.set(baseName, (counts.get(baseName) ?? 0) + 1);
  }

  return counts;
}
