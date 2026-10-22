import { parsePlayersParam } from './url-players-param';

describe('parsePlayersParam', () => {
  const players = [
    {
      displayName: 'Splashbear',
      membershipId: '1',
      membershipType: 3,
      game: 'd2',
      platform: 'pc',
    },
  ];
  const json = JSON.stringify(players);

  it('parses raw JSON (Angular already decoded once)', () => {
    expect(parsePlayersParam(json)).toEqual(players);
  });

  it('parses once-encoded JSON', () => {
    expect(parsePlayersParam(encodeURIComponent(json))).toEqual(players);
  });

  it('parses double-encoded JSON (legacy write path)', () => {
    expect(parsePlayersParam(encodeURIComponent(encodeURIComponent(json)))).toEqual(players);
  });

  it('returns null for empty or invalid input', () => {
    expect(parsePlayersParam(null)).toBeNull();
    expect(parsePlayersParam('')).toBeNull();
    expect(parsePlayersParam('not-json')).toBeNull();
    expect(parsePlayersParam('{"a":1}')).toBeNull();
  });
});
