import { TRIALS_FREELANCE_HASHES } from '../config/trials.config';
import {
  classifyPvp,
  isTrialsBucket,
  pvpActivityKey,
  trialsSubBucketLabel,
} from './classify-pvp';

describe('classifyPvp', () => {
  it('classifies D2 Trials of Osiris from modes containing 84', () => {
    const r = classifyPvp({ game: 'D2', modes: [5, 84], mode: 5 });
    expect(r.bucket).toBe('trials-too');
    expect(r.isTrials).toBe(true);
    expect(isTrialsBucket(r.bucket)).toBe(true);
  });

  it('classifies D2 Trials from mode fallback when modes is missing', () => {
    const r = classifyPvp({ game: 'D2', modes: null, mode: 84 });
    expect(r.bucket).toBe('trials-too');
  });

  it('splits Freelance via directorActivityHash', () => {
    const hash = [...TRIALS_FREELANCE_HASHES][0];
    const r = classifyPvp({
      game: 'D2',
      modes: [84],
      directorActivityHash: hash,
    });
    expect(r.bucket).toBe('trials-freelance');
    expect(trialsSubBucketLabel('trials-freelance')).toBe('Freelance');
  });

  it('splits Freelance via referenceId when director missing', () => {
    const hash = [...TRIALS_FREELANCE_HASHES][1];
    const r = classifyPvp({ game: 'D2', mode: 84, referenceId: hash });
    expect(r.bucket).toBe('trials-freelance');
  });

  it('unknown Trials hash stays plain Trials of Osiris', () => {
    const r = classifyPvp({
      game: 'D2',
      modes: [84],
      directorActivityHash: '999999999',
      referenceId: '105227112', // Altar of Flame map — not Freelance playlist
    });
    expect(r.bucket).toBe('trials-too');
  });

  it('classifies Trials of the Nine (39/41/42)', () => {
    expect(classifyPvp({ game: 'D2', modes: [39] }).bucket).toBe('trials-nine');
    expect(classifyPvp({ game: 'D2', mode: 41 }).bucket).toBe('trials-nine');
    expect(classifyPvp({ game: 'D2', mode: 42 }).bucket).toBe('trials-nine');
  });

  it('classifies D1 Trials as mode 14 only when game is D1', () => {
    expect(classifyPvp({ game: 'D1', mode: 14 }).bucket).toBe('trials-d1');
    // D2 must not treat 14 as Trials (collision guard)
    expect(classifyPvp({ game: 'D2', mode: 14 }).bucket).toBe('other');
    expect(classifyPvp({ game: 'D2', modes: [14, 5] }).bucket).toBe('crucible');
  });

  it('classifies D1 Trials via playlist hash when mode is AllPvP', () => {
    expect(
      classifyPvp({ game: 'D1', mode: 5, referenceId: '3234259779' }).bucket
    ).toBe('trials-d1');
  });

  it('classifies D2 Nine via playlist hash when mode is AllPvP', () => {
    expect(
      classifyPvp({ game: 'D2', mode: 5, directorActivityHash: '2737374369' }).bucket
    ).toBe('trials-nine');
  });

  it('does not treat D2 mode 84 as D1 Trials', () => {
    expect(classifyPvp({ game: 'D1', mode: 84 }).bucket).not.toBe('trials-d1');
  });

  it('classifies non-Trials Crucible', () => {
    expect(classifyPvp({ game: 'D2', modes: [10], mode: 10 }).bucket).toBe('crucible');
    expect(classifyPvp({ game: 'D2', mode: 19 }).bucket).toBe('crucible'); // Iron Banner
    expect(classifyPvp({ game: 'D1', mode: 10 }).bucket).toBe('crucible');
  });

  it('returns other for non-PvP', () => {
    expect(classifyPvp({ game: 'D2', mode: 4 }).bucket).toBe('other');
    expect(classifyPvp({ game: 'D2', modes: [], mode: undefined }).bucket).toBe('other');
  });

  it('keys activities by game|instanceId', () => {
    expect(pvpActivityKey('D2', 12345)).toBe('D2|12345');
  });
});

describe('TRIALS_FREELANCE_HASHES', () => {
  it('includes every curated Freelance playlist hash', () => {
    expect(TRIALS_FREELANCE_HASHES.has('1728343233')).toBe(true);
    expect(TRIALS_FREELANCE_HASHES.has('1845851296')).toBe(true);
    for (const h of TRIALS_FREELANCE_HASHES) {
      expect(classifyPvp({ game: 'D2', mode: 84, directorActivityHash: h }).bucket).toBe(
        'trials-freelance'
      );
    }
  });
});
