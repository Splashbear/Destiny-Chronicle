export interface RaidFirstCompletion {
  raidName: string;
  referenceId: string;
  mode: number;
  completionDate: string;
  activityDuration: number;
  instanceId: string;
  game: 'D1' | 'D2';
}

export interface GuardianFirsts {
  membershipId: string;
  characterId: string;
  displayName: string;
  platform: string;
  raidFirstCompletions: RaidFirstCompletion[];
  firstRaid?: {
    instanceId: string;
    date: string;
    name: string;
  };
  firstDungeon?: {
    instanceId: string;
    date: string;
    name: string;
  };
  firstNightfall?: {
    instanceId: string;
    date: string;
    name: string;
  };
  firstCrucible?: {
    instanceId: string;
    date: string;
    name: string;
  };
  firstGambit?: {
    instanceId: string;
    date: string;
    name: string;
  };
  firstStrike?: {
    instanceId: string;
    date: string;
    name: string;
  };
}

// Map of raid modes to their names
export const RAID_NAMES: { [mode: number]: { name: string, game: 'D1' | 'D2' } } = {
  8: { name: 'Vault of Glass', game: 'D1' },
  9: { name: 'Crota\'s End', game: 'D1' },
  16: { name: 'King\'s Fall', game: 'D1' },
  17: { name: 'Wrath of the Machine', game: 'D1' },
  31: { name: 'Leviathan', game: 'D2' },
  32: { name: 'Eater of Worlds', game: 'D2' },
  54: { name: 'Spire of Stars', game: 'D2' },
  55: { name: 'Last Wish', game: 'D2' },
  56: { name: 'Scourge of the Past', game: 'D2' },
  57: { name: 'Crown of Sorrow', game: 'D2' },
  58: { name: 'Garden of Salvation', game: 'D2' },
  59: { name: 'Deep Stone Crypt', game: 'D2' },
  60: { name: 'Vault of Glass', game: 'D2' },
  61: { name: 'Vow of the Disciple', game: 'D2' },
  62: { name: 'King\'s Fall', game: 'D2' },
  63: { name: 'Root of Nightmares', game: 'D2' },
  64: { name: 'Crota\'s End', game: 'D2' }
}; 