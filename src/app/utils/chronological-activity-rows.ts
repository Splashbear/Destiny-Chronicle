import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { baseActivityNameFromVersioned } from './date-activity-grouping';

export interface ChronologicalActivityRowLike {
  activity: ActivityWithMembership;
  activityName: string;
  activityType: string;
  version: string;
  isD1: boolean;
  game: 'D1' | 'D2';
}

export interface ChronoTypeGroupLike {
  name?: string;
  type?: string;
  isD1?: boolean;
  activities?: ActivityWithMembership[];
}

/**
 * Flatten year type-groups into chronological rows (CODE_CLEANUP_SPEC).
 */
export function buildChronologicalRowsForYear(
  typeGroups: ChronoTypeGroupLike[],
  game: 'D1' | 'D2',
  sort: 'oldest' | 'newest',
  resolvers: {
    getActivityName(referenceId: any, isD1: boolean): string;
    getMappedActivityName(referenceId: string): string | null;
    getActivityVersion(activityName: string): string;
  }
): ChronologicalActivityRowLike[] {
  const rows: ChronologicalActivityRowLike[] = [];
  for (const typeGroup of typeGroups ?? []) {
    const isD1 = typeGroup.isD1 ?? game === 'D1';
    for (const activity of typeGroup.activities ?? []) {
      const refId = activity.activityDetails?.referenceId;
      let activityName = resolvers.getActivityName(refId, isD1);
      if (!activityName || activityName === 'Unknown Activity') {
        activityName =
          resolvers.getMappedActivityName(String(refId)) || typeGroup.name || 'Unknown Activity';
      }
      const version = resolvers.getActivityVersion(activityName);
      const displayName = baseActivityNameFromVersioned(activityName);
      rows.push({
        activity,
        activityName: displayName,
        activityType: typeGroup.type || '',
        version,
        isD1,
        game: activity.game ?? game,
      });
    }
  }
  const dir = sort === 'oldest' ? 1 : -1;
  rows.sort((a, b) => {
    const ta = new Date(a.activity.period).getTime();
    const tb = new Date(b.activity.period).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return (ta - tb) * dir;
  });
  return rows;
}
