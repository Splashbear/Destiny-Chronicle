import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { sortGroupsByReleaseOrder } from '../config/raid-dungeon-release-order';
import { baseActivityNameFromVersioned } from './date-activity-grouping';

export type VariantRow = {
  version: string;
  first?: ActivityFirstCompletion;
  hasClear: boolean;
};

export type VariantGroup = {
  baseName: string;
  variants: VariantRow[];
};

/** Canonical D2 raid difficulties shown on Firsts cards. */
export const D2_RAID_VARIANT_DEFS = new Map<string, string[]>([
  ['Leviathan', ['Normal', 'Prestige']],
  ['Leviathan, Eater of Worlds', ['Normal', 'Prestige']],
  ['Leviathan, Spire of Stars', ['Normal', 'Prestige']],
  ['Crown of Sorrow', ['Normal']],
  ['Garden of Salvation', ['Normal']],
  ['Deep Stone Crypt', ['Normal']],
  ['Vault of Glass', ['Normal', 'Master', 'Standard']],
  ['Vow of the Disciple', ['Standard', 'Legend', 'Master']],
  ["King's Fall", ['Standard', 'Normal', 'Master', 'Expert']],
  ['Root of Nightmares', ['Normal', 'Master']],
  ["Crota's End", ['Standard', 'Normal', 'Master', 'Legend']],
  ["Salvation's Edge", ['Standard', 'Master']],
  ['Last Wish', ['Standard', 'Normal']],
  ['The Desert Perpetual', ['Standard', 'Normal', 'Contest', 'Epic: Contest', 'Epic: Standard']],
]);

/** Canonical D2 dungeon difficulties shown on Firsts cards. */
export const D2_DUNGEON_VARIANT_DEFS = new Map<string, string[]>([
  ['The Shattered Throne', ['Standard']],
  ['Pit of Heresy', ['Normal']],
  ['Prophecy', ['Normal']],
  ['Grasp of Avarice', ['Normal', 'Master']],
  ['Duality', ['Normal', 'Master']],
  ['Spire of the Watcher', ['Normal', 'Master']],
  ['Ghosts of the Deep', ['Normal', 'Master']],
  ["Warlord's Ruin", ['Normal', 'Master']],
  ["Vesper's Host", ['Normal', 'Master']],
  ['Sundered Doctrine', ['Normal', 'Master']],
  ['Equilibrium', ['Normal', 'Master']],
]);

export function activityVersionFromName(versionedName: string): string {
  const colonIndex = versionedName.indexOf(': ');
  if (colonIndex === -1) return 'Normal';
  return versionedName.substring(colonIndex + 2);
}

/** Normalize Desert Perpetual Epic contest naming into base + version. */
export function normalizeDesertPerpetualName(
  baseName: string,
  version: string
): { baseName: string; version: string } {
  if (baseName.includes('The Desert Perpetual') && baseName.includes('(Epic)')) {
    return { baseName: 'The Desert Perpetual', version: `Epic: ${version}` };
  }
  return { baseName, version };
}

export function isRiteOfTheNineDungeonName(name: string): boolean {
  return (
    (name.includes('Ghosts of the Deep') ||
      name.includes('Spire of the Watcher') ||
      name.includes('Prophecy')) &&
    (name.includes('Explorer') || name.includes('Eternity') || name.includes('Ultimatum'))
  );
}

/**
 * Bucket first completions by base name → version, then fill every defined slot.
 */
export function buildD2VariantGroups(
  firsts: ActivityFirstCompletion[],
  defs: Map<string, string[]>,
  kind: 'raid' | 'dungeon',
  opts?: {
    getBaseName?: (name: string) => string;
    getVersion?: (name: string) => string;
    normalizeName?: (base: string, version: string) => { baseName: string; version: string };
  }
): VariantGroup[] {
  const getBase = opts?.getBaseName ?? baseActivityNameFromVersioned;
  const getVersion = opts?.getVersion ?? activityVersionFromName;
  const normalize = opts?.normalizeName ?? ((b, v) => ({ baseName: b, version: v }));

  const byBase = new Map<string, Map<string, ActivityFirstCompletion>>();
  for (const row of firsts) {
    let baseName = getBase(row.name);
    let version = getVersion(row.name);
    ({ baseName, version } = normalize(baseName, version));
    if (!byBase.has(baseName)) byBase.set(baseName, new Map());
    byBase.get(baseName)!.set(version, row);
  }

  const result: VariantGroup[] = [];
  for (const [baseName, possible] of defs) {
    const completed = byBase.get(baseName) || new Map();
    const hasNormal = completed.get('Normal');
    const hasStandard = completed.get('Standard');
    let baseFirst: ActivityFirstCompletion | undefined = hasStandard || hasNormal;
    if (hasNormal && hasStandard) {
      baseFirst =
        new Date(hasNormal.completionDate) <= new Date(hasStandard.completionDate)
          ? hasNormal
          : hasStandard;
    }
    const baseLabel = hasStandard
      ? 'Standard'
      : hasNormal
        ? 'Normal'
        : possible.includes('Standard')
          ? 'Standard'
          : 'Normal';

    const variants: VariantRow[] = [];
    if (possible.includes('Normal') || possible.includes('Standard')) {
      variants.push({ version: baseLabel, first: baseFirst, hasClear: !!baseFirst });
    }
    for (const v of possible) {
      if (v === 'Normal' || v === 'Standard') continue;
      const first = completed.get(v);
      variants.push({ version: v, first, hasClear: !!first });
    }
    result.push({ baseName, variants });
  }

  return sortGroupsByReleaseOrder(result, 'D2', kind);
}
