import { ShareService } from './share.service';

describe('ShareService', () => {
  let share: ShareService;

  beforeEach(() => {
    share = new ShareService();
  });

  it('round-trips a daily share payload with YYYY-MM-DD', () => {
    const state = share.buildDailyShareState(
      [{ displayName: 'Splashbear', membershipId: '1', membershipType: 3, game: 'D2', platform: 'Steam' }],
      '2024-04-23'
    );
    expect(state.d).toBe('2024-04-23');
    const hash = share.generateHash(state);
    const parsed = share.parseHash(hash);
    const normalized = share.normalizeShareState(parsed);
    expect(normalized).toEqual({
      date: '2024-04-23',
      players: [{
        displayName: 'Splashbear',
        membershipId: '1',
        membershipType: 3,
        game: 'D2',
        platform: 'Steam',
      }],
    });
  });

  it('normalizes legacy M-D dates and tuple players', () => {
    const year = new Date().getFullYear();
    const normalized = share.normalizeShareState({
      d: '4-23',
      p: [['99', 2, 'D1']],
    });
    expect(normalized?.date).toBe(`${year}-04-23`);
    expect(normalized?.players).toEqual([{
      membershipId: '99',
      membershipType: 2,
      game: 'D1',
      displayName: 'Unknown Player',
      platform: 'Unknown',
    }]);
  });

  it('returns null for empty or invalid payloads', () => {
    expect(share.normalizeShareState(null)).toBeNull();
    expect(share.normalizeShareState({ d: '2024-04-23', p: [] })).toBeNull();
    expect(share.normalizeShareState({ d: 'bad', p: [{ membershipId: '1' }] })).toBeNull();
  });
});
