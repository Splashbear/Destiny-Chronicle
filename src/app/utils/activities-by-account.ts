import { ActivityWithMembership } from '../models/activity-with-membership.model';

export interface ActivitiesByAccountGroup {
  membershipId: string;
  membershipType: number;
  displayName: string;
  platform: string;
  activities: ActivityWithMembership[];
}

/** Group activities by membershipId|game for per-account subsections. */
export function groupActivitiesByAccount(
  activities: ActivityWithMembership[],
  getPlatformName: (membershipType: number) => string
): ActivitiesByAccountGroup[] {
  const accountMap = new Map<string, ActivitiesByAccountGroup>();
  for (const activity of activities) {
    const key = `${activity.membershipId}|${activity.game}`;
    if (!accountMap.has(key)) {
      const displayName = (activity as any)?.displayName || 'Unknown Player';
      const platformName = activity.platform || getPlatformName(activity.membershipType || 0);
      accountMap.set(key, {
        membershipId: activity.membershipId,
        membershipType: activity.membershipType || 0,
        displayName,
        platform: platformName,
        activities: [],
      });
    }
    accountMap.get(key)!.activities.push(activity);
  }
  const groups = Array.from(accountMap.values());
  groups.sort((a, b) => {
    const nameCmp = a.displayName.localeCompare(b.displayName);
    if (nameCmp !== 0) return nameCmp;
    return a.platform.localeCompare(b.platform);
  });
  return groups;
}
