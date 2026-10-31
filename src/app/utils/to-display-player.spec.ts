import { toDisplayPlayer } from './to-display-player';

describe('toDisplayPlayer', () => {
  it('sets game, platform, and isPrimary', () => {
    const row = toDisplayPlayer(
      { displayName: 'Splash', membershipId: '1', membershipType: 2 },
      { isPrimary: true, game: 'D2' }
    );
    expect(row.game).toBe('D2');
    expect(row.platform).toBe('PlayStation');
    expect(row.isPrimary).toBe(true);
  });

  it('defaults game to D2 when omitted', () => {
    const row = toDisplayPlayer(
      { displayName: 'X', membershipId: '2', membershipType: 1 },
      { isPrimary: false }
    );
    expect(row.game).toBe('D2');
    expect(row.platform).toBe('Xbox');
    expect(row.isPrimary).toBe(false);
  });
});
