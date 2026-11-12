import {
  describeConfiguredGameDataRoots,
  isPartialArchiveRoster,
} from '../utils/pgcr-archive-roster';

describe('isPartialArchiveRoster', () => {
  it('treats empty as partial', () => {
    expect(isPartialArchiveRoster([])).toBe(true);
  });

  it('treats single-mid raid peel as partial', () => {
    expect(isPartialArchiveRoster([{ membership_id: '1', mode: 4 }])).toBe(true);
  });

  it('accepts multi-mid fireteam', () => {
    expect(
      isPartialArchiveRoster([
        { membership_id: '1', mode: 4 },
        { membership_id: '2', mode: 4 },
      ])
    ).toBe(false);
  });

  it('treats one-mid fireteam-index hits as partial too', () => {
    expect(isPartialArchiveRoster([{ membership_id: '1', mode: 4 }])).toBe(true);
  });
});

describe('describeConfiguredGameDataRoots', () => {
  it('lists lean + D1 + gap extras for instance when gap lean is on', () => {
    const roots = describeConfiguredGameDataRoots({
      leanActivitiesPath: 'L',
      gapIndexRoot: 'G',
      gapIndexExtraRoots: ['E'],
      enableGapLean: true,
      d1IndexRoots: ['D1a', 'D1b'],
    });
    expect(roots.map((r) => r.kind).sort()).toEqual(
      ['d1_act', 'd1_act', 'gap', 'gap_extra', 'lean'].sort()
    );
    expect(roots.every((r) => r.usedBy.includes('instance') || r.kind === 'lite')).toBe(true);
  });
});
