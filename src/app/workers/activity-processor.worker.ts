// Web Worker for heavy activity data processing
// This runs in a separate thread to prevent UI blocking

interface ActivityProcessingMessage {
  type: 'PROCESS_ACTIVITIES' | 'GROUP_ACTIVITIES' | 'CALCULATE_STATS';
  data: any;
  id: string;
}

interface ActivityProcessingResponse {
  type: 'PROCESS_ACTIVITIES_RESULT' | 'GROUP_ACTIVITIES_RESULT' | 'CALCULATE_STATS_RESULT';
  data: any;
  id: string;
  error?: string;
}

// Activity Family Map for grouping (copied from activity-db.service.ts)
const ACTIVITY_FAMILY_MAP: Record<string, string> = {
  // D2 Raids
  '89727599': 'Leviathan: Normal',
  '287649202': 'Leviathan: Normal',
  '1042180643': 'Garden of Salvation: Normal',
  '910380154': 'Deep Stone Crypt: Normal',
  '1441982566': 'Vow of the Disciple: Standard',
  '2122313384': 'Last Wish: Standard',
  '3711931140': 'Vault of Glass: Normal',
  '1374392663': "King's Fall: Standard",
  '107319834': "Crota's End: Standard",
  '2381413764': 'Root of Nightmares: Normal',
  '4169648176': 'The Pantheon: Oryx Exalted',
  '4169648177': 'The Pantheon: Rhulk Indomitable',
  '4169648179': 'The Pantheon: Atraks Sovereign',
  '4169648182': 'The Pantheon: Nezarec Sublime',
  
  // D2 Dungeons
  '2032534090': 'The Shattered Throne: Standard',
  '1347078175': 'The Shattered Throne: Standard',
  '4078656646': 'The Pit of Heresy: Standard',
  '1375089621': 'Prophecy: Standard',
  '3637651331': 'Prophecy: Explorer',
  '4078656647': 'Grasp of Avarice: Standard',
  '4078656648': 'Duality: Standard',
  '4078656649': 'Spire of the Watcher: Standard',
  '4078656650': 'Ghosts of the Deep: Standard',
  '4078656651': 'Warlord\'s Ruin: Standard',
  '4078656652': 'Vesper\'s Host: Standard',
  
  // D1 Raids
  '3872525353': 'Vault of Glass: Normal',
  '4179289725': "Crota's End: Normal",
  '2693136600': 'King\'s Fall: Normal',
  '2693136601': 'King\'s Fall: Hard',
  '2693136602': 'King\'s Fall: Heroic',
  '2693136603': 'King\'s Fall: Prestige',
  '2693136604': 'King\'s Fall: Master',
  '2693136605': 'King\'s Fall: Expert',
  '2693136606': 'Wrath of the Machine: Normal',
  '2693136607': 'Wrath of the Machine: Hard',
  '2693136608': 'Wrath of the Machine: Heroic',
  '2693136609': 'Wrath of the Machine: Prestige',
  '2693136610': 'Wrath of the Machine: Master',
  '2693136611': 'Wrath of the Machine: Expert'
};

// Group activities by base name
function groupActivitiesByBaseName(activities: any[]): any[] {
  const grouped = new Map<string, any[]>();
  
  for (const activity of activities) {
    const hash = activity.activityDetails?.referenceId?.toString();
    const baseName = ACTIVITY_FAMILY_MAP[hash] || activity.activityName || 'Unknown Activity';
    
    // Extract base name (remove version suffix)
    const baseNameOnly = baseName.split(':')[0].trim();
    
    if (!grouped.has(baseNameOnly)) {
      grouped.set(baseNameOnly, []);
    }
    grouped.get(baseNameOnly)!.push(activity);
  }
  
  return Array.from(grouped.entries()).map(([baseName, activities]) => ({
    baseName,
    activities,
    count: activities.length
  }));
}

// Calculate activity statistics
function calculateActivityStats(activities: any[]): any {
  const stats = {
    totalActivities: activities.length,
    totalTimePlayed: 0,
    activitiesByType: new Map<string, number>(),
    activitiesByCharacter: new Map<string, number>(),
    platformStats: new Map<string, any>()
  };
  
  for (const activity of activities) {
    // Total time played
    if (activity.values?.timePlayedSeconds?.basic?.value) {
      stats.totalTimePlayed += activity.values.timePlayedSeconds.basic.value;
    }
    
    // Activities by type
    const activityType = activity.activityDetails?.mode || 'unknown';
    const currentCount = stats.activitiesByType.get(activityType) || 0;
    stats.activitiesByType.set(activityType, currentCount + 1);
    
    // Activities by character
    const characterId = activity.characterId || 'unknown';
    const charCount = stats.activitiesByCharacter.get(characterId) || 0;
    stats.activitiesByCharacter.set(characterId, charCount + 1);
  }
  
  return {
    ...stats,
    activitiesByType: Object.fromEntries(stats.activitiesByType),
    activitiesByCharacter: Object.fromEntries(stats.activitiesByCharacter),
    platformStats: Object.fromEntries(stats.platformStats)
  };
}

// Process activities (filter, sort, transform)
function processActivities(activities: any[], filters: any): any[] {
  let processed = [...activities];
  
  // Apply date filter
  if (filters.startDate) {
    const startDate = new Date(filters.startDate);
    processed = processed.filter(activity => 
      new Date(activity.period) >= startDate
    );
  }
  
  if (filters.endDate) {
    const endDate = new Date(filters.endDate);
    processed = processed.filter(activity => 
      new Date(activity.period) <= endDate
    );
  }
  
  // Apply activity type filter
  if (filters.activityType && filters.activityType !== 'all') {
    processed = processed.filter(activity => {
      const hash = activity.activityDetails?.referenceId?.toString();
      const baseName = ACTIVITY_FAMILY_MAP[hash] || activity.activityName || '';
      return baseName.toLowerCase().includes(filters.activityType.toLowerCase());
    });
  }
  
  // Sort by date (newest first)
  processed.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
  
  return processed;
}

// Message handler
self.onmessage = function(e: MessageEvent<ActivityProcessingMessage>) {
  const { type, data, id } = e.data;
  
  try {
    let result: any;
    
    switch (type) {
      case 'PROCESS_ACTIVITIES':
        result = processActivities(data.activities, data.filters);
        break;
        
      case 'GROUP_ACTIVITIES':
        result = groupActivitiesByBaseName(data.activities);
        break;
        
      case 'CALCULATE_STATS':
        result = calculateActivityStats(data.activities);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    const response: ActivityProcessingResponse = {
      type: `${type}_RESULT` as any,
      data: result,
      id
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: ActivityProcessingResponse = {
      type: `${type}_RESULT` as any,
      data: null,
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    self.postMessage(response);
  }
};

// Export for TypeScript
export {};
