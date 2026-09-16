/**
 * D2 Title Categories from Google Sheet "D2 Titles by Season/Category"
 * Organized by 7 primary category types
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

/**
 * Mapping of normalized title names to their categories
 * Based on Google Sheet taxonomy
 */
export const TITLE_CATEGORY_MAP: { [normalized: string]: TitleCategoryInfo } = {
  // Seasonal/Episodal
  'undying': { category: 'Seasonal/Episodal', order: 1 },
  'savior': { category: 'Seasonal/Episodal', order: 1 },
  'almighty': { category: 'Seasonal/Episodal', order: 1 },
  'forerunner': { category: 'Seasonal/Episodal', order: 1 },
  'warden': { category: 'Seasonal/Episodal', order: 1 },
  'chosen': { category: 'Seasonal/Episodal', order: 1 },
  'splicer': { category: 'Seasonal/Episodal', order: 1 },
  'realmwalker': { category: 'Seasonal/Episodal', order: 1 },
  'risen': { category: 'Seasonal/Episodal', order: 1 },
  'ironlord': { category: 'Seasonal/Episodal', order: 1 },
  'scallywag': { category: 'Seasonal/Episodal', order: 1 },
  'seraph': { category: 'Seasonal/Episodal', order: 1 },
  'virtualfighter': { category: 'Seasonal/Episodal', order: 1 },
  'dreamwarrior': { category: 'Seasonal/Episodal', order: 1 },
  'champ': { category: 'Seasonal/Episodal', order: 1 },
  'aquanaut': { category: 'Seasonal/Episodal', order: 1 },
  'haruspex': { category: 'Seasonal/Episodal', order: 1 },
  'wishbearer': { category: 'Seasonal/Episodal', order: 1 },
  'brave': { category: 'Seasonal/Episodal', order: 1 },
  'intrepid': { category: 'Seasonal/Episodal', order: 1 },
  'legend': { category: 'Seasonal/Episodal', order: 1 },
  'slayerbaron': { category: 'Seasonal/Episodal', order: 1 },
  'unleashed': { category: 'Seasonal/Episodal', order: 1 },
  'heretic': { category: 'Seasonal/Episodal', order: 1 },
  'eternal': { category: 'Seasonal/Episodal', order: 1 },
  'heavymetal': { category: 'Seasonal/Episodal', order: 1 },
  'fatedweapon': { category: 'Seasonal/Episodal', order: 1 },
  'atemporal': { category: 'Seasonal/Episodal', order: 1 },
  'sharpshooter': { category: 'Seasonal/Episodal', order: 1 },
  'avantgarde': { category: 'Seasonal/Episodal', order: 1 },
  'renegade': { category: 'Seasonal/Episodal', order: 1 },
  'undertaker': { category: 'Seasonal/Episodal', order: 1 },
  'praxic': { category: 'Seasonal/Episodal', order: 1 },
  
  // Moments of Triumph
  'mmxix': { category: 'Moments of Triumph', order: 2 },
  'mmxixmot': { category: 'Moments of Triumph', order: 2 },
  'mmxx': { category: 'Moments of Triumph', order: 2 },
  'mmxxmot': { category: 'Moments of Triumph', order: 2 },
  'mmxxi': { category: 'Moments of Triumph', order: 2 },
  'mmxximot': { category: 'Moments of Triumph', order: 2 },
  'mmxxii': { category: 'Moments of Triumph', order: 2 },
  'mmxxiimot': { category: 'Moments of Triumph', order: 2 },
  'mmxxiii': { category: 'Moments of Triumph', order: 2 },
  'mmxxiiimot': { category: 'Moments of Triumph', order: 2 },
  'mmxxiv': { category: 'Moments of Triumph', order: 2 },
  'mmxxivmot': { category: 'Moments of Triumph', order: 2 },
  'vidmaster': { category: 'Moments of Triumph', order: 2 },
  'immortal': { category: 'Moments of Triumph', order: 2 },
  'godsbane': { category: 'Moments of Triumph', order: 2 },
  'monumentoftriumph': { category: 'Moments of Triumph', order: 2 },
  'thepantheon': { category: 'Moments of Triumph', order: 2 },
  
  // Raid
  'rivensbane': { category: 'Raid', order: 3 },
  'blacksmith': { category: 'Raid', order: 3 },
  'shadow': { category: 'Raid', order: 3 },
  'enlightened': { category: 'Raid', order: 3 },
  'descendant': { category: 'Raid', order: 3 },
  'fatebreaker': { category: 'Raid', order: 3 },
  'discipleslayer': { category: 'Raid', order: 3 },
  'kingslayer': { category: 'Raid', order: 3 },
  'queensguard': { category: 'Raid', order: 3 },
  'swordbearer': { category: 'Raid', order: 3 },
  'wrathbearer': { category: 'Raid', order: 3 },
  'godslayer': { category: 'Raid', order: 3 },
  'iconoclast': { category: 'Raid', order: 3 },
  
  // Special Events
  'reveler': { category: 'Special Events', order: 4 },
  'flamekeeper': { category: 'Special Events', order: 4 },
  'ghostwriter': { category: 'Special Events', order: 4 },
  'starbaker': { category: 'Special Events', order: 4 },
  
  // Dungeon
  'harbinger': { category: 'Dungeon', order: 5 },
  'reaper': { category: 'Dungeon', order: 5 },
  'discerptor': { category: 'Dungeon', order: 5 },
  'wanted': { category: 'Dungeon', order: 5 },
  'glorious': { category: 'Dungeon', order: 5 },
  'ghoul': { category: 'Dungeon', order: 5 },
  'delver': { category: 'Dungeon', order: 5 },
  
  // Expansion
  'wayfarer': { category: 'Expansion', order: 6 },
  'chronicler': { category: 'Expansion', order: 6 },
  'cursebreaker': { category: 'Expansion', order: 6 },
  'reckoner': { category: 'Expansion', order: 6 },
  'splintered': { category: 'Expansion', order: 6 },
  'gumshoe': { category: 'Expansion', order: 6 },
  'transcendent': { category: 'Expansion', order: 6 },
  
  // Competitive
  'dredgen': { category: 'Competitive', order: 7 },
  'unbroken': { category: 'Competitive', order: 7 },
  'conqueror': { category: 'Competitive', order: 7 },
  'conquerorworthy': { category: 'Competitive', order: 7 },
  'conquerorrhunt': { category: 'Competitive', order: 7 },
  'flawless': { category: 'Competitive', order: 7 },
  'flawlessarrivals': { category: 'Competitive', order: 7 },
  'flawlesshunt': { category: 'Competitive', order: 7 },
  'deadeye': { category: 'Competitive', order: 7 },
};

export function getTitleCategory(normalizedName: string): TitleCategoryInfo {
  return TITLE_CATEGORY_MAP[normalizedName] || { category: 'Seasonal/Episodal', order: 1 };
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
