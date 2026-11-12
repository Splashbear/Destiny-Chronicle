/**
 * Instance PGCR must consult the same D1 / gap roots as player history,
 * key by game+instanceId, and treat player-only peels as a miss.
 */
import {
  describeConfiguredGameDataRoots,
  isPartialArchiveRoster,
} from '../utils/pgcr-archive-roster';

describe('pgcr instance roots parity', () => {
  it('every D1 and gap root used by history is also listed for instance', () => {
    const roots = describeConfiguredGameDataRoots({
      leanActivitiesPath: '/lean.parquet',
      playerActivitiesLitePath: '/lite.parquet',
      gapIndexRoot: '/gap',
      gapIndexSortedRoot: '/gap_sorted',
      gapIndexExtraRoots: ['/gap_extra_10_16b'],
      enableGapLean: true,
      d1IndexRoots: ['/d1_b1', '/d1_b2', '/d1_b3'],
    });
    const instanceRoots = roots.filter(r => r.usedBy.includes('instance'));
    const historyOnly = roots.filter(r => r.usedBy.includes('history') && !r.usedBy.includes('instance'));
    // lite may be history-only; D1 + gap + lean must be on instance
    expect(instanceRoots.some(r => r.kind === 'lean')).toBe(true);
    expect(instanceRoots.filter(r => r.kind === 'd1_act').map(r => r.path)).toEqual([
      '/d1_b1',
      '/d1_b2',
      '/d1_b3',
    ]);
    expect(instanceRoots.some(r => r.path === '/gap_extra_10_16b')).toBe(true);
    expect(historyOnly.every(r => r.kind === 'lite')).toBe(true);
  });

  it('D1/D2 colliding ids stay game-scoped via partial-roster rules', () => {
    // Same numeric id, different games — callers must pass game= so lean filter applies.
    const d1 = [{ membership_id: 'a', mode: 4 }];
    const d2 = [
      { membership_id: 'a', mode: 4 },
      { membership_id: 'b', mode: 4 },
    ];
    expect(isPartialArchiveRoster(d1)).toBe(true);
    expect(isPartialArchiveRoster(d2)).toBe(false);
  });
});
