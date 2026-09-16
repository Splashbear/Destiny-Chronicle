/**
 * D2 title categories from the player's taxonomy list.
 * Keys are normalized names (lowercase, alphanumeric only).
 */

export type TitleCategory =
  | 'Seasonal/Episodal'
  | 'Moments of Triumph'
  | 'Raid'
  | 'Special Events'
  | 'Dungeon'
  | 'Expansion'
  | 'Competitive'
  | 'Other';

export interface TitleCategoryInfo {
  category: TitleCategory;
  order: number;
}

const seasonal = (order = 1): TitleCategoryInfo => ({ category: 'Seasonal/Episodal', order });
const mot = (order = 2): TitleCategoryInfo => ({ category: 'Moments of Triumph', order });
const raid = (order = 3): TitleCategoryInfo => ({ category: 'Raid', order });
const special = (order = 4): TitleCategoryInfo => ({ category: 'Special Events', order });
const dungeon = (order = 5): TitleCategoryInfo => ({ category: 'Dungeon', order });
const expansion = (order = 6): TitleCategoryInfo => ({ category: 'Expansion', order });
const competitive = (order = 7): TitleCategoryInfo => ({ category: 'Competitive', order });

export const TITLE_CATEGORY_MAP: { [normalized: string]: TitleCategoryInfo } = {
  // Seasonal/Episodal
  undying: seasonal(),
  savior: seasonal(),
  almighty: seasonal(),
  forerunner: seasonal(),
  warden: seasonal(),
  chosen: seasonal(),
  splicer: seasonal(),
  realmwalker: seasonal(),
  risen: seasonal(),
  reaper: seasonal(),
  scallywag: seasonal(),
  seraph: seasonal(),
  queensguard: seasonal(),
  aquanaut: seasonal(),
  haruspex: seasonal(),
  wishbearer: seasonal(),
  legend: seasonal(),
  intrepid: seasonal(),
  slayerbaron: seasonal(),
  heretic: seasonal(),

  // Moments of Triumph
  mmxix: mot(),
  mmxixmot: mot(),
  mmxx: mot(),
  mmxxmot: mot(),
  mmxxi: mot(),
  mmxximot: mot(),
  mmxxii: mot(),
  mmxxiimot: mot(),
  mmxxiii: mot(),
  mmxxiiimot: mot(),
  mmxxiv: mot(),
  mmxxivmot: mot(),
  mxxiv: mot(),
  immortal: mot(),
  monumentoftriumph: mot(),
  thepantheon: mot(),

  // Raid
  rivensbane: raid(),
  blacksmith: raid(),
  shadow: raid(),
  enlightened: raid(),
  descendant: raid(),
  fatebreaker: raid(),
  discipleslayer: raid(),
  kingslayer: raid(),
  dreamwarrior: raid(),
  swordbearer: raid(),
  godslayer: raid(),
  iconoclast: raid(),
  atemporal: raid(),
  godsbane: raid(),

  // Special Events
  reveler: special(),
  deadeye: special(),
  vidmaster: special(),
  flamekeeper: special(),
  ghostwriter: special(),
  starbaker: special(),
  champ: special(),
  brave: special(),
  eternal: special(),
  sharpshooter: special(),
  avantgarde: special(),
  avantegarde: special(),

  // Dungeon
  discerptor: dungeon(),
  wanted: dungeon(),
  ghoul: dungeon(),
  wrathbearer: dungeon(),
  unleashed: dungeon(),
  delver: dungeon(),
  praxic: dungeon(),

  // Expansion
  cursebreaker: expansion(),
  wayfarer: expansion(),
  chronicler: expansion(),
  reckoner: expansion(),
  harbinger: expansion(),
  splintered: expansion(),
  gumshoe: expansion(),
  virtualfighter: expansion(),
  transcendent: expansion(),
  fatedweapon: expansion(),
  renegade: expansion(),

  // Competitive
  dredgen: competitive(),
  conqueror: competitive(),
  conquerorworthy: competitive(),
  conquerorrhunt: competitive(),
  conquerorarrivals: competitive(),
  conquerorseasonoftheworthy: competitive(),
  conquerorseasonofthehunt: competitive(),
  conquerorseasonofarrivals: competitive(),
  conquerorseasonofworthy: competitive(),
  conquerorseasonofhunt: competitive(),
  flawless: competitive(),
  flawlessarrivals: competitive(),
  flawlesshunt: competitive(),
  flawlessworthy: competitive(),
  flawlessseasonoftheworthy: competitive(),
  flawlessseasonofthehunt: competitive(),
  flawlessseasonofarrivals: competitive(),
  flawlessseasonofworthy: competitive(),
  flawlessseasonofhunt: competitive(),
  ironlord: competitive(),
  glorious: competitive(),
  heavymetal: competitive(),
  undertaker: competitive(),
  unbroken: competitive(),
};

export function getTitleCategory(normalizedName: string): TitleCategoryInfo {
  const exact = TITLE_CATEGORY_MAP[normalizedName];
  if (exact) {
    return exact;
  }
  // Seasonal Conqueror / Flawless variants use the same group as the base seals.
  if (normalizedName.startsWith('conqueror') || normalizedName.startsWith('flawless')) {
    return competitive();
  }
  return { category: 'Seasonal/Episodal', order: 1 };
}

export const CATEGORY_DISPLAY_ORDER: TitleCategory[] = [
  'Seasonal/Episodal',
  'Moments of Triumph',
  'Raid',
  'Special Events',
  'Dungeon',
  'Expansion',
  'Competitive',
  'Other',
];
