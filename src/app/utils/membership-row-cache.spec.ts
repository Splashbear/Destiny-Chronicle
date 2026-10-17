import { MembershipRowCache } from './membership-row-cache';

describe('membership row cache', () => {
  it('keeps an account until that account is invalidated', () => {
    const cache = new MembershipRowCache<string[]>();
    cache.set('m1', ['a']);
    cache.set('m2', []);
    expect(cache.has('m1')).toBe(true);
    expect(cache.get('m2')).toEqual([]);
    cache.invalidate('m1');
    expect(cache.has('m1')).toBe(false);
    expect(cache.has('m2')).toBe(true);
    cache.invalidate();
    expect(cache.has('m2')).toBe(false);
  });
});
