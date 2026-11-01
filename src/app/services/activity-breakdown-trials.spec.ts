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

  it('does not put D1 mode-0 Crucible maps under Gambit (Gambit is D2-only)', () => {
    const manifest = {
      getActivityType: (_ref: string, _mode?: number, isD1?: boolean) =>
        isD1 ? 'crucible' : 'other',
      getActivityName: () => 'Twilight Gap',
      getActivityFamilyName: () => 'Twilight Gap',
    };
    const svc = new ActivityBreakdownService({} as any, manifest as any, { getBatch: async () => new Map() } as any);
    const groups = svc.groupRowsByType([
      row({ referenceId: 'd1-pvp-1', mode: 0, game: 'D1', baseName: 'Twilight Gap', runs: 8 }),
      row({ referenceId: 'd1-control', mode: 10, game: 'D1', baseName: 'Control', runs: 3 }),
      row({ referenceId: 'd2-gambit', mode: 63, game: 'D2', baseName: 'Emerald Coast', runs: 4 }),
      row({ referenceId: 'd2-emerald-0', mode: 0, game: 'D2', baseName: 'Emerald Coast', runs: 2 }),
    ]);

    expect(groups.some(g => g.type === 'gambit' && g.game === 'D1')).toBe(false);
    expect(groups.some(g => g.type === 'pvp' && g.game === 'D1')).toBe(true);
    expect(groups.some(g => g.type === 'gambit' && g.game === 'D2')).toBe(true);

    const d1CrucibleRuns = groups
      .filter(g => g.type === 'pvp' && g.game === 'D1')
      .reduce((s, g) => s + g.rows.reduce((a, r) => a + r.runs, 0), 0);
    expect(d1CrucibleRuns).toBe(11);
  });

  it('keeps D1 strikes in Strike – D1 and does not apply D2-only story peels', () => {
    const svc = new ActivityBreakdownService(
      {} as any,
      {
        getActivityType: () => 'strike',
        getActivityName: (id: string) => (String(id).includes('cerberus') ? 'Cerberus Vae III' : 'Unknown'),
        getActivityFamilyName: () => '',
      } as any,
      { getBatch: async () => new Map() } as any
    );
    const groups = svc.groupRowsByType([
      row({ referenceId: 'cerberus', mode: 3, game: 'D1', baseName: 'Cerberus Vae III', runs: 12 }),
      row({ referenceId: 'all-strikes', mode: 18, game: 'D1', baseName: 'Dust Palace', runs: 2 }),
      row({ referenceId: 'winters-nf', mode: 16, game: 'D1', baseName: "Winter's Run", runs: 4 }),
      // Would match Story Strikes curated name if D2 peels were applied to D1.
      row({ referenceId: 'd1-override', mode: 2, game: 'D1', baseName: 'Override', runs: 2 }),
      row({ referenceId: 'd2-bg', mode: 3, game: 'D2', baseName: 'Battleground: Hailstone', runs: 5 }),
      row({ referenceId: 'd2-lake', mode: 3, game: 'D2', baseName: 'Lake of Shadows', runs: 9 }),
      row({ referenceId: 'd2-lake-nf', mode: 46, game: 'D2', baseName: 'Lake of Shadows', runs: 3 }),
      row({ referenceId: 'd2-allstrikes', mode: 18, game: 'D2', baseName: 'The Arms Dealer', runs: 4 }),
    ]);

    expect(groups.some(g => g.type === 'strikes' && g.game === 'D1' && g.label === 'Strike – D1')).toBe(true);
    expect(groups.some(g => g.type === 'nightfall' && g.game === 'D1')).toBe(true);
    expect(groups.some(g => g.type === 'story-strikes' && g.game === 'D1')).toBe(false);
    expect(groups.some(g => g.type === 'battlegrounds' && g.game === 'D2')).toBe(true);
    expect(groups.some(g => g.type === 'strikes' && g.game === 'D2')).toBe(true);
    expect(groups.some(g => g.type === 'nightfall' && g.game === 'D2')).toBe(true);
    expect(groups.some(g => g.type === 'battlegrounds' && g.game === 'D1')).toBe(false);
    // Mode 3 + 18 share one Strike tile per game (no separate AllStrikes).
    expect(groups.filter(g => g.type === 'strikes' && g.game === 'D2').length).toBe(1);
  });

  it('does not classify D2 mode 29 as SRL (D1-only mode)', () => {
    const svc = new ActivityBreakdownService({} as any, {} as any, { getBatch: async () => new Map() } as any);
    const groups = svc.groupRowsByType([
      row({ referenceId: 'not-srl', mode: 29, game: 'D2', baseName: 'Some PvP', runs: 1 }),
      row({ referenceId: '1478347980', mode: 29, game: 'D1', baseName: 'Campus Martius', runs: 2 }),
    ]);
    expect(groups.some(g => g.type === 'sparrow-racing-league' && g.game === 'D2')).toBe(false);
    expect(groups.some(g => g.type === 'sparrow-racing-league' && g.game === 'D1')).toBe(true);
  });

  it('keeps raids/dungeons game-split and does not dump D2 mode-0 Crucible into Gambit', () => {
    const manifest = {
      getActivityType: (ref: string) => {
        if (String(ref).includes('altar')) return 'crucible';
        if (String(ref).includes('emerald')) return 'gambit';
        if (String(ref).includes('throne')) return 'dungeon';
        return 'other';
      },
      getActivityName: () => 'x',
      getActivityFamilyName: () => 'x',
    };
    const svc = new ActivityBreakdownService({} as any, manifest as any, { getBatch: async () => new Map() } as any);
    const groups = svc.groupRowsByType([
      row({ referenceId: 'vog-d1', mode: 4, game: 'D1', baseName: 'Vault of Glass', runs: 10 }),
      row({ referenceId: 'vog-d2', mode: 4, game: 'D2', baseName: 'Vault of Glass', runs: 8 }),
      row({ referenceId: 'throne', mode: 82, game: 'D2', baseName: 'The Shattered Throne', runs: 5 }),
      row({ referenceId: 'fake-d1-dungeon', mode: 82, game: 'D1', baseName: 'Should Not Be Dungeon', runs: 1 }),
      row({ referenceId: 'altar', mode: 0, game: 'D2', baseName: 'Altar of Flame', runs: 3 }),
      row({ referenceId: 'emerald', mode: 0, game: 'D2', baseName: 'Emerald Coast', runs: 2 }),
      row({ referenceId: 'gambit63', mode: 63, game: 'D2', baseName: 'Gambit', runs: 4 }),
      row({ referenceId: 'lake', mode: 3, game: 'D2', baseName: 'Lake of Shadows', runs: 6 }),
      row({ referenceId: 'lake-nf', mode: 46, game: 'D2', baseName: 'Lake of Shadows', runs: 2 }),
    ]);

    expect(groups.some(g => g.type === 'mode-4' && g.game === 'D1')).toBe(true);
    expect(groups.some(g => g.type === 'mode-4' && g.game === 'D2')).toBe(true);
    expect(groups.some(g => g.type === 'dungeon' && g.game === 'D2')).toBe(true);
    expect(groups.some(g => g.type === 'dungeon' && g.game === 'D1')).toBe(false);
    expect(groups.some(g => g.label === 'Dungeon – D1')).toBe(false);

    const gambitNames = groups
      .filter(g => g.type === 'gambit' && g.game === 'D2')
      .flatMap(g => g.rows.map(r => r.baseName));
    expect(gambitNames).toContain('Emerald Coast');
    expect(gambitNames).toContain('Gambit');
    expect(gambitNames).not.toContain('Altar of Flame');

    expect(groups.some(g => g.type === 'pvp' && g.rows.some(r => r.baseName === 'Altar of Flame'))).toBe(true);
    expect(groups.some(g => g.type === 'strikes' && g.game === 'D2')).toBe(true);
    expect(groups.some(g => g.type === 'nightfall' && g.game === 'D2')).toBe(true);
  });
});
