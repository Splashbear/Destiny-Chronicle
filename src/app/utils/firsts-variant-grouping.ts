import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { baseActivityNameFromVersioned } from './date-activity-grouping';
import { getBaseRaidName } from './base-raid-name';
import { d1RaidVariantName } from './d1-raid-variants';
import { isRiteOfTheNineDungeonName } from './d2-activity-variants';

export type FirstsVariantRow = {
  version: string;
  first?: ActivityFirstCompletion;
  hasClear: boolean;
};

export type FirstsVariantGroup = {
  baseName: string;
  variants: FirstsVariantRow[];
};

const VERSION_ORDER = ['Normal', 'Standard', 'Explorer', 'Eternity', 'Ultimatum', 'Master'];

const VARIANT_PRIORITY: { [key: string]: number } = {
  Normal: 0,
  Standard: 0,
  Hard: 1,
  Master: 2,
  Prestige: 2,
  Challenge: 3,
};

const D1_RAID_RELEASE = [
  'Vault of Glass',
  "Crota's End",
  "King's Fall",
  'Wrath of the Machine',
];

const D2_RAID_RELEASE = [
  'Leviathan',
  'Leviathan, Eater of Worlds',
  'Leviathan, Spire of Stars',
  'Last Wish',
  'Scourge of the Past',
  'Crown of Sorrow',
  'Garden of Salvation',
  'Deep Stone Crypt',
  'Vault of Glass',
  "King's Fall",
  'Vow of the Disciple',
  'Root of Nightmares',
  "Crota's End",
  "Salvation's Edge",
];

const PANTHEON_ORDER_OLDEST_FIRST = [
  'The Pantheon: Atraks Sovereign',
  'The Pantheon: Oryx Exalted',
  'The Pantheon: Rhulk Indomitable',
  'The Pantheon: Nezarec Sublime',
];

const PANTHEON_GROUPS_NEWEST_FIRST = [
  'The Pantheon: Nezarec Sublime',
  'The Pantheon: Rhulk Indomitable',
  'The Pantheon: Oryx Exalted',
  'The Pantheon: Atraks Sovereign',
];

const DUNGEON_RELEASE = [
  'The Shattered Throne',
  'Pit of Heresy',
  'Prophecy',
  'Grasp of Avarice',
  'Duality',
  'Spire of the Watcher',
  'Ghosts of the Deep',
  "Warlord's Ruin",
  "Vesper's Host",
  'Sundered Doctrine',
  'Equilibrium',
];

export function activityVersionFromNameDefaultStandard(activityName: string): string {
  const colonIndex = activityName.indexOf(': ');
  if (colonIndex === -1) return 'Standard';
  return activityName.substring(colonIndex + 2);
}

export function sortFirstsByVersionName(
  activities: ActivityFirstCompletion[],
  getVersion: (name: string) => string = activityVersionFromNameDefaultStandard
): ActivityFirstCompletion[] {
  return activities.sort((a, b) => {
    const aVersion = getVersion(a.name);
    const bVersion = getVersion(b.name);
    const aIndex = VERSION_ORDER.indexOf(aVersion);
    const bIndex = VERSION_ORDER.indexOf(bVersion);
    if (aIndex === -1 && bIndex === -1) return aVersion.localeCompare(bVersion);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function groupActivitiesByBaseName(
  activities: ActivityFirstCompletion[],
  opts?: {
    getBaseName?: (name: string) => string;
    getVersion?: (name: string) => string;
  }
): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  const getBase = opts?.getBaseName ?? baseActivityNameFromVersioned;
  const getVersion = opts?.getVersion ?? activityVersionFromNameDefaultStandard;
  const groupMap = new Map<string, ActivityFirstCompletion[]>();
  for (const activity of activities) {
    const baseName = getBase(activity.name);
    if (!groupMap.has(baseName)) groupMap.set(baseName, []);
    groupMap.get(baseName)!.push(activity);
  }
  return Array.from(groupMap.entries())
    .map(([baseName, versions]) => ({
      baseName,
      versions: sortFirstsByVersionName(versions, getVersion),
    }))
    .sort((a, b) => a.baseName.localeCompare(b.baseName));
}

export function sortRaidsByReleaseOrder(
  list: ActivityFirstCompletion[],
  game: 'D1' | 'D2'
): ActivityFirstCompletion[] {
  const releaseOrder = game === 'D1' ? D1_RAID_RELEASE : D2_RAID_RELEASE;
  return list.slice().sort((a, b) => releaseOrder.indexOf(a.name) - releaseOrder.indexOf(b.name));
}

export function sortPantheonRaidsNewestFirst(
  list: ActivityFirstCompletion[]
): ActivityFirstCompletion[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        PANTHEON_ORDER_OLDEST_FIRST.indexOf(b.name) -
        PANTHEON_ORDER_OLDEST_FIRST.indexOf(a.name)
    );
}

export function sortPantheonGroupsByReleaseOrder(
  groups: Array<{ baseName: string; versions: ActivityFirstCompletion[] }>
): Array<{ baseName: string; versions: ActivityFirstCompletion[] }> {
  const index = new Map<string, number>();
  PANTHEON_GROUPS_NEWEST_FIRST.forEach((name, i) => index.set(name, i));
  return [...groups].sort((a, b) => {
    const ia = index.get(a.baseName) ?? 999;
    const ib = index.get(b.baseName) ?? 999;
    return ia - ib;
  });
}

export function sortDungeonsByReleaseOrder(
  list: ActivityFirstCompletion[],
  opts?: {
    getBaseName?: (name: string) => string;
    getVersion?: (name: string) => string;
  }
): ActivityFirstCompletion[] {
  const getBase = opts?.getBaseName ?? baseActivityNameFromVersioned;
  const getVersion = opts?.getVersion ?? ((name: string) => {
    const i = name.indexOf(': ');
    return i === -1 ? 'Normal' : name.substring(i + 2);
  });
  return list.slice().sort((a, b) => {
    const aBase = getBase(a.name);
    const bBase = getBase(b.name);
    const aIndex = DUNGEON_RELEASE.indexOf(aBase);
    const bIndex = DUNGEON_RELEASE.indexOf(bBase);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return VERSION_ORDER.indexOf(getVersion(a.name)) - VERSION_ORDER.indexOf(getVersion(b.name));
  });
}

export function difficultyVariantFromName(activityName: string): string {
  if (activityName.includes('Master')) return 'Master';
  if (activityName.includes('Prestige')) return 'Prestige';
  if (activityName.includes('Challenge')) return 'Challenge';
  if (activityName.includes('Hard')) return 'Hard';
  if (activityName.includes('Standard')) return 'Standard';
  if (activityName.includes('Legend')) return 'Legend';
  if (activityName.includes('Grandmaster')) return 'Grandmaster';
  if (activityName.includes('Contest')) return 'Contest';
  if (activityName.includes('Day One')) return 'Day One';
  if (activityName.includes('World First')) return 'World First';
  if (activityName.includes('Heroic')) return 'Heroic';
  if (activityName.includes('Easy')) return 'Easy';
  return 'Normal';
}

export function manifestVariantName(
  activity: ActivityFirstCompletion,
  getActivityName: (referenceId: string, isD1: boolean) => string
): string {
  const referenceId = activity.referenceId;
  if (!referenceId) return 'Unknown Activity';
  const isD1 = activity.game === 'D1';
  const manifestName = getActivityName(referenceId, isD1) || 'Unknown Activity';

  if (isD1 && activity.type === 'raid') {
    return d1RaidVariantName(referenceId, manifestName);
  }

  const baseName = getBaseRaidName(manifestName, isD1 ? 'D1' : 'D2');
  if (manifestName !== baseName) {
    let variant = manifestName.replace(baseName, '').trim();
    variant = variant.replace(/^[,:\-]\s*/, '').trim();
    variant = variant.replace(/^\(/, '').replace(/\)$/, '').trim();
    if (variant) return variant;
  }
  return difficultyVariantFromName(activity.name);
}

export function createRaidVariantRow(
  activity: ActivityFirstCompletion,
  getActivityName: (referenceId: string, isD1: boolean) => string
): FirstsVariantRow {
  return {
    version: manifestVariantName(activity, getActivityName),
    hasClear: true,
    first: activity,
  };
}

export function groupRaidsByBaseName(
  activities: ActivityFirstCompletion[],
  game: 'D1' | 'D2',
  getActivityName: (referenceId: string, isD1: boolean) => string
): FirstsVariantGroup[] {
  const groups = new Map<string, FirstsVariantGroup>();

  for (const activity of activities) {
    const referenceId = activity.referenceId;
    const isD1 = activity.game === 'D1';
    const manifestName = referenceId
      ? getActivityName(referenceId, isD1) || activity.name
      : activity.name;
    const baseName = getBaseRaidName(manifestName, game);

    if (!groups.has(baseName)) {
      groups.set(baseName, { baseName, variants: [] });
    }
    const group = groups.get(baseName)!;
    const variant = createRaidVariantRow(activity, getActivityName);
    const existingVariant = group.variants.find(v => v.version === variant.version);

    if (!existingVariant) {
      group.variants.push(variant);
    } else if (variant.first && existingVariant.first) {
      const variantDate = new Date(variant.first.completionDate);
      const existingDate = new Date(existingVariant.first.completionDate);
      if (variantDate < existingDate) {
        const index = group.variants.indexOf(existingVariant);
        group.variants[index] = variant;
      }
    }
  }

  for (const group of groups.values()) {
    group.variants.sort((a, b) => {
      const aPriority = VARIANT_PRIORITY[a.version] ?? 999;
      const bPriority = VARIANT_PRIORITY[b.version] ?? 999;
      return aPriority - bPriority;
    });
  }

  return Array.from(groups.values()).sort((a, b) => a.baseName.localeCompare(b.baseName));
}

export function buildRiteOfTheNineCard(
  dungeons: ActivityFirstCompletion[],
  getActivityName: (referenceId: string, isD1: boolean) => string
): FirstsVariantGroup[] {
  if (!dungeons.length) return [];
  const variants = dungeons.map(activity => createRaidVariantRow(activity, getActivityName));
  return [{ baseName: 'Rite of the Nine', variants }];
}

export function filterRiteOfTheNineFirsts(
  firsts: ActivityFirstCompletion[]
): ActivityFirstCompletion[] {
  return firsts.filter(d => isRiteOfTheNineDungeonName(d.name));
}

export function groupRiteOfTheNineDungeonGroups(
  variants: FirstsVariantRow[]
): Array<{ dungeonName: string; variants: FirstsVariantRow[] }> {
  const groups = new Map<string, FirstsVariantRow[]>();
  for (const variant of variants) {
    let dungeonName = 'Unknown';
    const name = variant.first?.name || '';
    if (name.includes('Ghosts of the Deep')) dungeonName = 'Ghosts of the Deep';
    else if (name.includes('Spire of the Watcher')) dungeonName = 'Spire of the Watcher';
    else if (name.includes('Prophecy')) dungeonName = 'Prophecy';
    if (!groups.has(dungeonName)) groups.set(dungeonName, []);
    groups.get(dungeonName)!.push(variant);
  }
  return Array.from(groups.entries()).map(([dungeonName, rows]) => ({
    dungeonName,
    variants: rows,
  }));
}
