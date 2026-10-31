import { DungeonSoloFirst } from '../models/dungeon-solo-first.model';

const DUNGEON_FAMILY_NAMES = [
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
] as const;

/** Manifest title → solo tracker fullName keys. */
export const DUNGEON_MANIFEST_TO_CUSTOM_NAME: { [key: string]: string } = {
  'Ghosts of the Deep: Standard': 'Ghosts of the Deep: Normal',
  'Ghosts of the Deep': 'Ghosts of the Deep: Normal',
  'Prophecy: Explorer': 'Prophecy: Explorer',
  Prophecy: 'Prophecy: Normal',
  'Spire of the Watcher: Standard': 'Spire of the Watcher: Normal',
  'Spire of the Watcher': 'Spire of the Watcher: Normal',
  "Vesper's Host: Standard": "Vesper's Host: Normal",
  "Vesper's Host": "Vesper's Host: Normal",
  'Sundered Doctrine: Standard': 'Sundered Doctrine: Normal',
  'Sundered Doctrine': 'Sundered Doctrine: Normal',
  "Warlord's Ruin: Standard": "Warlord's Ruin: Standard",
  "Warlord's Ruin": "Warlord's Ruin: Standard",
  'Equilibrium: Standard': 'Equilibrium: Standard',
  Equilibrium: 'Equilibrium: Standard',
  'Equilibrium: Master': 'Equilibrium: Master',
  'Equilibrium: Contest': 'Equilibrium: Contest',
  'Equilibrium: Epic': 'Equilibrium: Epic',
};

export function isDungeonFamilyName(label: string): boolean {
  return (DUNGEON_FAMILY_NAMES as readonly string[]).includes(label);
}

export function mapDungeonManifestNameToCustom(manifestName: string): string | null {
  return DUNGEON_MANIFEST_TO_CUSTOM_NAME[manifestName] || null;
}

function earliestByFirstSolo(a: DungeonSoloFirst, b: DungeonSoloFirst): DungeonSoloFirst {
  if (!a.firstSolo) return b;
  if (!b.firstSolo) return a;
  return new Date(b.firstSolo.period) < new Date(a.firstSolo.period) ? b : a;
}

function earliestBySoloOrFlawless(a: DungeonSoloFirst, b: DungeonSoloFirst): DungeonSoloFirst {
  const aa = a.firstSolo || a.firstFlawless;
  const bb = b.firstSolo || b.firstFlawless;
  if (!aa) return b;
  if (!bb) return a;
  return new Date(bb.period) < new Date(aa.period) ? b : a;
}

/**
 * Resolve a DungeonSoloFirst row for a Firsts label (CODE_CLEANUP_SPEC).
 * Exact fullName → mapped name → Normal/Standard swap → earliest by family.
 */
export function findDungeonSoloFirstForLabel(
  list: DungeonSoloFirst[] | undefined,
  label: string
): DungeonSoloFirst | undefined {
  if (!list?.length) return undefined;

  let result = list.find(d => d.fullName === label);

  if (!result) {
    const mappedName = mapDungeonManifestNameToCustom(label);
    if (mappedName) {
      result = list.find(d => d.fullName === mappedName);
    }
  }

  if (!result) {
    let alt = label;
    if (label.endsWith(': Normal')) {
      alt = `${label.slice(0, -': Normal'.length)}: Standard`;
    } else if (label.endsWith(': Standard')) {
      alt = `${label.slice(0, -': Standard'.length)}: Normal`;
    }
    if (alt !== label) {
      result = list.find(d => d.fullName === alt);
    }
  }

  if (!result && isDungeonFamilyName(label)) {
    const matchingVersions = list.filter(d => d.family === label);
    if (matchingVersions.length > 0) {
      result = matchingVersions.reduce(earliestByFirstSolo);
    }
  }

  if (!result && label.includes(': ')) {
    const base = label.split(': ')[0];
    if (isDungeonFamilyName(base)) {
      const matchingVersions = list.filter(
        d => d.family === base && (d.firstSolo || d.firstFlawless)
      );
      if (matchingVersions.length > 0) {
        result = matchingVersions.reduce(earliestBySoloOrFlawless);
      }
    }
  }

  return result;
}
