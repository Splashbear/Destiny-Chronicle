import { classifyPvp } from './classify-pvp';
import {
  aggregateTrialsBreakdown,
  pvpSplitInvariant,
  trialsEfficiency,
  trialsKd,
  trialsWeekendStart,
  trialsWinRate,
} from './trials-breakdown';

describe('trialsWeekendStart', () => {
  it('anchors to Friday 17:00 UTC', () => {
    // Saturday 2024-03-16 12:00 UTC → Friday 2024-03-15 17:00 UTC
    const start = trialsWeekendStart('2024-03-16T12:00:00.000Z');
    expect(start.toISOString()).toBe('2024-03-15T17:00:00.000Z');
  });

  it('before Friday reset uses previous Friday', () => {
    const start = trialsWeekendStart('2024-03-15T16:00:00.000Z');
    expect(start.toISOString()).toBe('2024-03-08T17:00:00.000Z');
  });
});

describe('aggregateTrialsBreakdown', () => {
  const mapName = (ref: string) => (ref === '105227112' ? 'Altar of Flame' : 'Unknown activity');

  it('aggregates W/L KD and sub-rows; ignores non-Trials', () => {
    const detail = aggregateTrialsBreakdown(
      [
        {
          period: '2024-03-16T18:00:00.000Z',
          game: 'D2',
          activityDetails: { instanceId: '1', referenceId: '105227112', mode: 84, modes: [84] },
          values: {
            standing: { basic: { value: 0 } },
            kills: { basic: { value: 10 } },
            deaths: { basic: { value: 5 } },
            assists: { basic: { value: 2 } },
            timePlayedSeconds: { basic: { value: 600 } },
          },
        },
        {
          period: '2024-03-16T19:00:00.000Z',
          game: 'D2',
          activityDetails: {
            instanceId: '2',
            referenceId: '1728343233',
            directorActivityHash: '1728343233',
            mode: 84,
            modes: [84],
          },
          values: {
            standing: { basic: { value: 1 } },
            kills: { basic: { value: 3 } },
            deaths: { basic: { value: 6 } },
            timePlayedSeconds: { basic: { value: 500 } },
          },
        },
        {
          period: '2024-03-16T20:00:00.000Z',
          game: 'D2',
          activityDetails: { instanceId: '3', referenceId: 'x', mode: 10 },
          values: { standing: { basic: { value: 0 } }, kills: { basic: { value: 99 } } },
        },
        {
          period: '2015-06-01T12:00:00.000Z',
          game: 'D1',
          activityDetails: { instanceId: '4', referenceId: 'd1map', mode: 14 },
          values: {
            standing: { basic: { value: 0 } },
            kills: { basic: { value: 8 } },
            deaths: { basic: { value: 4 } },
            timePlayedSeconds: { basic: { value: 400 } },
          },
        },
      ],
      mapName
    );

    expect(detail.totals.matches).toBe(3);
    expect(detail.totals.wins).toBe(2);
    expect(detail.totals.losses).toBe(1);
    expect(detail.totals.kills).toBe(21);
    expect(detail.totals.deaths).toBe(15);
    expect(trialsWinRate(detail.totals)).toBeCloseTo(66.666, 1);
    expect(trialsKd(detail.totals)).toBeCloseTo(21 / 15);
    expect(trialsEfficiency(detail.totals)).toBeCloseTo((21 + 2) / 15);

    const labels = detail.subRows.map(r => r.label);
    expect(labels).toContain('Trials of Osiris');
    expect(labels).toContain('Freelance');
    expect(labels).toContain('Trials of Osiris (D1)');
    expect(detail.weekends.length).toBeGreaterThanOrEqual(1);
    expect(detail.weekends[0].mapName).toBeTruthy();
  });

  it('dedupes by game|instanceId', () => {
    const row = {
      period: '2024-03-16T18:00:00.000Z',
      game: 'D2' as const,
      activityDetails: { instanceId: '1', referenceId: '105227112', mode: 84 },
      values: { standing: { basic: { value: 0 } }, timePlayedSeconds: { basic: { value: 100 } } },
    };
    const detail = aggregateTrialsBreakdown([row, row], mapName);
    expect(detail.totals.matches).toBe(1);
  });
});

describe('pvpSplitInvariant', () => {
  it('requires Trials + Crucible === legacy PvP', () => {
    expect(pvpSplitInvariant(10, 90, 100)).toBe(true);
    expect(pvpSplitInvariant(10, 90, 99)).toBe(false);
  });

  it('matches classifyPvp split counts on a mixed set', () => {
    const rows = [
      { game: 'D2' as const, mode: 84 },
      { game: 'D2' as const, mode: 84 },
      { game: 'D2' as const, mode: 10 },
      { game: 'D2' as const, mode: 19 },
      { game: 'D1' as const, mode: 14 },
      { game: 'D2' as const, mode: 39 },
    ];
    let trials = 0;
    let crucible = 0;
    for (const r of rows) {
      const c = classifyPvp({ game: r.game, mode: r.mode });
      if (c.isTrials) trials++;
      else if (c.bucket === 'crucible') crucible++;
    }
    expect(pvpSplitInvariant(trials, crucible, rows.length)).toBe(true);
    expect(trials).toBe(4);
    expect(crucible).toBe(2);
  });
});
