import { ownPlayerTimePlayedSeconds, playerTimePlayedSeconds } from './player-time-played-seconds';
import { leanFromArchiveLight, timeStorySourceSeconds } from './time-story-source';
import { filterUnifiedByYear, buildUnifiedYearBars, type UnifiedBreakdownSource } from './unified-breakdown-year';

/**
 * Pre-unified Breakdown duration (IDB getActivityDurationSeconds): reads
 * values.timePlayedSeconds including converter aliases. Kept here only as a
 * regression fixture — not used by the unified lean path.
 */
function preUnifiedIdbDurationSeconds(activity: any): number {
  const v = activity?.values;
  if (v?.timePlayedSeconds?.basic?.value != null) return Number(v.timePlayedSeconds.basic.value);
  if (typeof v?.timePlayedSeconds === 'number') return v.timePlayedSeconds;
  if (typeof activity?.timePlayedSeconds === 'number') return activity.timePlayedSeconds;
  if (typeof activity?.durationSeconds === 'number') return activity.durationSeconds;
  return 0;
}

describe('dossier Active time vs pre-unified IDB duration', () => {
  it('does not treat converter-aliased values.timePlayedSeconds as personal time', () => {
    const archive = {
      instanceId: '1',
      period: '2018-01-01T12:00:00Z',
      game: 'D2' as const,
      durationSeconds: 1800,
      values: { timePlayedSeconds: 1800 },
    };
    const lean = leanFromArchiveLight(archive)!;
    expect(ownPlayerTimePlayedSeconds(lean)).toBeNull();
    expect(timeStorySourceSeconds(lean)).toBe(1800);
    expect(preUnifiedIdbDurationSeconds(archive)).toBe(1800);
    // Legitimate difference: pre-unified IDB would have labeled the alias as the
    // stored timePlayedSeconds field; lean charts it only as archive duration.
  });

  it('uses proven player seconds when a real player-time field exists', () => {
    const bungie = {
      timePlayedSeconds: 900,
      durationSeconds: 1800,
    };
    expect(ownPlayerTimePlayedSeconds(bungie)).toBe(900);
    expect(playerTimePlayedSeconds(bungie)).toBe(900);
  });

  it('year-filtered table seconds do not change the all-years dossier total', () => {
    const records: UnifiedBreakdownSource[] = [
      {
        instanceId: 'a',
        period: '2016-06-01T12:00:00Z',
        game: 'D1',
        sectionKey: 'mode-4',
        sectionLabel: 'Raid',
        referenceId: 'r',
        baseName: 'Vault',
        variantName: '',
        mode: 4,
        seconds: 4187,
        completed: true,
      },
      {
        instanceId: 'b',
        period: '2024-02-01T12:00:00Z',
        game: 'D2',
        sectionKey: 'mode-4',
        sectionLabel: 'Raid',
        referenceId: 'r2',
        baseName: 'Last Wish',
        variantName: '',
        mode: 4,
        seconds: 1000,
        completed: true,
      },
    ];
    const bars = buildUnifiedYearBars(records, 'UTC', ['mode-4']);
    const dossierActive = bars.totalSeconds;
    const year2024 = filterUnifiedByYear(records, 2024, 'UTC');
    expect(year2024.reduce((s, r) => s + r.seconds, 0)).toBe(1000);
    expect(bars.totalSeconds).toBe(dossierActive);
    expect(dossierActive).toBe(5187);
  });
});
