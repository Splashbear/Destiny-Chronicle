import { ActivityBreakdownService } from './activity-breakdown.service';
import { StoredActivity } from './activity-db.service';

describe('ActivityBreakdownService.getActivityCounts', () => {
  function stored(
    membershipId: string,
    instanceId: string,
    seconds: number,
    characterId = 'c1'
  ): StoredActivity {
    return {
      membershipId,
      characterId,
      game: 'D2',
      period: '2020-01-01T00:00:00Z',
      activityDetails: { instanceId, referenceId: '111', mode: 4 },
      values: {
        timePlayedSeconds: { basic: { value: seconds } },
        completed: { basic: { value: 1 } },
      },
    } as StoredActivity;
  }

  function service(rows: StoredActivity[]): ActivityBreakdownService {
    const db = {
      getAllActivitiesForMembershipOptimized(membershipId: string) {
        return Promise.resolve(rows.filter(row => row.membershipId === membershipId));
      },
    };
    const manifest = {
      getActivityName: () => 'Vault of Glass',
      getActivityFamilyName: () => 'Vault of Garden',
    };
    return new ActivityBreakdownService(db as any, manifest as any, {
      getBatch: async () => new Map(),
    } as any);
  }

  it('counts a cross-save copy once when identities match', async () => {
    const breakdown = service([
      stored('ps', 'raid-1', 3600),
      stored('steam', 'raid-1', 3600),
      stored('xbox', 'raid-1', 3600),
    ]);
    const identity = {
      ps: 'D2:splashbear#1078',
      steam: 'D2:splashbear#1078',
      xbox: 'D2:splashbear#1078',
    };
    const rows = await breakdown.getActivityCounts(['ps', 'steam', 'xbox'], identity);
    expect(rows[0].runs).toBe(1);
    expect(rows[0].timeSeconds).toBe(3600);
  });

  it('adds time when two different accounts played the same instance', async () => {
    const breakdown = service([
      stored('splash', 'raid-1', 3600),
      stored('puddle', 'raid-1', 1800),
    ]);
    const identity = {
      splash: 'D2:splashbear#1078',
      puddle: 'D2:puddlecubbs#',
    };
    const rows = await breakdown.getActivityCounts(['splash', 'puddle'], identity);
    expect(rows[0].runs).toBe(2);
    expect(rows[0].timeSeconds).toBe(5400);
  });
});
