import { buildAnniversaryBannerRows } from './anniversary-banner-rows';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

describe('buildAnniversaryBannerRows', () => {
  it('returns empty without date or players', () => {
    expect(
      buildAnniversaryBannerRows({
        selectedDate: '',
        selectedPlayersLength: 1,
        rawFirstsByPlayer: [],
        displayedRaidDungeonFirsts: [],
        firstEvers: [],
        resolvers: {} as any,
      })
    ).toEqual([]);
  });

  it('builds a guardian-first anniversary row for matching month-day', () => {
    const first: ActivityFirstCompletion = {
      type: 'raid',
      name: 'Last Wish',
      game: 'D2',
      period: '2020-06-15T12:00:00Z',
      completionDate: '2020-06-15T12:00:00Z',
      instanceId: '1',
      referenceId: '123',
      mode: 4,
      characterId: 'c',
      membershipId: 'm',
      completed: 1,
    };
    const rows = buildAnniversaryBannerRows({
      selectedDate: '2024-06-15',
      selectedPlayersLength: 1,
      rawFirstsByPlayer: [[first]],
      displayedRaidDungeonFirsts: [first],
      firstEvers: [],
      resolvers: {
        getActivityName: () => 'Last Wish',
        formatDate: () => 'Jun 15, 2020',
        resolveIconUrl: () => '/icon.png',
        resolveFirstCompletionImage: () => '/pgcr.png',
        resolvePgcrImageUrl: () => null,
        getFirstClearFireteam: () => null,
        resolvePlatform: () => 'Steam',
      },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].activityName).toBe('Last Wish');
    expect(rows[0].yearsAgo).toBe(4);
    expect(rows[0].platform).toBe('Steam');
  });
});
