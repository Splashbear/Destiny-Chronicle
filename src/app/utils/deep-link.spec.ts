import {
  buildDeepLinkUrl,
  deepLinkNeedsProfile,
  parseDeepLink,
  parseDeepLinkAccount,
  parseDeepLinkTab,
  resolveDeepLinkGame,
} from './deep-link';

describe('parseDeepLink', () => {
  it('parses one account, tab and date', () => {
    expect(parseDeepLink({ a: '2-4611686018465122437', tab: 'seals', d: '2024-06-09' })).toEqual({
      accounts: [{ membershipType: 2, membershipId: '4611686018465122437' }],
      tab: 'titles',
      date: '2024-06-09',
    });
  });

  it('keeps several accounts, drops bad ones and duplicates', () => {
    const link = parseDeepLink({ a: '3-4611686018467188288,nope,9-1,3-4611686018467188288,1-4611686018429785995-d1' });
    expect(link?.accounts).toEqual([
      { membershipType: 3, membershipId: '4611686018467188288' },
      { membershipType: 1, membershipId: '4611686018429785995', game: 'D1' },
    ]);
  });

  it('caps at 10 accounts', () => {
    const a = Array.from({ length: 14 }, (_, i) => `3-${i + 1}`).join(',');
    expect(parseDeepLink({ a })?.accounts.length).toBe(10);
  });

  it('returns null (home page) for missing or unusable input', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink({})).toBeNull();
    expect(parseDeepLink({ a: '' })).toBeNull();
    expect(parseDeepLink({ a: 'garbage' })).toBeNull();
    expect(parseDeepLink({ a: '254-123' })).toBeNull();
    expect(parseDeepLink({ a: '2-12ab' })).toBeNull();
    expect(parseDeepLink({ a: '2-' + '9'.repeat(25) })).toBeNull();
  });

  it('ignores a bad date and falls back on activities for an unknown tab', () => {
    const link = parseDeepLink({ a: '3-1', tab: 'nonsense', d: '2024-13-45x' });
    expect(link?.tab).toBe('activities');
    expect(link?.date).toBeUndefined();
  });

  it('accepts array-valued params (Angular repeated keys)', () => {
    expect(parseDeepLink({ a: ['3-1', '3-2'] })?.accounts.length).toBe(1);
  });
});

describe('parseDeepLinkTab', () => {
  it('maps url names to site tabs', () => {
    expect(parseDeepLinkTab('otd')).toBe('activities');
    expect(parseDeepLinkTab('SEALS')).toBe('titles');
    expect(parseDeepLinkTab('firsts')).toBe('firsts');
    expect(parseDeepLinkTab('heatmap')).toBe('heatmap');
    expect(parseDeepLinkTab('playedwith')).toBe('playedWith');
    expect(parseDeepLinkTab(undefined)).toBe('activities');
  });
});

describe('game resolution', () => {
  it('non Xbox/PSN platforms are D2 with no profile lookup', () => {
    const a = parseDeepLinkAccount('3-4611686018467188288')!;
    expect(deepLinkNeedsProfile(a)).toBeFalse();
    expect(resolveDeepLinkGame(a)).toBe('D2');
  });

  it('a pinned game wins, even over cross-save evidence', () => {
    const a = parseDeepLinkAccount('2-1-d1')!;
    expect(deepLinkNeedsProfile(a)).toBeFalse();
    expect(resolveDeepLinkGame(a, { crossSaveOverride: 1, bungieGlobalDisplayNameCode: 1078 })).toBe('D1');
    expect(resolveDeepLinkGame(parseDeepLinkAccount('1-1-d2')!)).toBe('D2');
  });

  it('PSN without a pin is D1 by default', () => {
    const a = parseDeepLinkAccount('2-1')!;
    expect(deepLinkNeedsProfile(a)).toBeTrue();
    expect(resolveDeepLinkGame(a)).toBe('D1');
    expect(resolveDeepLinkGame(a, {})).toBe('D1');
  });

  it('PSN without a pin is D2 only with cross-save plus a D2 profile (Splashbear#1078)', () => {
    const a = parseDeepLinkAccount('2-4611686018465122437')!;
    expect(
      resolveDeepLinkGame(a, {
        crossSaveOverride: 2,
        applicableMembershipTypes: [1, 3, 5, 6, 2],
        bungieGlobalDisplayNameCode: 1078,
      })
    ).toBe('D2');
  });
});

describe('buildDeepLinkUrl', () => {
  it('pins the game, keys by platform + id and round-trips', () => {
    const url = buildDeepLinkUrl('https://destinychronicle.com/', {
      accounts: [{ membershipType: 2, membershipId: '4611686018465122437', game: 'D2' }],
      tab: 'otd',
      date: '2026-11-03',
    });
    expect(url).toBe('https://destinychronicle.com/?a=2-4611686018465122437-d2&tab=otd&d=2026-11-03');
    const qs = new URL(url).searchParams;
    expect(parseDeepLink({ a: qs.get('a'), tab: qs.get('tab'), d: qs.get('d') })).toEqual({
      accounts: [{ membershipType: 2, membershipId: '4611686018465122437', game: 'D2' }],
      tab: 'activities',
      date: '2026-11-03',
    });
  });
});
