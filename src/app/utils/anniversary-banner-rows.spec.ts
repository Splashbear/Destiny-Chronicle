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
    expect(rows[0].iconUrl).toBe('/icon.png');
    expect(rows[0].pgcrImageUrl).toBe('/pgcr.png');
  });

  it('falls back iconUrl to pgcr art when resolver returns Bungie missing_icon', () => {
    const first: ActivityFirstCompletion = {
      type: 'dungeon',
      name: 'Pit of Heresy: Normal',
      game: 'D2',
      period: '2019-11-02T12:00:00Z',
      completionDate: '2019-11-02T12:00:00Z',
      instanceId: '3',
      referenceId: '1375089621',
      mode: 82,
      characterId: 'c',
      membershipId: 'm',
      completed: 1,
    };
    const rows = buildAnniversaryBannerRows({
      selectedDate: '2026-11-02',
      selectedPlayersLength: 1,
      rawFirstsByPlayer: [[first]],
      displayedRaidDungeonFirsts: [first],
      firstEvers: [],
      resolvers: {
        getActivityName: () => 'Pit of Heresy: Normal',
        formatDate: () => 'November 2, 2019',
        resolveIconUrl: () => 'https://www.bungie.net/img/misc/missing_icon_d2.png',
        resolveFirstCompletionImage: () =>
          'https://www.bungie.net/img/destiny_content/pgcr/dungeon_pit_of_heresy.jpg',
        resolvePgcrImageUrl: () => null,
        getFirstClearFireteam: () => null,
        resolvePlatform: () => 'PlayStation',
      },
    });
    expect(rows[0].iconUrl).toContain('dungeon_pit_of_heresy.jpg');
  });

  it('falls back iconUrl to pgcr art when manifest icon is missing', () => {
    const first: ActivityFirstCompletion = {
      type: 'dungeon',
      name: 'Pit of Heresy: Normal',
      game: 'D2',
      period: '2019-11-02T12:00:00Z',
      completionDate: '2019-11-02T12:00:00Z',
      instanceId: '2',
      referenceId: '1375089621',
      mode: 82,
      characterId: 'c',
      membershipId: 'm',
      completed: 1,
      fireteamSize: 4,
    };
    const rows = buildAnniversaryBannerRows({
      selectedDate: '2026-11-02',
      selectedPlayersLength: 1,
      rawFirstsByPlayer: [[first]],
      displayedRaidDungeonFirsts: [first],
      firstEvers: [],
      resolvers: {
        getActivityName: () => 'Pit of Heresy: Normal',
        formatDate: () => 'November 2, 2019',
        resolveIconUrl: () => null,
        resolveFirstCompletionImage: () =>
          'https://www.bungie.net/img/destiny_content/pgcr/dungeon_pit_of_heresy.jpg',
        resolvePgcrImageUrl: () => null,
        getFirstClearFireteam: () => null,
        resolvePlatform: () => 'PlayStation',
      },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].iconUrl).toBe(
      'https://www.bungie.net/img/destiny_content/pgcr/dungeon_pit_of_heresy.jpg'
    );
    expect(rows[0].pgcrImageUrl).toBe(
      'https://www.bungie.net/img/destiny_content/pgcr/dungeon_pit_of_heresy.jpg'
    );
  });
});
