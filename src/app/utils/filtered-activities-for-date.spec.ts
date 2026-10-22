import {
  dedupeAndSortFilteredActivities,
  filterStoredActivitiesByType,
  filteredActivitiesCacheKey,
  stampActivitiesForPlayer,
} from './filtered-activities-for-date';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { StoredActivity } from '../services/activity-db.service';

const manifest = {
  getActivityType: () => 'raid',
  getActivityName: () => 'Raid',
  getActivityIcon: () => '/icon.png',
};

describe('filtered-activities-for-date', () => {
  it('builds a stable cache key', () => {
    expect(
      filteredActivitiesCacheKey(
        '2024-04-23',
        [
          { game: 'D2', membershipId: 'b' },
          { game: 'D1', membershipId: 'a' },
        ],
        'All'
      )
    ).toBe('filtered-2024-04-23-D1:a|D2:b-All');
  });

  it('filters by mode when not All/Dungeon/SRL', () => {
    const rows = [
      { membershipId: 'm', activityDetails: { mode: 4, referenceId: 1 } },
      { membershipId: 'm', activityDetails: { mode: 5, referenceId: 2 } },
    ] as unknown as StoredActivity[];
    const out = filterStoredActivitiesByType(
      rows,
      { membershipId: 'm', membershipType: 2, displayName: 'P', platform: 'PS', game: 'D2' },
      { label: 'Raid', d2Mode: 4 },
      manifest
    );
    expect(out.map(a => a.activityDetails?.mode)).toEqual([4]);
  });

  it('stamps and dedupes by game|membership|instance', () => {
    const stamped = stampActivitiesForPlayer(
      [
        {
          membershipId: 'm',
          game: 'D2',
          period: '2024-01-02T00:00:00Z',
          activityDetails: { instanceId: '1', referenceId: 9 },
        } as unknown as StoredActivity,
      ],
      { membershipId: 'm', membershipType: 3, displayName: 'Splash', platform: 'Steam', game: 'D2' },
      manifest
    );
    expect(stamped[0].displayName).toBe('Splash');
    expect(stamped[0].iconPath).toBe('/icon.png');

    const dup: ActivityWithMembership = {
      ...stamped[0],
      period: '2024-01-01T00:00:00Z',
    };
    const deduped = dedupeAndSortFilteredActivities([stamped[0], dup]);
    expect(deduped.length).toBe(1);
    expect(deduped[0].period).toBe('2024-01-02T00:00:00Z');
  });
});
