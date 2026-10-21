import { ActivityWithMembership } from '../models/activity-with-membership.model';

const VERSION_ORDER = ['Normal', 'Standard', 'Explorer', 'Eternity', 'Ultimatum', 'Master'];

export function groupActivitiesByVersion(
  activities: ActivityWithMembership[],
  resolvers: {
    getActivityName(referenceId: any, isD1: boolean): string;
    getMappedActivityName(referenceId: string): string | null;
    getActivityVersion(activityName: string): string;
  }
): Array<{ version: string; activities: ActivityWithMembership[] }> {
  const versionMap = new Map<string, ActivityWithMembership[]>();

  for (const activity of activities) {
    let activityName = resolvers.getActivityName(
      activity.activityDetails?.referenceId,
      activity.game === 'D1'
    );
    if (!activityName || activityName === 'Unknown Activity') {
      activityName =
        resolvers.getMappedActivityName(String(activity.activityDetails?.referenceId)) ||
        'Unknown Activity';
    }
    const version = resolvers.getActivityVersion(activityName);
    if (!versionMap.has(version)) {
      versionMap.set(version, []);
    }
    versionMap.get(version)!.push(activity);
  }

  return Array.from(versionMap.entries())
    .map(([version, versionActivities]) => ({ version, activities: versionActivities }))
    .sort((a, b) => {
      const aIndex = VERSION_ORDER.indexOf(a.version);
      const bIndex = VERSION_ORDER.indexOf(b.version);
      if (aIndex === -1 && bIndex === -1) return a.version.localeCompare(b.version);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
}
