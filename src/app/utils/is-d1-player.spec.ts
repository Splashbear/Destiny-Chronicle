import { isD1Player } from './is-d1-player';

describe('isD1Player', () => {
  it('uses explicit game', () => {
    expect(isD1Player({ game: 'D1', membershipType: 1 })).toBe(true);
    expect(isD1Player({ game: 'D2', membershipType: 3 })).toBe(false);
  });

  it('returns false for nullish', () => {
    expect(isD1Player(undefined)).toBe(false);
    expect(isD1Player(null)).toBe(false);
  });

  it('falls back for Xbox without cross-save markers', () => {
    expect(isD1Player({ membershipType: 1, displayName: 'x' })).toBe(true);
  });
});
