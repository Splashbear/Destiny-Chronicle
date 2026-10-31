import {
  accountHasGames,
  characterCountFromD2ProfileResponse,
  formatSearchAccountMeta,
  isMeaningfulLastPlayed,
  linkedProfilePlayByMembership,
  sortSearchAccountsByPlayActivity,
} from './search-account-activity';

describe('search-account-activity', () => {
  it('treats missing and 0001-01-01 last-played as empty', () => {
    expect(isMeaningfulLastPlayed(null)).toBe(false);
    expect(isMeaningfulLastPlayed('0001-01-01T00:00:00Z')).toBe(false);
    expect(isMeaningfulLastPlayed('2024-06-01T12:00:00Z')).toBe(true);
  });

  it('uses characterCount ahead of last-played', () => {
    expect(accountHasGames({ characterCount: 0, dateLastPlayed: '2024-01-01T00:00:00Z' })).toBe(
      false
    );
    expect(accountHasGames({ characterCount: 2 })).toBe(true);
  });

  it('reads character counts from GetProfile responses', () => {
    expect(
      characterCountFromD2ProfileResponse({
        ErrorCode: 1,
        Response: { profile: { data: { characterIds: ['1', '2'] } } },
      })
    ).toBe(2);
    expect(
      characterCountFromD2ProfileResponse({
        ErrorCode: 1,
        Response: { profile: { data: { characterIds: [] } }, characters: { data: {} } },
      })
    ).toBe(0);
    expect(characterCountFromD2ProfileResponse({ ErrorCode: 5 })).toBeNull();
  });

  it('indexes LinkedProfiles and sorts playable first', () => {
    const map = linkedProfilePlayByMembership([
      {
        membershipType: 3,
        membershipId: '111',
        dateLastPlayed: '2024-01-01T00:00:00Z',
      },
      {
        membershipType: 5,
        membershipId: '222',
        dateLastPlayed: '0001-01-01T00:00:00Z',
      },
    ]);
    expect(accountHasGames({ dateLastPlayed: map.get('5|222')?.dateLastPlayed })).toBe(false);
    expect(
      sortSearchAccountsByPlayActivity([
        { membershipId: 'empty', hasGames: false },
        { membershipId: 'played', hasGames: true },
      ]).map((a) => a.membershipId)
    ).toEqual(['played', 'empty']);
  });

  it('formats empty vs played meta', () => {
    expect(formatSearchAccountMeta({ game: 'D2', platform: 'Stadia', hasGames: false })).toBe(
      'No games found'
    );
    expect(
      formatSearchAccountMeta({
        game: 'D2',
        platform: 'Steam',
        hasGames: true,
        archiveGameCount: 2501,
      })
    ).toBe('D2 · 2,501 games');
  });
});
