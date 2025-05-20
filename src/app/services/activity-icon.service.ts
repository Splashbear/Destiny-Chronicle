import { Injectable } from '@angular/core';

export type ActivityIconType = 
  | 'raid-d1'
  | 'raid-d2'
  | 'strike'
  | 'nightfall'
  | 'story'
  | 'dungeon'
  | 'crucible'
  | 'iron-banner'
  | 'trials-osiris'
  | 'trials-nine'
  | 'gambit'
  | 'patrol'
  | 'public-event'
  | 'lost-sector'
  | 'seasonal'
  | 'exotic-mission'
  | 'other';

@Injectable({
  providedIn: 'root'
})
export class ActivityIconService {
  private readonly ICON_BASE_PATH = 'assets/icons/activities';
  private readonly ICON_PATHS: Record<ActivityIconType, string> = {
    'raid-d1': `${this.ICON_BASE_PATH}/raid-d1.png`,
    'raid-d2': `${this.ICON_BASE_PATH}/raid-d2.png`,
    'strike': `${this.ICON_BASE_PATH}/strike.png`,
    'nightfall': `${this.ICON_BASE_PATH}/nightfall.png`,
    'story': `${this.ICON_BASE_PATH}/story.png`,
    'dungeon': `${this.ICON_BASE_PATH}/dungeon.png`,
    'crucible': `${this.ICON_BASE_PATH}/crucible.png`,
    'iron-banner': `${this.ICON_BASE_PATH}/iron-banner.png`,
    'trials-osiris': `${this.ICON_BASE_PATH}/trials-osiris.png`,
    'trials-nine': `${this.ICON_BASE_PATH}/trials-nine.png`,
    'gambit': `${this.ICON_BASE_PATH}/gambit.png`,
    'patrol': `${this.ICON_BASE_PATH}/patrol.png`,
    'public-event': `${this.ICON_BASE_PATH}/public-event.png`,
    'lost-sector': `${this.ICON_BASE_PATH}/lost-sector.png`,
    'seasonal': `${this.ICON_BASE_PATH}/seasonal.png`,
    'exotic-mission': `${this.ICON_BASE_PATH}/exotic-mission.png`,
    'other': `${this.ICON_BASE_PATH}/other.png`
  };

  // Mapping from activity mode numbers to icon types
  private readonly MODE_TO_ICON: Record<number, ActivityIconType> = {
    // Raids
    4: 'raid-d2',  // Generic Raid
    8: 'raid-d1',  // VoG (D1)
    9: 'raid-d1',  // Crota's End (D1)
    16: 'raid-d1', // King's Fall (D1)
    17: 'raid-d1', // Wrath of the Machine
    31: 'raid-d2', // Leviathan
    32: 'raid-d2', // Eater of Worlds
    54: 'raid-d2', // Spire of Stars
    55: 'raid-d2', // Last Wish
    56: 'raid-d2', // Scourge of the Past
    57: 'raid-d2', // Crown of Sorrow
    58: 'raid-d2', // Garden of Salvation
    59: 'raid-d2', // Deep Stone Crypt
    60: 'raid-d2', // VoG (D2)
    61: 'raid-d2', // Vow of the Disciple
    62: 'raid-d2', // King's Fall (D2)
    63: 'raid-d2', // Root of Nightmares
    64: 'raid-d2', // Crota's End (D2)

    // Dungeons
    82: 'dungeon', // Shattered Throne
    83: 'dungeon', // Pit of Heresy
    84: 'dungeon', // Prophecy
    85: 'dungeon', // Grasp of Avarice
    86: 'dungeon', // Duality
    87: 'dungeon', // Spire of the Watcher
    88: 'dungeon', // Ghosts of the Deep
    89: 'dungeon', // Warlord's Ruin

    // Strikes & Nightfalls
    7: 'nightfall',  // D1 Nightfall
    46: 'nightfall', // D2 Nightfall
    48: 'strike',    // D1 Strike
    49: 'strike',    // D2 Strike

    // PvP
    5: 'crucible',   // All PvP
    10: 'crucible',  // Control
    12: 'crucible',  // Clash
    15: 'iron-banner', // Iron Banner
    19: 'trials-osiris', // Trials of Osiris
    24: 'crucible',  // Rumble
    25: 'crucible',  // All PvP
    28: 'crucible',  // Supremacy
    37: 'crucible',  // Survival
    38: 'crucible',  // Countdown
    39: 'trials-nine', // Trials of the Nine
    40: 'crucible',  // Breakthrough
    41: 'crucible',  // Doubles
    42: 'crucible',  // Private Match
    43: 'crucible',  // Scorched
    44: 'crucible',  // Scorched Team

    // Gambit
    45: 'gambit',    // Gambit
    47: 'gambit',    // Gambit Prime
    67: 'gambit',    // Gambit (new)

    // Story & Patrol
    2: 'story',      // Story missions
    3: 'patrol',     // Patrol zones
    6: 'patrol',     // D1 Patrol

    // Other Activities
    1: 'public-event',  // Public Events
    68: 'public-event', // D1 Public Events
    79: 'lost-sector',  // Lost Sectors
    80: 'seasonal',     // Seasonal Activities
    81: 'seasonal',     // Seasonal Activities
    90: 'exotic-mission', // Exotic Missions
    91: 'exotic-mission', // Exotic Missions
  };

  constructor() {}

  /**
   * Gets the path to the icon for a specific activity mode
   * @param mode The activity mode number from the API
   * @param isD1 Whether this is a D1 activity
   * @returns The path to the appropriate icon
   */
  getIconPathForMode(mode: number, isD1: boolean = false): string {
    const iconType = this.MODE_TO_ICON[mode] || 'other';
    // For raids, use D1 variant if it's a D1 activity
    if (iconType === 'raid-d2' && isD1) {
      return this.ICON_PATHS['raid-d1'];
    }
    return this.ICON_PATHS[iconType];
  }

  /**
   * Gets the path to an icon by its type
   * @param type The activity icon type
   * @returns The path to the icon
   */
  getIconPath(type: ActivityIconType): string {
    return this.ICON_PATHS[type];
  }
} 