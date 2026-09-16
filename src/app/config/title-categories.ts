/**
 * D2 Title Categories by Season/Expansion
 * Organized chronologically for proper grouping and sorting
 */

export type TitleCategory = 
  | 'Forsaken'
  | 'Black Armory'
  | 'Season of the Drifter'
  | 'Season of Opulence'
  | 'Shadowkeep'
  | 'Season of the Undying'
  | 'Season of Dawn'
  | 'Season of the Worthy'
  | 'Season of Arrivals'
  | 'Beyond Light'
  | 'Season of the Hunt'
  | 'Season of the Chosen'
  | 'Season of the Splicer'
  | 'Season of the Lost'
  | 'The Witch Queen'
  | 'Season of the Risen'
  | 'Season of the Haunted'
  | 'Season of Plunder'
  | 'Season of the Seraph'
  | 'Lightfall'
  | 'Season of Defiance'
  | 'Season of the Deep'
  | 'Season of the Witch'
  | 'Season of the Wish'
  | 'The Final Shape'
  | 'Episode: Echoes'
  | 'Episode: Revenant'
  | 'Episode: Heresy'
  | 'Moments of Triumph'
  | 'Unknown';

export interface TitleCategoryInfo {
  category: TitleCategory;
  order: number;
  year: number;
}

/**
 * Mapping of normalized title names to their categories
 * Includes all D2 titles through Episode: Heresy
 */
export const TITLE_CATEGORY_MAP: { [normalized: string]: TitleCategoryInfo } = {
  // Forsaken (Year 2 Launch - 9/4/2018)
  'wayfarer': { category: 'Forsaken', order: 1, year: 2 },
  'dredgen': { category: 'Forsaken', order: 1, year: 2 },
  'chronicler': { category: 'Forsaken', order: 1, year: 2 },
  'cursebreaker': { category: 'Forsaken', order: 1, year: 2 },
  'rivensbane': { category: 'Forsaken', order: 1, year: 2 },
  
  // Black Armory (12/7/2018)
  'blacksmith': { category: 'Black Armory', order: 2, year: 2 },
  
  // Season of the Drifter (3/5/2019)
  'reckoner': { category: 'Season of the Drifter', order: 3, year: 2 },
  
  // Season of Opulence (6/4/2019)
  'shadow': { category: 'Season of Opulence', order: 4, year: 2 },
  
  // Moments of Triumph Y2 (7/9/2019)
  'mmxix': { category: 'Moments of Triumph', order: 5, year: 2 },
  'mmxixmot': { category: 'Moments of Triumph', order: 5, year: 2 },
  
  // Shadowkeep (10/1/2019)
  'undying': { category: 'Shadowkeep', order: 6, year: 3 },
  
  // Season of Dawn (12/10/2019)
  'savior': { category: 'Season of Dawn', order: 7, year: 3 },
  
  // Season of the Worthy (3/10/2020)
  'almighty': { category: 'Season of the Worthy', order: 8, year: 3 },
  'conqueror': { category: 'Season of the Worthy', order: 8, year: 3 },
  'conquerorworthy': { category: 'Season of the Worthy', order: 8, year: 3 },
  
  // Season of Arrivals (6/9/2020)
  'forerunner': { category: 'Season of Arrivals', order: 9, year: 3 },
  'flawless': { category: 'Season of Arrivals', order: 9, year: 3 },
  'flawlessarrivals': { category: 'Season of Arrivals', order: 9, year: 3 },
  
  // Moments of Triumph Y3 (7/7/2020)
  'mmxx': { category: 'Moments of Triumph', order: 10, year: 3 },
  'mmxxmot': { category: 'Moments of Triumph', order: 10, year: 3 },
  
  // Garden of Salvation (retroactive)
  'enlightened': { category: 'Shadowkeep', order: 6, year: 3 },
  
  // Pit of Heresy
  'harbinger': { category: 'Shadowkeep', order: 6, year: 3 },
  
  // Beyond Light (11/10/2020)
  'splintered': { category: 'Beyond Light', order: 11, year: 4 },
  'warden': { category: 'Beyond Light', order: 11, year: 4 },
  
  // Season of the Hunt (11/10/2020)
  'descendant': { category: 'Season of the Hunt', order: 12, year: 4 },
  'conquerorrhunt': { category: 'Season of the Hunt', order: 12, year: 4 },
  'flawlesshunt': { category: 'Season of the Hunt', order: 12, year: 4 },
  
  // Season of the Chosen (2/9/2021)
  'chosen': { category: 'Season of the Chosen', order: 13, year: 4 },
  
  // Season of the Splicer (5/11/2021)
  'splicer': { category: 'Season of the Splicer', order: 14, year: 4 },
  
  // Vault of Glass (5/22/2021)
  'fatebreaker': { category: 'Season of the Splicer', order: 14, year: 4 },
  
  // Season of the Lost (8/24/2021)
  'realmwalker': { category: 'Season of the Lost', order: 15, year: 4 },
  'deadeye': { category: 'Season of the Lost', order: 15, year: 4 },
  
  // Moments of Triumph Y4 (12/7/2021)
  'mmxxi': { category: 'Moments of Triumph', order: 16, year: 4 },
  'mmxximot': { category: 'Moments of Triumph', order: 16, year: 4 },
  'vidmaster': { category: 'Moments of Triumph', order: 16, year: 4 },
  
  // The Witch Queen (2/22/2022)
  'risen': { category: 'The Witch Queen', order: 17, year: 5 },
  'gumshoe': { category: 'The Witch Queen', order: 17, year: 5 },
  
  // Vow of the Disciple (3/5/2022)
  'discipleslayer': { category: 'The Witch Queen', order: 17, year: 5 },
  
  // Season of the Haunted (5/24/2022)
  'reaper': { category: 'Season of the Haunted', order: 18, year: 5 },
  'ironlord': { category: 'Season of the Haunted', order: 18, year: 5 },
  'discerptor': { category: 'Season of the Haunted', order: 18, year: 5 },
  'reveler': { category: 'Season of the Haunted', order: 18, year: 5 },
  'flamekeeper': { category: 'Season of the Haunted', order: 18, year: 5 },
  
  // Season of Plunder (8/23/2022)
  'scallywag': { category: 'Season of Plunder', order: 19, year: 5 },
  'kingslayer': { category: 'Season of Plunder', order: 19, year: 5 },
  'swordbearer': { category: 'Season of Plunder', order: 19, year: 5 },
  
  // Season of the Seraph (10/18/2022)
  'ghostwriter': { category: 'Season of the Seraph', order: 20, year: 5 },
  'seraph': { category: 'Season of the Seraph', order: 20, year: 5 },
  'glorious': { category: 'Season of the Seraph', order: 20, year: 5 },
  'wanted': { category: 'Season of the Seraph', order: 20, year: 5 },
  'starbaker': { category: 'Season of the Seraph', order: 20, year: 5 },
  
  // Moments of Triumph Y5 (12/6/2022)
  'mmxxii': { category: 'Moments of Triumph', order: 21, year: 5 },
  'mmxxiimot': { category: 'Moments of Triumph', order: 21, year: 5 },
  
  // Lightfall (2/8/2023)
  'virtualfighter': { category: 'Lightfall', order: 22, year: 6 },
  'queensguard': { category: 'Lightfall', order: 22, year: 6 },
  
  // Season of Defiance (3/10/2023)
  'dreamwarrior': { category: 'Season of Defiance', order: 23, year: 6 },
  
  // Season of the Deep (5/23/2023)
  'champ': { category: 'Season of the Deep', order: 24, year: 6 },
  'aquanaut': { category: 'Season of the Deep', order: 24, year: 6 },
  'ghoul': { category: 'Season of the Deep', order: 24, year: 6 },
  
  // Season of the Witch (8/22/2023)
  'haruspex': { category: 'Season of the Witch', order: 25, year: 6 },
  
  // Season of the Wish (11/28/2023)
  'wishbearer': { category: 'Season of the Wish', order: 26, year: 6 },
  'wrathbearer': { category: 'Season of the Wish', order: 26, year: 6 },
  
  // Moments of Triumph Y6 (1/30/2024)
  'mmxxiii': { category: 'Moments of Triumph', order: 27, year: 6 },
  'mmxxiiimot': { category: 'Moments of Triumph', order: 27, year: 6 },
  
  // The Final Shape (4/9/2024)
  'brave': { category: 'The Final Shape', order: 28, year: 7 },
  'godslayer': { category: 'The Final Shape', order: 28, year: 7 },
  'transcendent': { category: 'The Final Shape', order: 28, year: 7 },
  'iconoclast': { category: 'The Final Shape', order: 28, year: 7 },
  
  // Episode: Echoes (6/7/2024)
  'intrepid': { category: 'Episode: Echoes', order: 29, year: 7 },
  
  // Episode: Revenant (10/8/2024)
  'legend': { category: 'Episode: Revenant', order: 30, year: 7 },
  'slayerbaron': { category: 'Episode: Revenant', order: 30, year: 7 },
  'unleashed': { category: 'Episode: Revenant', order: 30, year: 7 },
  
  // Episode: Heresy (2/4/2025)
  'heretic': { category: 'Episode: Heresy', order: 31, year: 7 },
  'delver': { category: 'Episode: Heresy', order: 31, year: 7 },
  
  // Moments of Triumph Y7 (3/4/2025)
  'mmxxiv': { category: 'Moments of Triumph', order: 32, year: 7 },
  'mmxxivmot': { category: 'Moments of Triumph', order: 32, year: 7 },
  
  // Into the Light / Episode: Heresy continuation (5/6/2025)
  'eternal': { category: 'Episode: Heresy', order: 31, year: 7 },
  'heavymetal': { category: 'Episode: Heresy', order: 31, year: 7 },
  'fatedweapon': { category: 'Episode: Heresy', order: 31, year: 7 },
  'atemporal': { category: 'Episode: Heresy', order: 31, year: 7 },
  'sharpshooter': { category: 'Episode: Heresy', order: 31, year: 7 },
  'avantgarde': { category: 'Episode: Heresy', order: 31, year: 7 },
  'renegade': { category: 'Episode: Heresy', order: 31, year: 7 },
  'undertaker': { category: 'Episode: Heresy', order: 31, year: 7 },
  'praxic': { category: 'Episode: Heresy', order: 31, year: 7 },
  
  // The Pantheon / Monument of Triumph (6/9/2026)
  'immortal': { category: 'The Final Shape', order: 28, year: 7 },
  'godsbane': { category: 'The Final Shape', order: 28, year: 7 },
  'monumentoftriumph': { category: 'The Final Shape', order: 28, year: 7 },
  'thepantheon': { category: 'The Final Shape', order: 28, year: 7 },
};

export function getTitleCategory(normalizedName: string): TitleCategoryInfo {
  return TITLE_CATEGORY_MAP[normalizedName] || { category: 'Unknown', order: 999, year: 0 };
}

export const CATEGORY_DISPLAY_ORDER: TitleCategory[] = [
  'Forsaken',
  'Black Armory',
  'Season of the Drifter',
  'Season of Opulence',
  'Shadowkeep',
  'Season of the Undying',
  'Season of Dawn',
  'Season of the Worthy',
  'Season of Arrivals',
  'Beyond Light',
  'Season of the Hunt',
  'Season of the Chosen',
  'Season of the Splicer',
  'Season of the Lost',
  'The Witch Queen',
  'Season of the Risen',
  'Season of the Haunted',
  'Season of Plunder',
  'Season of the Seraph',
  'Lightfall',
  'Season of Defiance',
  'Season of the Deep',
  'Season of the Witch',
  'Season of the Wish',
  'The Final Shape',
  'Episode: Echoes',
  'Episode: Revenant',
  'Episode: Heresy',
  'Moments of Triumph',
  'Unknown',
];
