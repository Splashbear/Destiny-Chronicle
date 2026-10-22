import {
  baseActivityNameFromVersioned,
  groupActivitiesForDate,
} from './date-activity-grouping';
import { ActivityWithMembership } from '../models/activity-with-membership.model';

function act(
  game: 'D1' | 'D2',
  period: string,
  instanceId: string,
  ref = 1
): ActivityWithMembership {
  return {
    game,
    period,
    activityDetails: { referenceId: ref, mode: 4, instanceId },
    membershipId: 'm1',
  } as unknown as ActivityWithMembership;
}

describe('date-activity-grouping', () => {
  it('strips version suffix after colon', () => {
    expect(baseActivityNameFromVersioned("Vesper's Host: Master")).toBe("Vesper's Host");
    expect(baseActivityNameFromVersioned('Last Wish')).toBe('Last Wish');
  });

  it('groups by game/year/name, sorts newest first, and dedupes instance across accounts', () => {
    const progressTicks: number[] = [];
    const groups = groupActivitiesForDate(
      [
        act('D2', '2024-06-01T12:00:00Z', '10'),
        act('D2', '2024-06-01T13:00:00Z', '10'), // same instance — keep first only
        act('D2', '2024-06-01T14:00:00Z', '12'),
        act('D2', '2024-06-01T11:00:00Z', '13'),
        act('D2', '2023-06-01T10:00:00Z', '11'),
        act('D1', '2023-06-01T09:00:00Z', '11'), // same numeric id, different game
      ],
      {
        getActivityName: () => 'Last Wish: Normal',
        getMappedActivityName: () => null,
        getActivityType: () => 'raid',
        getBaseActivityName: baseActivityNameFromVersioned,
        getActivityImage: () => null,
      },
      {
        progressEvery: 2,
        onProgress: (n) => progressTicks.push(n),
      }
    );

    expect(groups.length).toBe(2);
    const d2 = groups.find(g => g.game === 'D2')!;
    expect(d2.yearGroups.length).toBe(2);
    const y2024 = d2.yearGroups.find(y => y.year === '2024')!;
    expect(y2024.typeGroups[0].name).toBe('Last Wish');
    expect(y2024.typeGroups[0].activities.length).toBe(3); // deduped '10'
    expect(y2024.typeGroups[0].activities[0].period).toContain('14:00');
    const d1 = groups.find(g => g.game === 'D1')!;
    expect(d1.yearGroups[0].typeGroups[0].activities.length).toBe(1);
    expect(progressTicks.length).toBeGreaterThan(0);
  });
});

