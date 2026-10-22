import { parsePlayersParamFromUrl } from './url-players-param';

describe('parsePlayersParamFromUrl', () => {
  it('parses plain JSON array', () => {
    const raw = JSON.stringify([{ membershipId: '1', game: 'D2' }]);
    expect(parsePlayersParamFromUrl(raw)?.[0].membershipId).toBe('1');
  });

  it('parses once-encoded JSON', () => {
    const raw = encodeURIComponent(JSON.stringify([{ membershipId: '2' }]));
    expect(parsePlayersParamFromUrl(raw)?.[0].membershipId).toBe('2');
  });

  it('returns null for garbage', () => {
    expect(parsePlayersParamFromUrl('not-json')).toBeNull();
    expect(parsePlayersParamFromUrl('')).toBeNull();
  });
});
