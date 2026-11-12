import { archiveBungieHistoryAction } from './archive-bungie-history-gate';

describe('archiveBungieHistoryAction', () => {
  it('uses delta catch-up when fill is on for D2 with a stop line', () => {
    expect(
      archiveBungieHistoryAction({
        archiveBungieDeltaFill: true,
        game: 'D2',
        effectiveLevel: 'full',
        leanPartial: false,
        bungieStopAtIid: 10_000_000_000,
      })
    ).toBe('delta');
  });

  it('skips Bungie for D2 full coverage when fill is off', () => {
    expect(
      archiveBungieHistoryAction({
        archiveBungieDeltaFill: false,
        game: 'D2',
        effectiveLevel: 'full',
        leanPartial: false,
        bungieStopAtIid: 10_000_000_000,
      })
    ).toBe('skip');
  });

  it('skips Bungie for D2 leanPartial coverage when fill is off', () => {
    expect(
      archiveBungieHistoryAction({
        archiveBungieDeltaFill: false,
        game: 'D2',
        effectiveLevel: 'partial',
        leanPartial: true,
        bungieStopAtIid: 10_000_000_000,
      })
    ).toBe('skip');
  });

  it('full-crawls when there is no usable archive coverage', () => {
    expect(
      archiveBungieHistoryAction({
        archiveBungieDeltaFill: false,
        game: 'D2',
        effectiveLevel: undefined,
        leanPartial: false,
        bungieStopAtIid: null,
      })
    ).toBe('full-crawl');
  });
});
