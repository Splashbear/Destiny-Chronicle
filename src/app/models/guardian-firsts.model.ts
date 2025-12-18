export interface ActivityFirstCompletion {
  type: 'raid' | 'dungeon' | 'strike' | 'nightfall' | 'crucible' | 'gambit' | 'other';
  name: string;
  game: 'D1' | 'D2';
  period: string;
  completionDate: string;
  instanceId: string;
  referenceId: string;
  mode: number;
  characterId: string;
  membershipId: string;
  membershipType?: number;
  /** Optional class string for the character that completed this first */
  characterClass?: string;
  completed: number;
  isSolo?: boolean;
  isSoloFlawless?: boolean;
}

export interface GuardianFirsts {
  membershipId: string;
  characterId: string;
  displayName: string;
  platform: string;
  firstCompletions: ActivityFirstCompletion[];
}

// Map of raid referenceIds (D2) and modes (D1) to their names
export const RAID_NAMES: Record<string, { name: string; game: 'D1' | 'D2' }> = {
  // Destiny 1 Raids
  '4': { name: 'Vault of Glass', game: 'D1' },
  // Vault of Glass
  '3801607287': { name: 'Vault of Glass', game: 'D1' },
  '708693006': { name: 'Vault of Glass', game: 'D1' },
  '2659248071': { name: 'Vault of Glass', game: 'D1' },
  '2659248068': { name: 'Vault of Glass', game: 'D1' },
  '2659248069': { name: 'Vault of Glass', game: 'D1' },
  '856898338': { name: 'Vault of Glass', game: 'D1' },
  '4038697181': { name: 'Vault of Glass', game: 'D1' },
  // Crota's End
  '5': { name: 'Crota\'s End', game: 'D1' },
  '898834093': { name: 'Crota\'s End', game: 'D1' },
  '112157962': { name: 'Crota\'s End', game: 'D1' },
  '3879860662': { name: 'Crota\'s End', game: 'D1' },
  '1836893116': { name: 'Crota\'s End', game: 'D1' },
  // King's Fall
  '6': { name: 'King\'s Fall', game: 'D1' },
  '1733556769': { name: 'King\'s Fall', game: 'D1' },
  '421023204': { name: 'King\'s Fall', game: 'D1' },
  '1661734046': { name: 'King\'s Fall', game: 'D1' },
  '2964135793': { name: 'King\'s Fall', game: 'D1' },
  // Wrath of the Machine
  '7': { name: 'Wrath of the Machine', game: 'D1' },
  '2578867903': { name: 'Wrath of the Machine', game: 'D1' },
  '4007500989': { name: 'Wrath of the Machine', game: 'D1' },
  '1099433614': { name: 'Wrath of the Machine', game: 'D1' },
  '1342567280': { name: 'Wrath of the Machine', game: 'D1' },
  '260765522': { name: 'Wrath of the Machine', game: 'D1' },
  
  // Destiny 2 Raids
  '2693136601': { name: 'Leviathan', game: 'D2' },
  '2693136600': { name: 'Leviathan (Prestige)', game: 'D2' },
  '3333172150': { name: 'Eater of Worlds', game: 'D2' },
  '3089205900': { name: 'Spire of Stars', game: 'D2' },
  '2122313384': { name: 'Crown of Sorrow', game: 'D2' },
  '3458480158': { name: 'Garden of Salvation', game: 'D2' },
  '910380154': { name: 'Deep Stone Crypt', game: 'D2' },
  '1374392663': { name: 'Vow of the Disciple', game: 'D2' },
  '1441982566': { name: 'Vault of Glass', game: 'D2' },
  '2381413762': { name: 'King\'s Fall', game: 'D2' },
  '3711931140': { name: 'Crota\'s End', game: 'D2' },
  '2381413763': { name: 'Root of Nightmares', game: 'D2' },
  '2381413764': { name: 'Root of Nightmares', game: 'D2' },
  '548750096': { name: 'Scourge of the Past', game: 'D2' },
  '1541433876': { name: 'Salvation\'s Edge', game: 'D2' },
  '940375169': { name: 'Salvation\'s Edge', game: 'D2' },
  '4129614942': { name: 'Salvation\'s Edge', game: 'D2' }
}; 