export interface ActivityTypeOption {
  label: string;
  d1Mode?: number;
  d2Mode?: number;
}

// Define all possible activity modes
export type ActivityMode = 
  | 'Story'
  | 'Patrol'
  | 'Public Event'
  | 'Raid'
  | 'Dungeon'
  | 'Strike'
  | 'Nightfall'
  | 'Lost Sector'
  | 'Exotic Mission'
  | 'Seasonal'
  | 'Seasonal Event'
  | 'Crucible'
  | 'Gambit'
  | 'Other';

// Map mode numbers to activity types
export const ACTIVITY_MODE_MAP: { [mode: number]: ActivityMode } = {
  // Story and Patrol (D1 & D2)
  2: 'Story',      // Story missions
  3: 'Patrol',     // Patrol zones
  6: 'Patrol',     // D1 Patrol
  
  // Raids (D1 & D2)
  4: 'Raid',       // All raids
  8: 'Raid',       // D1 Vault of Glass
  9: 'Raid',       // D1 Crota's End
  16: 'Raid',      // D1 King's Fall
  17: 'Raid',      // D1 Wrath of the Machine
  31: 'Raid',      // D2 Leviathan
  32: 'Raid',      // D2 Eater of Worlds
  54: 'Raid',      // D2 Spire of Stars
  55: 'Raid',      // D2 Last Wish
  56: 'Raid',      // D2 Scourge of the Past
  57: 'Raid',      // D2 Crown of Sorrow
  58: 'Raid',      // D2 Garden of Salvation
  59: 'Raid',      // D2 Deep Stone Crypt
  60: 'Raid',      // D2 Vault of Glass (D2)
  61: 'Raid',      // D2 Vow of the Disciple
  62: 'Raid',      // D2 King's Fall (D2)
  63: 'Raid',      // D2 Root of Nightmares
  64: 'Raid',      // D2 Crota's End (D2)
  
  // Dungeons (D2 Only)
  82: 'Dungeon',   // Shattered Throne
  83: 'Dungeon',   // Pit of Heresy
  84: 'Dungeon',   // Prophecy
  85: 'Dungeon',   // Grasp of Avarice
  86: 'Dungeon',   // Duality
  87: 'Dungeon',   // Spire of the Watcher
  88: 'Dungeon',   // Ghosts of the Deep
  89: 'Dungeon',   // Warlord's Ruin
  
  // Strikes and Nightfalls (D1 & D2)
  7: 'Nightfall',  // D1 Nightfall
  46: 'Nightfall', // D2 Nightfall
  48: 'Strike',    // D1 Strike
  49: 'Strike',    // D2 Strike
  
  // PvP (D1 & D2)
  5: 'Crucible',   // All PvP
  10: 'Crucible',  // Control
  12: 'Crucible',  // Clash
  15: 'Crucible',  // Iron Banner
  19: 'Crucible',  // Trials of Osiris
  24: 'Crucible',  // Rumble
  25: 'Crucible',  // All PvP modes
  28: 'Crucible',  // Supremacy
  37: 'Crucible',  // Survival
  38: 'Crucible',  // Countdown
  39: 'Crucible',  // Trials of the Nine
  40: 'Crucible',  // Breakthrough
  41: 'Crucible',  // Doubles
  42: 'Crucible',  // Private Match
  43: 'Crucible',  // Scorched
  44: 'Crucible',  // Scorched Team
  65: 'Crucible',  // Showdown (renamed from 48)
  66: 'Crucible',  // Lockdown (renamed from 49)
  50: 'Crucible',  // Momentum Control
  51: 'Crucible',  // Countdown Classic
  52: 'Crucible',  // Elimination
  53: 'Crucible',  // Rift
  
  // Gambit (D2 Only)
  45: 'Gambit',    // Gambit
  47: 'Gambit',    // Gambit Prime
  67: 'Gambit',    // Gambit (new) (renamed from 63)
  
  // Public Events (D1 & D2)
  1: 'Public Event', // Public Events
  68: 'Public Event', // D1 Public Events (renamed from 4)
  
  // Lost Sectors (D2 Only)
  79: 'Lost Sector', // Lost Sectors
  
  // Seasonal Activities (D2 Only)
  80: 'Seasonal',  // Seasonal Activities
  81: 'Seasonal',  // Seasonal Activities
  
  // Exotic Missions (D2 Only)
  90: 'Exotic Mission', // Exotic Missions
  91: 'Exotic Mission', // Exotic Missions
  
  // Seasonal Events (D2 Only)
  92: 'Seasonal Event', // Seasonal Events
  93: 'Seasonal Event', // Seasonal Events
};

export const ACTIVITY_TYPE_OPTIONS: ActivityTypeOption[] = [
  { label: 'All' },
  { label: 'Story', d1Mode: 2, d2Mode: 2 },
  { label: 'Patrol', d1Mode: 3, d2Mode: 3 },
  { label: 'Public Event', d1Mode: 1, d2Mode: 1 },
  { label: 'Raid', d1Mode: 4, d2Mode: 4 },
  { label: 'Dungeon', d2Mode: 82 }, // D2 only
  { label: 'Strike', d1Mode: 48, d2Mode: 49 },
  { label: 'Nightfall', d1Mode: 7, d2Mode: 46 },
  { label: 'Lost Sector', d2Mode: 79 }, // D2 only
  { label: 'Exotic Mission', d2Mode: 90 }, // D2 only
  { label: 'Seasonal', d2Mode: 80 }, // D2 only
  { label: 'Seasonal Event', d2Mode: 92 }, // D2 only
  { label: 'Crucible', d1Mode: 5, d2Mode: 5 },
  { label: 'Gambit', d2Mode: 45 }, // D2 only
  { label: 'Other' }
]; 