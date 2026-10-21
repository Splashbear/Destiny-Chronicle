import { ActivityHistory } from '../models/activity-history.model';

/**
 * Convert archive light activity rows into ActivityHistory (CODE_CLEANUP_SPEC extract).
 */
export function convertLightActivityToHistory(light: any): ActivityHistory {
  return {
    period: light.period,
    activityDetails: {
      referenceId: String(light.activityHash),
      instanceId: String(light.instanceId),
      mode: light.mode
    },
    values: {
      completed: { basic: { value: light.completed } },
      deaths: { basic: { value: light.deaths } },
      kills: { basic: { value: light.kills } },
      assists: { basic: { value: light.assists } },
      timePlayedSeconds: { basic: { value: light.durationSeconds } }
    },
    game: light.game,
    membershipType: light.membershipType
  };
}
