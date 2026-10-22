import { ActivityWithMembership } from '../models/activity-with-membership.model';

/**
 * Locate an activity in grouped Activities-tab rows by instance id + D1 flag (CODE_CLEANUP_SPEC).
 */
export function findDisplayedActivity(
  groupedActivitiesByAccount: any[],
  instanceId: string,
  isD1: boolean
): ActivityWithMembership | undefined {
  for (const group of groupedActivitiesByAccount) {
    for (const yearGroup of group.yearGroups ?? []) {
      for (const typeGroup of yearGroup.typeGroups ?? []) {
        for (const activity of typeGroup.activities ?? []) {
          const id = activity?.activityDetails?.instanceId;
          const activityIsD1 = (activity?.game || group.game) === 'D1';
          if (
            id != null &&
            String(id) === instanceId &&
            activityIsD1 === isD1
          ) {
            return activity;
          }
        }
      }
    }
  }
  return undefined;
}
