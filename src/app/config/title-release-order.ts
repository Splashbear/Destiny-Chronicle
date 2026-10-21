/**
 * Title seal release ranking + gilded seal assets (extracted from player-search).
 * CODE_CLEANUP_SPEC — keep behavior identical; keys must match normalizeTitleName().
 */

/** Normalize title names for map lookups. */
export function normalizeTitleName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Mapping of title names (lowercase normalized) to standardized gilded seal image paths. */
export const GILDED_SEAL_IMAGE_MAP: { [title: string]: string } = {
  conqueror: 'assets/gilded-seals/Conqueror-Gilded.png',
  flawless: 'assets/gilded-seals/Flawless-Gilded.png',
  heavymetal: 'assets/gilded-seals/Heavy-Metal-Gilded.png',
  dredgen: 'assets/gilded-seals/Dredgen-Gilded.png',
  deadeye: 'assets/gilded-seals/Deadeye-Gilded.png',
  champ: 'assets/gilded-seals/Champ-Gilded.png',
  ghostwriter: 'assets/gilded-seals/Ghost-Writer-Gilded.png',
  glorious: 'assets/gilded-seals/Glorious-Gilded.png',
  flamekeeper: 'assets/gilded-seals/Flamekeeper-Gilded.png',
  ironlord: 'assets/gilded-seals/Iron-Lord-Gilded.png',
  reveler: 'assets/gilded-seals/Reveler-Gilded.png',
  starbaker: 'assets/gilded-seals/Star-Baker-Gilded.png',
  unbroken: 'assets/gilded-seals/Unbroken-Gilded.png',
};

/** Special handling for legacy and current Conqueror/Flawless titles. */
export const SPECIAL_TITLES: { [hash: number]: { name: string; gildingTrackingRecordHash?: number } } = {
  1376640684: { name: 'Conqueror (Season of the Worthy)' },
  581214566: { name: 'Conqueror (Season of the Hunt)' },
  3212358005: { name: 'Conqueror (Season of Arrivals)' },
  1276693937: { name: 'Flawless (Season of the Hunt)' },
  3251218484: { name: 'Flawless (Season of Arrivals)' },
  2086100423: { name: 'Flawless (Season of the Worthy)' },
  3776992251: { name: 'Conqueror', gildingTrackingRecordHash: 1715149073 },
  1733555826: { name: 'Flawless', gildingTrackingRecordHash: 2506618338 },
};

/** completionRecordHash -> release rank; takes precedence over name lookup */
export const HASH_RELEASE_ORDER: { [hash: number]: number } = {
  3175660257: 40, // MMXXIII MoT
  126238604: 50, // MMXXIV MoT
  1210906304: 59, // Monument of Triumph (Immortal)
  548534407: 59, // The Pantheon (Godsbane)
};

/**
 * Explicit release order (higher = newer). Readable keys; lookups use normalizeTitleName().
 * Chronological by release date; same-date titles alphabetized.
 */
const RELEASE_ORDER_RAW: { [name: string]: number } = {
  chronicler: 1,
  cursebreaker: 1,
  dredgen: 1,
  rivensbane: 1,
  wayfarer: 1,
  blacksmith: 2,
  reckoner: 3,
  shadow: 4,
  'mmxix mot': 5,
  mmxix: 5,
  undying: 6,
  enlightened: 7,
  harbinger: 8,
  savior: 9,
  almighty: 10,
  conqueror: 10,
  forerunner: 11,
  'mmxx mot': 12,
  mmxx: 12,
  splintered: 13,
  warden: 13,
  descendant: 14,
  chosen: 15,
  splicer: 16,
  fatebreaker: 17,
  deadeye: 18,
  realmwalker: 18,
  'mmxxi mot': 19,
  mmxxi: 19,
  vidmaster: 19,
  'disciple-slayer': 20,
  gumshoe: 20,
  risen: 20,
  'iron lord': 21,
  reaper: 21,
  discerptor: 22,
  reveler: 23,
  flamekeeper: 24,
  scallywag: 25,
  kingslayer: 26,
  swordbearer: 27,
  'ghost writer': 28,
  glorious: 29,
  'mmxxii mot': 29,
  mmxxii: 29,
  seraph: 29,
  wanted: 30,
  'star baker': 31,
  queensguard: 32,
  'virtual fighter': 32,
  'dream warrior': 33,
  champ: 34,
  aquanaut: 35,
  ghoul: 36,
  haruspex: 37,
  wishbearer: 38,
  wrathbearer: 39,
  'mmxxiii mot': 40,
  mmxxiii: 40,
  brave: 41,
  godslayer: 42,
  intrepid: 43,
  transcendent: 43,
  iconoclast: 44,
  legend: 45,
  'slayer baron': 46,
  unleashed: 47,
  heretic: 48,
  delver: 49,
  'mmxxiv mot': 50,
  mmxxiv: 50,
  eternal: 51,
  'heavy metal': 52,
  'fated weapon': 53,
  atemporal: 54,
  sharpshooter: 55,
  'avant garde': 56,
  renegade: 57,
  undertaker: 57,
  praxic: 58,
  godsbane: 59,
  immortal: 59,
  'monument of triumph': 59,
  'the pantheon': 59,
};

export const RELEASE_ORDER: { [normalized: string]: number } = Object.fromEntries(
  Object.entries(RELEASE_ORDER_RAW).map(([k, v]) => [normalizeTitleName(k), v])
);

export function titleReleaseRank(completionRecordHash: number, normalizedName: string): number {
  const hashRank = HASH_RELEASE_ORDER[completionRecordHash];
  if (hashRank !== undefined) return hashRank;
  return RELEASE_ORDER[normalizedName] || 0;
}
