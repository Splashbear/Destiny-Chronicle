import { heatmapLoadAction } from './heatmap-load-plan';

describe('heatmap load plan', () => {
  const base = {
    destroyed: false,
    membershipKey: 'a\nb',
    cachedKey: '',
    tableReady: false,
    inflightKey: '',
  };

  it('reads once, then joins or uses the cache', () => {
    expect(heatmapLoadAction(base)).toBe('read');
    expect(heatmapLoadAction({ ...base, inflightKey: 'a\nb' })).toBe('join');
    expect(heatmapLoadAction({ ...base, tableReady: true, cachedKey: 'a\nb' })).toBe('cached');
    expect(heatmapLoadAction({ ...base, membershipKey: '' })).toBe('none');
    expect(heatmapLoadAction({ ...base, destroyed: true })).toBe('none');
    expect(heatmapLoadAction({ ...base, tableReady: true, cachedKey: 'a', membershipKey: 'a\nb' })).toBe('read');
  });
});
