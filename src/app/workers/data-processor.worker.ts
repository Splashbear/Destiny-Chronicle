// Web Worker for heavy data processing
// This runs in a separate thread, immune to tab throttling

interface WorkerMessage {
  type: string;
  data: any;
}

interface ProcessedActivity {
  activity: any;
  processedName: string;
  processedType: string;
  processedDate: string;
  processedYear: number;
  processedGame: string;
}

interface ProcessedStats {
  totalTime: number;
  totalActivities: number;
  totalSeals: number;
  totalFirsts: number;
  byGame: { [game: string]: any };
  byYear: { [year: string]: any };
}

interface ProcessedFirsts {
  [family: string]: {
    name: string;
    referenceId: string;
    completionDate: string;
    activityHash: string;
    mode: number;
    pgcrId: string;
  };
}

// Activity type mapping
const ACTIVITY_TYPES: { [key: string]: string } = {
  'raid': 'Raid',
  'dungeon': 'Dungeon',
  'pvp': 'PvP',
  'strike': 'Strike',
  'gambit': 'Gambit',
  'patrol': 'Patrol',
  'lost_sector': 'Lost Sector',
  'seasonal': 'Seasonal',
  'other': 'Other'
};

// D1 raid hashes for variant detection
const D1_RAID_HASHES = [
  // Vault of Glass
  '2659248068', '6409394068', '6711399544',
  // Crota's End
  '2659248069', '6409394069', '6711399545',
  // King's Fall
  '2659248070', '6409394070', '6711399546',
  // Wrath of the Machine
  '2659248071', '6409394071', '6711399547',
  // Wrath of the Machine Hard
  '1099433614', '1342567280', '1387993552'
];

// D1 raid variant mapping
const D1_RAID_VARIANTS: { [hash: string]: string } = {
  '2659248068': 'Normal',
  '6409394068': 'Hard',
  '6711399544': '390 Light',
  '2659248069': 'Normal',
  '6409394069': 'Hard',
  '6711399545': '390 Light',
  '2659248070': 'Normal',
  '6409394070': 'Hard',
  '6711399546': '390 Light',
  '2659248071': 'Normal',
  '6409394071': 'Hard',
  '6711399547': '390 Light',
  '1099433614': 'Hard',
  '1342567280': 'Hard',
  '1387993552': 'Hard'
};

// D1 family mapping (base names only)
const D1_FAMILY_MAP: { [hash: string]: string } = {
  '2659248068': 'Vault of Glass',
  '6409394068': 'Vault of Glass',
  '6711399544': 'Vault of Glass',
  '2659248069': 'Crota\'s End',
  '6409394069': 'Crota\'s End',
  '6711399545': 'Crota\'s End',
  '2659248070': 'King\'s Fall',
  '6409394070': 'King\'s Fall',
  '6711399546': 'King\'s Fall',
  '2659248071': 'Wrath of the Machine',
  '6409394071': 'Wrath of the Machine',
  '6711399547': 'Wrath of the Machine',
  '1099433614': 'Wrath of the Machine',
  '1342567280': 'Wrath of the Machine',
  '1387993552': 'Wrath of the Machine'
};

self.onmessage = function(e: MessageEvent<WorkerMessage>) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'PROCESS_ACTIVITIES':
      const processedActivities = processActivities(data.activities, data.manifestData);
      self.postMessage({ type: 'ACTIVITIES_PROCESSED', data: processedActivities });
      break;
      
    case 'CALCULATE_STATS':
      const stats = calculateAccountStats(data.activities, data.characters);
      self.postMessage({ type: 'STATS_CALCULATED', data: stats });
      break;
      
    case 'PROCESS_FIRSTS':
      const firsts = processFirstCompletions(data.activities, data.characters, data.manifestData);
      self.postMessage({ type: 'FIRSTS_PROCESSED', data: firsts });
      break;
      
    case 'PROCESS_ACTIVITIES_FOR_DISPLAY':
      const displayData = processActivitiesForDisplay(data.activities, data.manifestData);
      self.postMessage({ type: 'DISPLAY_DATA_PROCESSED', data: displayData });
      break;
  }
};

function processActivities(activities: any[], manifestData: any): ProcessedActivity[] {
  return activities.map(activity => {
    const referenceId = activity.activityDetails?.referenceId;
    const mode = activity.activityDetails?.mode;
    
    return {
      activity,
      processedName: getActivityName(referenceId, manifestData),
      processedType: getActivityType(referenceId, mode, manifestData),
      processedDate: activity.period,
      processedYear: new Date(activity.period).getUTCFullYear(),
      processedGame: getGameFromActivity(activity)
    };
  });
}

function processActivitiesForDisplay(activities: any[], manifestData: any): any {
  const processed = processActivities(activities, manifestData);
  
  // Group by game, then by year
  const grouped: { [game: string]: { [year: string]: any[] } } = {};
  
  processed.forEach(processedActivity => {
    const { processedGame, processedYear, activity } = processedActivity;
    
    if (!grouped[processedGame]) {
      grouped[processedGame] = {};
    }
    
    if (!grouped[processedGame][processedYear]) {
      grouped[processedGame][processedYear] = [];
    }
    
    grouped[processedGame][processedYear].push(activity);
  });
  
  return {
    processed,
    grouped
  };
}

function calculateAccountStats(activities: any[], characters: any[]): ProcessedStats {
  let totalTime = 0;
  let totalActivities = activities.length;
  let totalSeals = 0;
  let totalFirsts = 0;
  
  const byGame: { [game: string]: any } = {};
  const byYear: { [year: string]: any } = {};
  
  activities.forEach(activity => {
    // Calculate time
    if (activity.values?.timePlayedSeconds?.basic?.value) {
      totalTime += activity.values.timePlayedSeconds.basic.value;
    }
    
    // Group by game
    const game = getGameFromActivity(activity);
    if (!byGame[game]) {
      byGame[game] = { count: 0, time: 0 };
    }
    byGame[game].count++;
    if (activity.values?.timePlayedSeconds?.basic?.value) {
      byGame[game].time += activity.values.timePlayedSeconds.basic.value;
    }
    
    // Group by year
    const year = new Date(activity.period).getUTCFullYear().toString();
    if (!byYear[year]) {
      byYear[year] = { count: 0, time: 0 };
    }
    byYear[year].count++;
    if (activity.values?.timePlayedSeconds?.basic?.value) {
      byYear[year].time += activity.values.timePlayedSeconds.basic.value;
    }
  });
  
  return {
    totalTime,
    totalActivities,
    totalSeals,
    totalFirsts,
    byGame,
    byYear
  };
}

function processFirstCompletions(activities: any[], characters: any[], manifestData: any): ProcessedFirsts {
  const firstsByFamily: { [family: string]: any } = {};
  
  // Group activities by character
  const activitiesByCharacter: { [charId: string]: any[] } = {};
  activities.forEach(activity => {
    const charId = activity.characterId;
    if (!activitiesByCharacter[charId]) {
      activitiesByCharacter[charId] = [];
    }
    activitiesByCharacter[charId].push(activity);
  });
  
  // Process each character's activities
  Object.entries(activitiesByCharacter).forEach(([charId, charActivities]) => {
    const firsts = getEarliestFirsts(charActivities, manifestData);
    
    Object.entries(firsts).forEach(([family, first]) => {
      if (!first) return;
      
      const key = `${first.name}|${first.referenceId}`;
      if (!firstsByFamily[key] || new Date(first.completionDate) < new Date(firstsByFamily[key].completionDate)) {
        firstsByFamily[key] = first;
      }
    });
  });
  
  return firstsByFamily;
}

function getEarliestFirsts(activities: any[], manifestData: any): { [family: string]: any } {
  const firstsByFamily: { [family: string]: any } = {};
  
  activities.forEach(activity => {
    const referenceId = activity.activityDetails?.referenceId;
    if (!referenceId) return;
    
    const family = getFamilyName(referenceId, manifestData);
    if (!family) return;
    
    const completionDate = activity.period;
    const existing = firstsByFamily[family];
    
    if (!existing || new Date(completionDate) < new Date(existing.completionDate)) {
      firstsByFamily[family] = {
        name: getActivityName(referenceId, manifestData),
        referenceId,
        completionDate,
        activityHash: referenceId,
        mode: activity.activityDetails?.mode,
        pgcrId: activity.activityDetails?.instanceId
      };
    }
  });
  
  return firstsByFamily;
}

function getActivityName(referenceId: string, manifestData: any): string {
  if (!manifestData || !referenceId) return 'Unknown Activity';
  
  const activity = manifestData.activities?.[referenceId];
  if (activity) {
    return activity.displayProperties?.name || 'Unknown Activity';
  }
  
  return 'Unknown Activity';
}

function getActivityType(referenceId: string, mode: number, manifestData: any): string {
  if (!referenceId) return 'Other';
  
  const activity = manifestData?.activities?.[referenceId];
  if (!activity) return 'Other';
  
  const name = activity.displayProperties?.name?.toLowerCase() || '';
  
  // Check for specific activity types
  if (name.includes('raid') || isD1Raid(referenceId)) return 'Raid';
  if (name.includes('dungeon')) return 'Dungeon';
  if (name.includes('strike')) return 'Strike';
  if (name.includes('gambit')) return 'Gambit';
  if (name.includes('patrol')) return 'Patrol';
  if (name.includes('lost sector')) return 'Lost Sector';
  if (name.includes('seasonal') || name.includes('coil')) return 'Seasonal';
  
  // Check by mode
  if (mode === 4) return 'PvP';
  if (mode === 5) return 'PvP';
  if (mode === 6) return 'PvP';
  if (mode === 7) return 'PvP';
  if (mode === 8) return 'PvP';
  if (mode === 9) return 'PvP';
  if (mode === 10) return 'PvP';
  if (mode === 11) return 'PvP';
  if (mode === 12) return 'PvP';
  if (mode === 13) return 'PvP';
  if (mode === 14) return 'PvP';
  if (mode === 15) return 'PvP';
  if (mode === 16) return 'PvP';
  if (mode === 17) return 'PvP';
  if (mode === 18) return 'PvP';
  if (mode === 19) return 'PvP';
  if (mode === 20) return 'PvP';
  if (mode === 21) return 'PvP';
  if (mode === 22) return 'PvP';
  if (mode === 23) return 'PvP';
  if (mode === 24) return 'PvP';
  if (mode === 25) return 'PvP';
  if (mode === 26) return 'PvP';
  if (mode === 27) return 'PvP';
  if (mode === 28) return 'PvP';
  if (mode === 29) return 'PvP';
  if (mode === 30) return 'PvP';
  if (mode === 31) return 'PvP';
  if (mode === 32) return 'PvP';
  if (mode === 33) return 'PvP';
  if (mode === 34) return 'PvP';
  if (mode === 35) return 'PvP';
  if (mode === 36) return 'PvP';
  if (mode === 37) return 'PvP';
  if (mode === 38) return 'PvP';
  if (mode === 39) return 'PvP';
  if (mode === 40) return 'PvP';
  if (mode === 41) return 'PvP';
  if (mode === 42) return 'PvP';
  if (mode === 43) return 'PvP';
  if (mode === 44) return 'PvP';
  if (mode === 45) return 'PvP';
  if (mode === 46) return 'PvP';
  if (mode === 47) return 'PvP';
  if (mode === 48) return 'PvP';
  if (mode === 49) return 'PvP';
  if (mode === 50) return 'PvP';
  if (mode === 51) return 'PvP';
  if (mode === 52) return 'PvP';
  if (mode === 53) return 'PvP';
  if (mode === 54) return 'PvP';
  if (mode === 55) return 'PvP';
  if (mode === 56) return 'PvP';
  if (mode === 57) return 'PvP';
  if (mode === 58) return 'PvP';
  if (mode === 59) return 'PvP';
  if (mode === 60) return 'PvP';
  if (mode === 61) return 'PvP';
  if (mode === 62) return 'PvP';
  if (mode === 63) return 'PvP';
  if (mode === 64) return 'PvP';
  if (mode === 65) return 'PvP';
  if (mode === 66) return 'PvP';
  if (mode === 67) return 'PvP';
  if (mode === 68) return 'PvP';
  if (mode === 69) return 'PvP';
  if (mode === 70) return 'PvP';
  if (mode === 71) return 'PvP';
  if (mode === 72) return 'PvP';
  if (mode === 73) return 'PvP';
  if (mode === 74) return 'PvP';
  if (mode === 75) return 'PvP';
  if (mode === 76) return 'PvP';
  if (mode === 77) return 'PvP';
  if (mode === 78) return 'PvP';
  if (mode === 79) return 'PvP';
  if (mode === 80) return 'PvP';
  if (mode === 81) return 'PvP';
  if (mode === 82) return 'PvP';
  if (mode === 83) return 'PvP';
  if (mode === 84) return 'PvP';
  if (mode === 85) return 'PvP';
  if (mode === 86) return 'PvP';
  if (mode === 87) return 'PvP';
  if (mode === 88) return 'PvP';
  if (mode === 89) return 'PvP';
  if (mode === 90) return 'PvP';
  if (mode === 91) return 'PvP';
  if (mode === 92) return 'PvP';
  if (mode === 93) return 'PvP';
  if (mode === 94) return 'PvP';
  if (mode === 95) return 'PvP';
  if (mode === 96) return 'PvP';
  if (mode === 97) return 'PvP';
  if (mode === 98) return 'PvP';
  if (mode === 99) return 'PvP';
  if (mode === 100) return 'PvP';
  
  return 'Other';
}

function isD1Raid(referenceId: string): boolean {
  return D1_RAID_HASHES.includes(referenceId);
}

function getFamilyName(referenceId: string, manifestData: any): string | null {
  if (isD1Raid(referenceId)) {
    return D1_FAMILY_MAP[referenceId] || null;
  }
  
  const activity = manifestData?.activities?.[referenceId];
  if (!activity) return null;
  
  const name = activity.displayProperties?.name;
  if (!name) return null;
  
  // For D2 activities, use the name as family
  return name;
}

function getGameFromActivity(activity: any): string {
  // Determine game based on activity data
  // This is a simplified version - you might need more sophisticated logic
  if (activity.activityDetails?.referenceId) {
    const referenceId = activity.activityDetails.referenceId;
    if (isD1Raid(referenceId)) {
      return 'D1';
    }
  }
  
  // Default to D2 for now
  return 'D2';
}

export {};
