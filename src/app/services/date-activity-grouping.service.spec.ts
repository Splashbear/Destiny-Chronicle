import {
  DateActivityGroupingHost,
  DateActivityGroupingService,
} from './date-activity-grouping.service';
import { ActivityWithMembership } from '../models/activity-with-membership.model';

describe('DateActivityGroupingService', () => {
  it('clears groups and first-ever when empty', async () => {
    let groupsSet: any = 'unset';
    let firstCleared = false;
    let firstFromDb = false;
    const host: DateActivityGroupingHost = {
      getFilteredActivitiesForDate: () => [],
      setGroupedActivitiesByAccount: (g) => {
        groupsSet = g;
      },
      clearFirstEverActivity: () => {
        firstCleared = true;
      },
      setFirstEverActivityFromDb: async () => {
        firstFromDb = true;
      },
      updateLoadingProgress: () => undefined,
      detectChanges: () => undefined,
      getActivityName: () => 'X',
      getMappedActivityName: () => null,
      getActivityType: () => 'raid',
      getBaseActivityName: (n) => n,
      getActivityImage: () => null,
    };
    await new DateActivityGroupingService().processAndGroupActivities(host);
    expect(groupsSet).toEqual([]);
    expect(firstCleared).toBe(true);
    expect(firstFromDb).toBe(true);
  });

  it('groups activities and reports process progress', async () => {
    const progress: Array<{ current: number; total: number }> = [];
    // Fixed noon UTC so local TZ cannot split years across Dec 31 / Jan 1.
    const activities = Array.from({ length: 201 }, (_, i) => ({
      game: 'D2' as const,
      period: `2024-06-15T12:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
      activityDetails: { referenceId: 1, mode: 4, instanceId: String(i) },
      membershipId: 'm',
    })) as unknown as ActivityWithMembership[];

    let out: any[] = [];
    const host: DateActivityGroupingHost = {
      getFilteredActivitiesForDate: () => activities,
      setGroupedActivitiesByAccount: (g) => {
        out = g;
      },
      clearFirstEverActivity: () => undefined,
      setFirstEverActivityFromDb: async () => undefined,
      updateLoadingProgress: (_p, current, total) => progress.push({ current, total }),
      detectChanges: () => undefined,
      getActivityName: () => 'Raid: Normal',
      getMappedActivityName: () => null,
      getActivityType: () => 'raid',
      getBaseActivityName: (n) => n.split(': ')[0],
      getActivityImage: () => null,
    };

    await new DateActivityGroupingService().processAndGroupActivities(host, 'Organizing');
    expect(out.length).toBe(1);
    expect(out[0].yearGroups[0].typeGroups[0].activities.length).toBe(201);
    expect(progress.some(p => p.current === 200 && p.total === 201)).toBe(true);
    expect(progress[progress.length - 1]).toEqual({ current: 201, total: 201 });
  });
});
