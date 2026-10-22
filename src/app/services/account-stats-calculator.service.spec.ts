import { AccountStatsCalculatorHost, AccountStatsCalculatorService } from './account-stats-calculator.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ActivityHistory } from '../models/activity-history.model';

describe('AccountStatsCalculatorService', () => {
  function makeHost(overrides: Partial<AccountStatsCalculatorHost> = {}): AccountStatsCalculatorHost {
    let token = 0;
    const players: PlayerSearchDisplay[] = [
      {
        displayName: 'P',
        membershipId: '1',
        membershipType: 2,
        game: 'D2',
        platform: 'PlayStation',
      } as PlayerSearchDisplay,
    ];
    const firstsMap: { [k: string]: any[] } = {};
    return {
      beginStatsToken: () => ++token,
      getCurrentStatsToken: () => token,
      getSelectedPlayers: () => players,
      getPlayerKey: (p) => `${p.game}|${p.membershipId}`,
      isD1Player: () => false,
      getCharactersByKey: () => ({
        'D2|1': [{ minutesPlayedTotal: 2, dateLastPlayed: '2024-01-01', classType: 1, light: 10 }],
      }),
      getActivitiesByKey: () => ({
        'D2|1': [
          {
            activityDetails: { referenceId: 1, mode: 4 },
            values: { timePlayedSeconds: { basic: { value: 30 } } },
          } as unknown as ActivityHistory,
        ],
      }),
      getAggregatedTitles: () => [],
      getUnlockedTitlesCount: () => 0,
      getActivityType: () => 'raid',
      getActivityDurationSeconds: () => 30,
      getClassName: () => 'Hunter',
      getGuardianFirstsMap: () => firstsMap,
      setGuardianFirstsMapEntry: (k, v) => {
        firstsMap[k] = v;
      },
      deleteGuardianFirstsMapKey: (k) => {
        delete firstsMap[k];
      },
      setAggregateGuardianFirsts: () => undefined,
      setGuardianFirsts: () => undefined,
      setLoadingAccountStats: () => undefined,
      setLoadingGuardianFirsts: () => undefined,
      setPerPlatformStats: () => undefined,
      setAccountStats: () => undefined,
      syncActivityStore: () => undefined,
      detectChanges: () => undefined,
      checkAndShowAnniversaryBanner: () => undefined,
      ...overrides,
    };
  }

  it('writes account stats and clears loading for matching token', async () => {
    const written: any[] = [];
    const loading: boolean[] = [];
    const activityDb = {
      countActivitiesForMembershipAndGame: async () => 7,
      getFirstCompletions: async () => ({ firstCompletions: [] }),
      getStoryMilestoneFirstCompletionsForMembership: async () => [],
    } as any;
    const svc = new AccountStatsCalculatorService(activityDb);
    const host = makeHost({
      setAccountStats: (s) => written.push(s),
      setLoadingAccountStats: (v) => loading.push(v),
      setPerPlatformStats: (rows) => {
        expect(rows.length).toBe(1);
        expect(rows[0].totalActivities).toBe(7);
      },
    });

    await svc.calculateAccountStats(host);
    expect(written.length).toBe(1);
    expect(written[0].totalActivityCount).toBe(7);
    expect(written[0].totalTime).toBe(120);
    expect(written[0].perType.raid.count).toBe(1);
    expect(loading[0]).toBe(true);
    expect(loading[loading.length - 1]).toBe(false);
  });
});
