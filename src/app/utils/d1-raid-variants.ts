import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { sortGroupsByReleaseOrder } from '../config/raid-dungeon-release-order';
import { baseActivityNameFromVersioned } from './date-activity-grouping';
import type { VariantGroup } from './d2-activity-variants';

/** D1 raid referenceId → difficulty label (from D1_FAMILY_MAP / PGCR checks). */
export const D1_RAID_VARIANT_BY_REFERENCE_ID: { [key: string]: string } = {
  // Vault of Glass
  '3801607287': 'Normal',
  '708693006': 'Hard',
  '2659248071': 'Normal',
  '2659248068': 'Hard',
  '2659248069': 'Hard',
  '856898338': '390 Light',
  '4038697181': '390 Light',
  // Crota's End
  '898834093': 'Normal',
  '112157962': 'Hard',
  '1836893116': 'Normal',
  '1836893119': 'Hard',
  '2324706853': '390 Light',
  '4000873610': '390 Light',
  // King's Fall
  '1733556769': 'Normal',
  '3534581229': 'Normal',
  '1016659723': 'Hard',
  '3978884648': '390 Light',
  // Wrath of the Machine
  '2578867903': 'Normal',
  '4007500989': 'Normal',
  '260765522': 'Normal',
  '1387993552': 'Hard',
  '1099433614': 'Hard',
  '1342567280': 'Hard',
  '430160982': '390 Light',
  '3356249023': '390 Light',
};

export function d1RaidVariantName(referenceId: string, _manifestName?: string): string {
  return D1_RAID_VARIANT_BY_REFERENCE_ID[referenceId] || 'Normal';
}

/** Aggregate Firsts card (includes Age of Triumph 390 Light). */
export const D1_RAID_VARIANT_DEFS_AGGREGATE = new Map<string, string[]>([
  ['Vault of Glass', ['Normal', 'Hard', '390 Light']],
  ["Crota's End", ['Normal', 'Hard', '390 Light']],
  ["King's Fall", ['Normal', 'Hard', '390 Light']],
  ['Wrath of the Machine', ['Normal', 'Hard', '390 Light']],
]);

/** Per-player card historically only shows Normal/Hard. */
export const D1_RAID_VARIANT_DEFS_PER_PLAYER = new Map<string, string[]>([
  ['Vault of Glass', ['Normal', 'Hard']],
  ["Crota's End", ['Normal', 'Hard']],
  ["King's Fall", ['Normal', 'Hard']],
  ['Wrath of the Machine', ['Normal', 'Hard']],
]);

export function buildD1RaidVariantGroups(
  firsts: ActivityFirstCompletion[],
  defs: Map<string, string[]>,
  opts: {
    getBaseName?: (name: string) => string;
    getVersion: (referenceId: string, name: string) => string;
    /** Aggregate path keeps earliest per version; per-player last-write wins historically. */
    keepEarliest?: boolean;
    sortByReleaseOrder?: boolean;
  }
): VariantGroup[] {
  const getBase = opts.getBaseName ?? baseActivityNameFromVersioned;
  const keepEarliest = opts.keepEarliest !== false;

  const byBase = new Map<string, Map<string, ActivityFirstCompletion>>();
  for (const raid of firsts) {
    const baseName = getBase(raid.name);
    const version = opts.getVersion(raid.referenceId, raid.name);
    if (!byBase.has(baseName)) byBase.set(baseName, new Map());
    const byVersion = byBase.get(baseName)!;
    const existing = byVersion.get(version);
    if (
      !existing ||
      (keepEarliest && new Date(raid.completionDate) < new Date(existing.completionDate))
    ) {
      byVersion.set(version, raid);
    } else if (!keepEarliest) {
      byVersion.set(version, raid);
    }
  }

  const result: VariantGroup[] = [];
  for (const [baseName, possibleVersions] of defs) {
    const completed = byBase.get(baseName) || new Map();
    result.push({
      baseName,
      variants: possibleVersions.map(version => {
        const first = completed.get(version);
        return { version, first, hasClear: !!first };
      }),
    });
  }

  if (opts.sortByReleaseOrder) {
    return sortGroupsByReleaseOrder(result, 'D1', 'raid');
  }
  return result.sort((a, b) => a.baseName.localeCompare(b.baseName));
}
