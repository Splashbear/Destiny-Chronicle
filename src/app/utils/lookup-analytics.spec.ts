import {
  aggregateLookupGame,
  aggregateLookupPlatform,
  platformLabelForAnalytics,
  resolveLookupSource,
} from './lookup-analytics';

describe('lookup-analytics', () => {
  it('maps platform labels', () => {
    expect(platformLabelForAnalytics('Xbox')).toBe('xbox');
    expect(platformLabelForAnalytics('PlayStation')).toBe('psn');
    expect(platformLabelForAnalytics('Steam')).toBe('steam');
    expect(platformLabelForAnalytics('')).toBe('unknown');
    expect(platformLabelForAnalytics('Weird')).toBe('other');
  });

  it('aggregates platforms and games', () => {
    expect(aggregateLookupPlatform(['Xbox'])).toBe('xbox');
    expect(aggregateLookupPlatform(['Xbox', 'Steam'])).toBe('mixed');
    expect(aggregateLookupGame(['D2'])).toBe('D2');
    expect(aggregateLookupGame(['D1', 'D2'])).toBe('mixed');
  });

  it('resolves lookup source', () => {
    expect(resolveLookupSource(new Set(['archive']))).toBe('archive');
    expect(resolveLookupSource(new Set(['bungie']))).toBe('bungie');
    expect(resolveLookupSource(new Set(['archive', 'bungie']))).toBe('mixed');
  });
});
