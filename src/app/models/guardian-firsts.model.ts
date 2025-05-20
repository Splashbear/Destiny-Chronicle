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
  '5': { name: 'Crota\'s End', game: 'D1' },
  '6': { name: 'King\'s Fall', game: 'D1' },
  '7': { name: 'Wrath of the Machine', game: 'D1' },
  
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
  '3711931140': { name: 'Crota\'s End', game: 'D2' }
}; 