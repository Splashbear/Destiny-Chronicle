import {
  HOLE_ABUT_MARGIN,
  playerRangeHitsHole,
  rangesOverlapOrAbut,
  resolveCoverageLevel,
  setGapMissingIidRunsForTests,
  shouldStripPartialActivities,
} from '../utils/coverage-level';

describe('W3 coverage-level', () => {
  afterEach(() => {
    setGapMissingIidRunsForTests(null);
  });

  test('ranges overlap and margin abut', () => {
    expect(rangesOverlapOrAbut(10, 20, 15, 25)).toBe(true);
    expect(rangesOverlapOrAbut(10, 20, 21, 30)).toBe(true); // abut
    expect(rangesOverlapOrAbut(10, 20, 22, 30)).toBe(true); // within default margin
    expect(rangesOverlapOrAbut(10, 20, 20 + HOLE_ABUT_MARGIN + 2, 30 + HOLE_ABUT_MARGIN, HOLE_ABUT_MARGIN)).toBe(false);
  });

  test('playerRangeHitsHole finds overlap via binary search', () => {
    const holes = [
      { start: 100, end: 110 },
      { start: 2090142022, end: 2090152017 },
      { start: 9000000000, end: 9000000010 },
    ];
    expect(playerRangeHitsHole(2090141000, 2090143000, holes)).toBe(true);
    // Between hole@100 and hole@2.09B, outside HOLE_ABUT_MARGIN=1000
    expect(playerRangeHitsHole(5000, 6000, holes)).toBe(false);
    expect(playerRangeHitsHole(111, 120, holes)).toBe(true); // abut 110+1
    // W10: 231 below hole start must count as near-hole
    expect(playerRangeHitsHole(2090141791, 2090141791, holes)).toBe(true);
  });

  test('W10: only compact_ids strips partial activities', () => {
    expect(shouldStripPartialActivities('compact_ids')).toBe(true);
    expect(shouldStripPartialActivities('merged')).toBe(false);
    expect(shouldStripPartialActivities('gap_lean')).toBe(false);
    expect(shouldStripPartialActivities('lite')).toBe(false);
  });

  test('D1 is never full', () => {
    setGapMissingIidRunsForTests([]);
    const r = resolveCoverageLevel({
      tierLevel: 'full',
      source: 'lite',
      game: 'D1',
      activities: [{ instance_id: '1', period: '2016-01-01T00:00:00Z' }],
      limit: 1000,
    });
    expect(r.level).toBe('partial');
  });

  test('D1 empty is absent not full', () => {
    setGapMissingIidRunsForTests([]);
    const r = resolveCoverageLevel({
      tierLevel: 'full',
      source: 'lite',
      game: 'D1',
      activities: [],
      limit: 1000,
    });
    expect(r.level).toBe('absent');
  });

  test('empty window is not full', () => {
    setGapMissingIidRunsForTests([]);
    const r = resolveCoverageLevel({
      tierLevel: 'full',
      source: 'merged',
      game: 'D2',
      activities: [],
      limit: 1000,
    });
    expect(r.level).toBe('absent');
  });

  test('truncated at limit is partial', () => {
    setGapMissingIidRunsForTests([]);
    const acts = Array.from({ length: 2 }, (_, i) => ({
      instance_id: String(10_000_000_000 + i),
      period: '2024-01-01T00:00:00Z',
    }));
    const r = resolveCoverageLevel({
      tierLevel: 'full',
      source: 'merged',
      game: 'D2',
      activities: acts,
      limit: 2,
    });
    expect(r.level).toBe('partial');
    expect(r.truncated).toBe(true);
  });

  test('W9 hole overlap demotes full to partial', () => {
    setGapMissingIidRunsForTests([{ start: 2090142022, end: 2090152017 }]);
    const r = resolveCoverageLevel({
      tierLevel: 'full',
      source: 'merged',
      game: 'D2',
      activities: [
        { instance_id: '2090141000', period: '2018-08-27T00:00:00Z' },
        { instance_id: '2090153000', period: '2018-08-29T00:00:00Z' },
      ],
      limit: 1000,
    });
    expect(r.level).toBe('partial');
    expect(r.holeOverlap).toBe(true);
  });

  test('no hole and under limit stays full for D2', () => {
    setGapMissingIidRunsForTests([{ start: 2090142022, end: 2090152017 }]);
    const r = resolveCoverageLevel({
      tierLevel: 'full',
      source: 'merged',
      game: 'D2',
      activities: [
        { instance_id: '15000000000', period: '2025-01-01T00:00:00Z' },
        { instance_id: '15000000001', period: '2025-01-02T00:00:00Z' },
      ],
      limit: 1000,
    });
    expect(r.level).toBe('full');
    expect(r.holeOverlap).toBe(false);
  });

  test('W8 note when gap lean enabled', () => {
    setGapMissingIidRunsForTests([]);
    const r = resolveCoverageLevel({
      tierLevel: 'full',
      source: 'merged',
      game: 'D2',
      activities: [{ instance_id: '15000000000', period: '2025-01-01T00:00:00Z' }],
      limit: 1000,
      gapLeanEnabled: true,
    });
    expect(r.notes.some((n) => n.includes('W8'))).toBe(true);
  });
});
