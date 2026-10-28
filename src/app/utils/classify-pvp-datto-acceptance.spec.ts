/**
 * Acceptance spot-checks from docs/specs/TRIALS_BREAKDOWN_SPEC.md
 * Primary account: datto#6446 — five report shapes must classify correctly.
 */
import { classifyPvp } from './classify-pvp';
import { pvpSplitInvariant } from './trials-breakdown';

describe('Trials acceptance (datto#6446 shapes)', () => {
  it('spot-checks ToO, Freelance, Nine, D1 Trials, and non-Trials Crucible', () => {
    const too = classifyPvp({
      game: 'D2',
      modes: [5, 84],
      mode: 84,
      directorActivityHash: '588019350',
      referenceId: '105227112',
    });
    expect(too.bucket).toBe('trials-too');

    const freelance = classifyPvp({
      game: 'D2',
      modes: [84],
      mode: 84,
      directorActivityHash: '1728343233',
      referenceId: '105227112',
    });
    expect(freelance.bucket).toBe('trials-freelance');

    const nine = classifyPvp({
      game: 'D2',
      modes: [39, 5],
      mode: 39,
      directorActivityHash: '2737374369',
    });
    expect(nine.bucket).toBe('trials-nine');

    const d1 = classifyPvp({ game: 'D1', mode: 14, referenceId: 'd1-map' });
    expect(d1.bucket).toBe('trials-d1');

    const control = classifyPvp({ game: 'D2', modes: [10, 5], mode: 10 });
    expect(control.bucket).toBe('crucible');
    expect(control.isTrials).toBe(false);

    // Osiris vs Nine must stay distinct buckets (separate tiles in Breakdown).
    expect(too.bucket).not.toBe(nine.bucket);
  });

  it('Trials + Crucible equals legacy PvP count for a datto-like mix', () => {
    const mix = [
      classifyPvp({ game: 'D2', mode: 84 }),
      classifyPvp({ game: 'D2', mode: 84, directorActivityHash: '1845851296' }),
      classifyPvp({ game: 'D2', mode: 39 }),
      classifyPvp({ game: 'D2', mode: 10 }),
      classifyPvp({ game: 'D2', mode: 19 }),
      classifyPvp({ game: 'D1', mode: 14 }),
    ];
    const trials = mix.filter(r => r.isTrials).length;
    const crucible = mix.filter(r => r.bucket === 'crucible').length;
    expect(pvpSplitInvariant(trials, crucible, mix.length)).toBe(true);
  });
});
