const D2_VARIANT_SUFFIXES = [
  ': Master',
  ': Standard',
  ': Normal',
  ': Prestige',
  ': Challenge',
  ': Expert',
  ': Legend',
  ': Contest',
  ': Day One',
  ': World First',
  ': Hard',
  ': Easy',
  ': Heroic',
  ': Grandmaster',
] as const;

const D2_BASE_NAME_INCLUDES = [
  'Leviathan',
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
  'The Final Shape',
  'Duality',
  'Grasp of Avarice',
  'Prophecy',
  'Pit of Heresy',
  'Shattered Throne',
  'Spire of the Watcher',
  'Ghosts of the Deep',
  "Warlord's Ruin",
  'Pantheon',
] as const;

/**
 * Base raid/dungeon family name from a manifest title (CODE_CLEANUP_SPEC).
 * D1 returns the name as-is; D2 strips difficulty suffixes then matches known families.
 */
export function getBaseRaidName(manifestName: string, game: 'D1' | 'D2'): string {
  if (game === 'D1') {
    return manifestName;
  }

  let baseName = manifestName;
  for (const suffix of D2_VARIANT_SUFFIXES) {
    if (baseName.endsWith(suffix)) {
      baseName = baseName.replace(suffix, '');
      break;
    }
  }

  for (const family of D2_BASE_NAME_INCLUDES) {
    if (baseName.includes(family)) {
      return family;
    }
  }

  return baseName;
}
