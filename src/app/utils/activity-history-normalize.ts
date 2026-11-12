import { ActivityHistory } from '../models/activity-history.model';
import { normalizeCompletedFlag } from './activity-completed';

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
      // Coerce boolean archive flags to 0|1 so Breakdown `=== 1` and Firsts agree.
      completed: { basic: { value: normalizeCompletedFlag(light.completed) } },
      deaths: { basic: { value: light.deaths } },
      kills: { basic: { value: light.kills } },
      assists: { basic: { value: light.assists } },
      timePlayedSeconds: { basic: { value: light.durationSeconds } }
    },
    game: light.game,
    membershipType: light.membershipType
  };
}
