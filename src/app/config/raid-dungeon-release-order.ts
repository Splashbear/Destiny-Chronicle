/**
 * Display-name release order for Firsts raid/dungeon grouping.
 * CODE_CLEANUP_SPEC — extracted from player-search.
 */

export const D1_RAID_RELEASE_ORDER: readonly string[] = [
  'Vault of Glass',
  "Crota's End",
  "King's Fall",
  'Wrath of the Machine',
];

export const D2_RAID_RELEASE_ORDER: readonly string[] = [
  'Leviathan',
  'Leviathan, Eater of Worlds',
  'Leviathan, Spire of Stars',
  'Last Wish',
  'Scourge of the Past',
  'Crown of Sorrow',
  'Garden of Salvation',
  'Deep Stone Crypt',
  'Vault of Glass',
  'Vow of the Disciple',
  "King's Fall",
  'Root of Nightmares',
  "Crota's End",
  "Salvation's Edge",
  'The Desert Perpetual',
];

export const D2_DUNGEON_RELEASE_ORDER: readonly string[] = [
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

/**
 * Sort grouped raids/dungeons into release order for display.
 * Unknown names fall to the end, alphabetically. Most recent known first.
 */
export function sortGroupsByReleaseOrder<T extends { baseName: string }>(
  groups: T[],
  game: 'D1' | 'D2',
  kind: 'raid' | 'dungeon'
): T[] {
  let order: readonly string[] | null = null;
  if (game === 'D1' && kind === 'raid') {
    order = D1_RAID_RELEASE_ORDER;
  } else if (game === 'D2' && kind === 'raid') {
    order = D2_RAID_RELEASE_ORDER;
  } else if (game === 'D2' && kind === 'dungeon') {
    order = D2_DUNGEON_RELEASE_ORDER;
  }

  if (!order) {
    return groups;
  }

  const index = new Map<string, number>();
  order.forEach((name, i) => index.set(name, i));

  return [...groups].sort((a, b) => {
    const ia = index.has(a.baseName) ? index.get(a.baseName)! : -1;
    const ib = index.has(b.baseName) ? index.get(b.baseName)! : -1;

    const aKnown = ia !== -1;
    const bKnown = ib !== -1;

    if (aKnown && bKnown) {
      if (ia !== ib) return ib - ia;
      return a.baseName.localeCompare(b.baseName);
    }
    if (aKnown && !bKnown) return -1;
    if (!aKnown && bKnown) return 1;
    return a.baseName.localeCompare(b.baseName);
  });
}
