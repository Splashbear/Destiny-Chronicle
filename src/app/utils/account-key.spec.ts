import {
  buildAccountKey,
  canonicalAccountKey,
  legacyAccountKeys,
  lookupByAccount,
  parseAccountKey,
} from './account-key';
import { getFavoriteKey, getPlayerKey } from './player-keys';
import {
  linkedProfilePlayByMembership,
  lookupLinkedProfilePlay,
} from './search-account-activity';

describe('account-key', () => {
  it('uses game|membershipType|membershipId', () => {
    expect(canonicalAccountKey({ game: 'D2', membershipType: 3, membershipId: '42' })).toBe('D2|3|42');
    expect(canonicalAccountKey({ membershipId: '42' })).toBe('D2|0|42');
  });

  it('never collides for the same id across games or platforms', () => {
    const d1 = canonicalAccountKey({ game: 'D1', membershipType: 2, membershipId: '42' });
    const d2 = canonicalAccountKey({ game: 'D2', membershipType: 2, membershipId: '42' });
    const d2Steam = canonicalAccountKey({ game: 'D2', membershipType: 3, membershipId: '42' });
    expect(new Set([d1, d2, d2Steam]).size).toBe(3);
  });

  it('is shared by player, favorite and card keys', () => {
    const p = { game: 'D1' as const, membershipType: 1, membershipId: '9' };
    expect(getPlayerKey(p)).toBe('D1|1|9');
    expect(getFavoriteKey(p)).toBe('D1|1|9');
    expect(buildAccountKey({ ...p, getPlatformName: () => 'Xbox' })).toBe('D1|1|9');
  });

  it('round-trips and rejects legacy shapes', () => {
    expect(parseAccountKey('D1|1|9')).toEqual({ game: 'D1', membershipType: 1, membershipId: '9' });
    expect(parseAccountKey('D2|9')).toBeNull();
    expect(parseAccountKey('3|9')).toBeNull();
  });

  it('keeps the archive/titles snapshot key format unchanged', () => {
    expect(canonicalAccountKey({ game: 'D2', membershipType: 3, membershipId: '77' })).toBe('D2|3|77');
  });

  it('resolves legacy game-qualified keys but never the game-less type|id key', () => {
    const id = { game: 'D1' as const, membershipType: 2, membershipId: '42' };
    expect(legacyAccountKeys(id)).toContain('D1|42');
    expect(legacyAccountKeys(id)).toContain('D1:42');
    expect(legacyAccountKeys(id)).toContain('42|D1|2');
    expect(legacyAccountKeys(id)).not.toContain('2|42');

    expect(lookupByAccount({ 'D1|42': 'old' }, id)).toBe('old');
    expect(lookupByAccount({ 'D1|42': 'old' }, { ...id, game: 'D2' as const })).toBeUndefined();
    expect(lookupByAccount({ '2|42': 'ambiguous' }, id)).toBeUndefined();
    expect(lookupByAccount({ 'D1|2|42': 'new', 'D1|42': 'old' }, id)).toBe('new');
  });

  it('LinkedProfiles data only matches D2 players', () => {
    const idx = linkedProfilePlayByMembership([
      { membershipType: 2, membershipId: '42', dateLastPlayed: '2024-01-01T00:00:00Z' },
    ]);
    expect(lookupLinkedProfilePlay(idx, { game: 'D2', membershipType: 2, membershipId: '42' })).toBeDefined();
    expect(lookupLinkedProfilePlay(idx, { game: 'D2', membershipType: 5, membershipId: '42' })).toBeDefined(); // platform-agnostic D2 fallback
    expect(lookupLinkedProfilePlay(idx, { game: 'D1', membershipType: 2, membershipId: '42' })).toBeUndefined();
  });
});
