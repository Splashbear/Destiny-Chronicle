import {
  accountHasGames,
  formatSearchAccountMeta,
  isMeaningfulLastPlayed,
  linkedProfilePlayByMembership,
  sortSearchAccountsByPlayActivity,
} from './search-account-activity';

describe('search-account-activity', () => {
  it('treats missing and 0001-01-01 last-played as empty', () => {
    expect(isMeaningfulLastPlayed(null)).toBe(false);
    expect(isMeaningfulLastPlayed('')).toBe(false);
    expect(isMeaningfulLastPlayed('0001-01-01T00:00:00Z')).toBe(false);
    expect(isMeaningfulLastPlayed('2024-06-01T12:00:00Z')).toBe(true);
  });

  it('uses characterCount and dateLastPlayed for hasGames', () => {
    expect(accountHasGames({ characterCount: 0 })).toBe(false);
    expect(accountHasGames({ characterCount: 2 })).toBe(true);
    expect(accountHasGames({ dateLastPlayed: '0001-01-01T00:00:00Z' })).toBe(false);
    expect(accountHasGames({ dateLastPlayed: '2023-01-01T00:00:00Z' })).toBe(true);
    expect(accountHasGames({})).toBeNull();
  });

  it('indexes LinkedProfiles by type|id and id', () => {
    const map = linkedProfilePlayByMembership([
      {
        membershipType: 3,
        membershipId: '111',
        dateLastPlayed: '2024-01-01T00:00:00Z',
        isCrossSavePrimary: true,
      },
      {
        membershipType: 6,
        membershipId: '222',
        dateLastPlayed: '0001-01-01T00:00:00Z',
      },
    ]);
    expect(map.get('3|111')?.dateLastPlayed).toContain('2024');
    expect(map.get('111')?.isCrossSavePrimary).toBe(true);
    expect(accountHasGames({ dateLastPlayed: map.get('6|222')?.dateLastPlayed })).toBe(false);
  });

  it('sorts accounts with games first', () => {
    const sorted = sortSearchAccountsByPlayActivity([
      { membershipId: 'empty', hasGames: false },
      { membershipId: 'played', hasGames: true, dateLastPlayed: '2024-01-01T00:00:00Z' },
      { membershipId: 'unknown', hasGames: null },
    ]);
    expect(sorted.map((a) => a.membershipId)).toEqual(['played', 'unknown', 'empty']);
  });

  it('formats meta for empty vs played accounts', () => {
    expect(
      formatSearchAccountMeta({ game: 'D2', platform: 'Stadia', hasGames: false })
    ).toBe('No games found');
    expect(
      formatSearchAccountMeta({
        game: 'D2',
        platform: 'Steam',
        hasGames: true,
        archiveGameCount: 2501,
      })
    ).toBe('D2 · 2,501 games');
    expect(
      formatSearchAccountMeta({ game: 'D1', platform: 'Xbox', hasGames: true })
    ).toBe('D1 · Xbox');
  });
});
