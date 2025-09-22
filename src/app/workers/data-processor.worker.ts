// Simplified Web Worker for data processing
// This runs in a separate thread, immune to tab throttling

interface WorkerMessage {
  type: string;
  data: any;
}

interface WorkerResponse {
  type: string;
  data: any;
}

// Simple activity processing
function processActivities(activities: any[]): any[] {
  if (!activities || activities.length === 0) {
    return [];
  }

  return activities.map(activity => {
    return {
      activity,
      processedName: activity.activityDetails?.referenceId ? `Activity ${activity.activityDetails.referenceId}` : 'Unknown Activity',
      processedType: 'Other',
      processedDate: activity.period,
      processedYear: new Date(activity.period).getUTCFullYear(),
      processedGame: 'D2' // Default to D2 for now
    };
  });
}

// Simple stats calculation
function calculateStats(activities: any[]): any {
  if (!activities || activities.length === 0) {
    return {
      totalTime: 0,
      totalActivities: 0,
      totalSeals: 0,
      totalFirsts: 0,
      byGame: {},
      byYear: {}
    };
  }

  let totalTime = 0;
  const byGame: { [game: string]: any } = {};
  const byYear: { [year: string]: any } = {};

  activities.forEach(activity => {
    // Calculate time
    if (activity.values?.timePlayedSeconds?.basic?.value) {
      totalTime += activity.values.timePlayedSeconds.basic.value;
    }

    // Group by game
    const game = 'D2'; // Simplified
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
    totalActivities: activities.length,
    totalSeals: 0,
    totalFirsts: 0,
    byGame,
    byYear
  };
}

// Simple activity grouping
function groupActivities(activities: any[]): any {
  if (!activities || activities.length === 0) {
    return { processed: [], grouped: {} };
  }

  const processed = processActivities(activities);
  
  // Simple grouping by game and year
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

// Main worker message handler
self.onmessage = function(e: MessageEvent<WorkerMessage>) {
  try {
    const { type, data } = e.data;
    let result: any = null;

    switch (type) {
      case 'PROCESS_ACTIVITIES':
        result = processActivities(data.activities || []);
        self.postMessage({ type: 'ACTIVITIES_PROCESSED', data: result });
        break;
        
      case 'CALCULATE_STATS':
        result = calculateStats(data.activities || []);
        self.postMessage({ type: 'STATS_CALCULATED', data: result });
        break;
        
      case 'PROCESS_ACTIVITIES_FOR_DISPLAY':
        result = groupActivities(data.activities || []);
        self.postMessage({ type: 'DISPLAY_DATA_PROCESSED', data: result });
        break;
        
      default:
        console.warn('[Worker] Unknown message type:', type);
        self.postMessage({ type: 'ERROR', data: { message: 'Unknown message type' } });
    }
  } catch (error) {
    console.error('[Worker] Error processing message:', error);
    self.postMessage({ 
      type: 'ERROR', 
      data: { 
        message: 'Worker processing error', 
        error: error instanceof Error ? error.message : String(error)
      } 
    });
  }
};

export {};