import { ActivityBreakdownService, ActivityCountRow } from './activity-breakdown.service';
import { pvpSplitInvariant } from '../utils/trials-breakdown';

describe('ActivityBreakdownService Trials / Crucible split', () => {
  function row(partial: Partial<ActivityCountRow> & Pick<ActivityCountRow, 'referenceId' | 'mode' | 'game'>): ActivityCountRow {
    return {
      baseName: partial.baseName || 'Map',
      variantName: partial.variantName || '',
      runs: partial.runs ?? 1,
      clears: partial.clears ?? 0,
      fails: partial.fails ?? 0,
      timeSeconds: partial.timeSeconds ?? 60,
      ...partial,
    };
  }

  it('splits Trials above Crucible and preserves PvP run totals', () => {
    const svc = new ActivityBreakdownService({} as any, {} as any, { getBatch: async () => new Map() } as any);
    const rows: ActivityCountRow[] = [
      row({ referenceId: '1', mode: 84, game: 'D2', baseName: 'Altar of Flame', runs: 5, timeSeconds: 500 }),
      row({ referenceId: '2', mode: 39, game: 'D2', baseName: 'Trials of the Nine', runs: 2, timeSeconds: 200 }),
      row({ referenceId: '3', mode: 14, game: 'D1', baseName: 'Widow\'s Court', runs: 3, timeSeconds: 300 }),
      row({ referenceId: '4', mode: 10, game: 'D2', baseName: 'Control', runs: 20, timeSeconds: 2000 }),
      row({ referenceId: '5', mode: 19, game: 'D2', baseName: 'Iron Banner', runs: 10, timeSeconds: 1000 }),
      row({ referenceId: '6', mode: 4, game: 'D2', baseName: 'Last Wish', runs: 7, timeSeconds: 700 }),
    ];

    const groups = svc.groupRowsByType(rows);
    const osirisGroups = groups.filter(g => g.type === 'trials-osiris');
    const nineGroups = groups.filter(g => g.type === 'trials-nine');
    const crucibleGroups = groups.filter(g => g.type === 'pvp');
    const legacyPvpRuns = rows.filter(r => [84, 39, 14, 10, 19].includes(r.mode)).reduce((s, r) => s + r.runs, 0);
    const trialsRuns =
      osirisGroups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.runs, 0), 0) +
      nineGroups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.runs, 0), 0);
    const crucibleRuns = crucibleGroups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.runs, 0), 0);

    expect(trialsRuns).toBe(10);
    expect(crucibleRuns).toBe(30);
    expect(pvpSplitInvariant(trialsRuns, crucibleRuns, legacyPvpRuns)).toBe(true);

    // Osiris and Nine are separate tiles; both sort before Crucible
    expect(osirisGroups.some(g => g.game === 'D2')).toBe(true);
    expect(nineGroups.some(g => g.game === 'D2')).toBe(true);
    expect(osirisGroups.some(g => g.game === 'D1')).toBe(true);
    const d2OsirisIdx = groups.findIndex(g => g.type === 'trials-osiris' && g.game === 'D2');
    const d2NineIdx = groups.findIndex(g => g.type === 'trials-nine' && g.game === 'D2');
    const d2CrucibleIdx = groups.findIndex(g => g.type === 'pvp' && g.game === 'D2');
    expect(d2OsirisIdx).toBeGreaterThanOrEqual(0);
    expect(d2NineIdx).toBeGreaterThanOrEqual(0);
    expect(d2CrucibleIdx).toBeGreaterThanOrEqual(0);
    expect(d2OsirisIdx).toBeLessThan(d2CrucibleIdx);
    expect(d2NineIdx).toBeLessThan(d2CrucibleIdx);

    expect(osirisGroups.every(g => g.label.startsWith('Trials of Osiris'))).toBe(true);
    expect(nineGroups.every(g => g.label.startsWith('Trials of the Nine'))).toBe(true);
    expect(crucibleGroups.every(g => g.label.startsWith('Crucible'))).toBe(true);
  });

  it('Freelance playlist hash lands in Trials of Osiris (not Crucible)', () => {
    const svc = new ActivityBreakdownService({} as any, {} as any, { getBatch: async () => new Map() } as any);
    const groups = svc.groupRowsByType([
      row({ referenceId: '1728343233', mode: 84, game: 'D2', baseName: 'Freelance: Trials of Osiris', runs: 4 }),
    ]);
    expect(groups.some(g => g.type === 'trials-osiris')).toBe(true);
    expect(groups.some(g => g.type === 'pvp')).toBe(false);
  });

  it('D1 Trials playlist hash classifies as Trials of Osiris even when mode is AllPvP (5)', () => {
    const svc = new ActivityBreakdownService({} as any, {} as any, { getBatch: async () => new Map() } as any);
    const groups = svc.groupRowsByType([
      row({ referenceId: '3234259779', mode: 5, game: 'D1', baseName: 'Trials of Osiris', runs: 2 }),
    ]);
    expect(groups.some(g => g.type === 'trials-osiris' && g.game === 'D1')).toBe(true);
  });

  it('D2 Nine playlist hash with mode AllPvP becomes Trials of the Nine tile', () => {
    const svc = new ActivityBreakdownService({} as any, {} as any, { getBatch: async () => new Map() } as any);
    const groups = svc.groupRowsByType([
      row({ referenceId: '2737374369', mode: 5, game: 'D2', baseName: 'Trials of the Nine', runs: 3 }),
    ]);
    expect(groups.some(g => g.type === 'trials-nine' && g.game === 'D2')).toBe(true);
  });
});
