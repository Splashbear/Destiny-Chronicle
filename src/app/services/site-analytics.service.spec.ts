import { SiteAnalyticsService, FORBIDDEN_ANALYTICS_KEYS, ALLOWED_ANALYTICS_KEYS } from './site-analytics.service';

describe('SiteAnalyticsService', () => {
  let gtagCalls: unknown[][];
  let originalGtag: typeof window.gtag;

  beforeEach(() => {
    gtagCalls = [];
    originalGtag = window.gtag;
    window.gtag = (...args: unknown[]) => {
      gtagCalls.push(args);
    };
  });

  afterEach(() => {
    window.gtag = originalGtag;
  });

  function lastEvent(): { name: string; params: Record<string, unknown> } | null {
    const call = gtagCalls.filter(c => c[0] === 'event').pop();
    if (!call) return null;
    return { name: String(call[1]), params: (call[2] || {}) as Record<string, unknown> };
  }

  it('bucketLoadMs uses coarse buckets', () => {
    expect(SiteAnalyticsService.bucketLoadMs(1200)).toBe('0_5s');
    expect(SiteAnalyticsService.bucketLoadMs(9000)).toBe('5_15s');
    expect(SiteAnalyticsService.bucketLoadMs(20000)).toBe('15_30s');
    expect(SiteAnalyticsService.bucketLoadMs(45000)).toBe('30_60s');
    expect(SiteAnalyticsService.bucketLoadMs(90000)).toBe('60_120s');
    expect(SiteAnalyticsService.bucketLoadMs(180000)).toBe('120s_plus');
  });

  it('sanitizeParams drops membership IDs, names, and other identifiers', () => {
    const dirty = {
      game: 'D2',
      platform: 'steam',
      account_count: 2,
      source: 'archive',
      load_ms_bucket: '5_15s',
      membershipId: '4611686018461234567',
      membership_id: '4611686018461234567',
      displayName: 'Splashbear',
      bungieName: 'Splashbear#1234',
      username: 'secret',
      name: 'should-not-send',
      characterId: '2305843009261234567',
      player_id: 'abc',
      mid: 'xyz',
      id: '123',
      email: 'a@b.c',
      nested: { membershipId: 'nope' },
      evilArray: ['Splashbear']
    };

    const safe = SiteAnalyticsService.sanitizeParams(dirty);
    expect(safe).toEqual({
      game: 'D2',
      platform: 'steam',
      account_count: 2,
      source: 'archive',
      load_ms_bucket: '5_15s'
    });

    const serialized = JSON.stringify(safe).toLowerCase();
    expect(serialized).not.toContain('splashbear');
    expect(serialized).not.toContain('4611686018461234567');
    expect(serialized).not.toContain('2305843009261234567');
    expect(serialized).not.toContain('@');
  });

  it('forbidden key list covers common identifier spellings', () => {
    for (const key of FORBIDDEN_ANALYTICS_KEYS) {
      const safe = SiteAnalyticsService.sanitizeParams({ [key]: 'LEAK', game: 'D1' });
      expect(safe[key]).toBeUndefined();
      expect(Object.keys(safe)).toEqual(['game']);
    }
  });

  it('allowlist is the only keys forwarded', () => {
    const payload: Record<string, unknown> = { random_metric: 1, feature: 'heatmap' };
    for (const key of ALLOWED_ANALYTICS_KEYS) {
      payload[key] = key === 'account_count' ? 1 : 'x';
    }
    const safe = SiteAnalyticsService.sanitizeParams(payload);
    expect(Object.keys(safe).sort()).toEqual([...ALLOWED_ANALYTICS_KEYS].sort());
    expect(safe['random_metric']).toBeUndefined();
  });

  it('trackAccountLookup sends only allowlisted params', () => {
    const svc = new SiteAnalyticsService();
    svc.trackAccountLookup({
      game: 'mixed',
      platform: 'mixed',
      account_count: 6,
      source: 'mixed',
      load_ms_bucket: '30_60s'
    });
    const ev = lastEvent();
    expect(ev?.name).toBe('account_lookup');
    expect(ev?.params).toEqual({
      game: 'mixed',
      platform: 'mixed',
      account_count: 6,
      source: 'mixed',
      load_ms_bucket: '30_60s'
    });
  });

  it('trackLookupError allowlists error_type and rejects free-text with identifiers', () => {
    const svc = new SiteAnalyticsService();
    svc.trackLookupError('account_load_failed');
    expect(lastEvent()?.params).toEqual({ error_type: 'account_load_failed' });

    svc.trackLookupError('Load failed for Splashbear#1234 / mid=4611686018461234567');
    const ev = lastEvent();
    expect(ev?.name).toBe('lookup_error');
    expect(Object.keys(ev?.params || {})).toEqual(['error_type']);
    expect(ev?.params['error_type']).toBe('unknown');
    const blob = JSON.stringify(ev?.params).toLowerCase();
    expect(blob).not.toContain('splashbear');
    expect(blob).not.toContain('4611686018461234567');
  });

  it('trackFeatureView does not accept identifiers via params', () => {
    const svc = new SiteAnalyticsService();
    // Deliberately call low-level event with a forbidden key mixed in
    svc.event('feature_view', {
      feature: 'seal_poster',
      membershipId: '4611686018461234567',
      displayName: 'KaiserHughes'
    });
    const ev = lastEvent();
    expect(ev?.name).toBe('feature_view');
    expect(ev?.params).toEqual({ feature: 'seal_poster' });
    const blob = JSON.stringify(ev?.params).toLowerCase();
    expect(blob).not.toContain('kaiser');
    expect(blob).not.toContain('4611686018461234567');
  });

  it('event is a no-op when gtag is missing', () => {
    window.gtag = undefined;
    const svc = new SiteAnalyticsService();
    expect(() => svc.trackFeatureView('heatmap')).not.toThrow();
    expect(gtagCalls.length).toBe(0);
  });
});
