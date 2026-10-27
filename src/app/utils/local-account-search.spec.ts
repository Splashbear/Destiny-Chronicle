import {
  LOCAL_ACCOUNT_SEARCH_MIN_CHARS,
  localAccountMatchNote,
  matchLocalAccounts,
  normalizeLocalSearchName,
} from './local-account-search';

describe('local-account-search', () => {
  it('normalizes accents and strips bungie codes', () => {
    expect(normalizeLocalSearchName('Hóllz333#1234')).toBe('hollz333');
  });

  it('requires min chars', () => {
    expect(matchLocalAccounts('ho', [
      { membershipId: '1', displayName: 'Hollz333', source: 'played-with' },
    ])).toEqual([]);
    expect(LOCAL_ACCOUNT_SEARCH_MIN_CHARS).toBe(3);
  });

  it('prefix-matches Hollz333 from Played With', () => {
    const hits = matchLocalAccounts('hollz', [
      { membershipId: '4611686018461937667', displayName: 'hollz333', source: 'played-with', lastSeen: '2020-10-25T03:13:09Z' },
      { membershipId: '9', displayName: 'Other', source: 'favorites' },
    ]);
    expect(hits.length).toBe(1);
    expect(hits[0].membershipId).toBe('4611686018461937667');
    expect(localAccountMatchNote(hits[0])).toContain('2020-10-25');
  });

  it('prefers favorites when the same mid appears twice', () => {
    const hits = matchLocalAccounts('splash', [
      { membershipId: '1', displayName: 'Splashbear', source: 'played-with' },
      { membershipId: '1', displayName: 'Splashbear#1078', source: 'favorites', membershipType: 3, game: 'D2' },
    ]);
    expect(hits).toEqual([jasmine.objectContaining({ source: 'favorites', membershipId: '1' })]);
  });

  it('caps results at 10', () => {
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      membershipId: String(i),
      displayName: `TestUser${i}`,
      source: 'favorites' as const,
    }));
    expect(matchLocalAccounts('test', candidates).length).toBe(10);
  });
});
