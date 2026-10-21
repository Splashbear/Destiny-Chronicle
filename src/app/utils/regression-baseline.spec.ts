import {
  buildRegressionBaseline,
  canonicalRegressionBaseline,
  diffRegressionBaselines,
  regressionDateOnly
} from './regression-baseline';

describe('regression-baseline', () => {
  it('normalizes dates to YYYY-MM-DD UTC', () => {
    expect(regressionDateOnly('2021-04-23T19:47:33.000Z')).toBe('2021-04-23');
    expect(regressionDateOnly('2021-04-23')).toBe('2021-04-23');
  });

  it('keeps only raid/dungeon firsts and sorts accounts by game+id', () => {
    const baseline = buildRegressionBaseline({
      accounts: [
        { game: 'D1', membershipId: '4164', membershipType: 2 },
        { game: 'D2', membershipId: '2437', membershipType: 2 }
      ],
      activityCount: 100,
      activityTimeSeconds: 3600.7,
      sealCount: 12,
      firsts: [
        {
          game: 'D2',
          membershipId: '2437',
          type: 'story',
          referenceId: '1',
          name: 'Story',
          completionDate: '2017-09-06T00:00:00Z'
        },
        {
          game: 'D2',
          membershipId: '2437',
          type: 'raid',
          referenceId: '910380154',
          name: 'Deep Stone Crypt',
          completionDate: '2020-11-21T12:00:00Z',
          isSolo: false
        },
        {
          game: 'D1',
          membershipId: '4164',
          type: 'dungeon',
          referenceId: '5',
          name: "Crota's End",
          completionDate: '2014-09-19T02:51:12Z',
          isSolo: true
        }
      ],
      playedWithTop10: [
        { membershipId: '9', displayName: 'Buddy', activitiesTogether: 42 }
      ]
    });

    expect(baseline.accounts.map((a) => a.game)).toEqual(['D1', 'D2']);
    expect(baseline.totals.activityTimeSeconds).toBe(3601);
    expect(baseline.firsts.length).toBe(2);
    expect(baseline.firsts[0].membershipId).toBe('4164');
    expect(baseline.firsts[1].name).toBe('Deep Stone Crypt');
    expect(baseline.playedWithTop10[0].activitiesTogether).toBe(42);
  });

  it('diffs report path when totals diverge', () => {
    const expected = buildRegressionBaseline({
      accounts: [{ game: 'D2', membershipId: '1', membershipType: 2 }],
      activityCount: 10,
      activityTimeSeconds: 100,
      sealCount: 1,
      firsts: []
    });
    const actual = buildRegressionBaseline({
      accounts: [{ game: 'D2', membershipId: '1', membershipType: 2 }],
      activityCount: 11,
      activityTimeSeconds: 100,
      sealCount: 1,
      firsts: []
    });
    const diffs = diffRegressionBaselines(expected, actual);
    expect(diffs.some((d) => d.path.includes('activityCount'))).toBe(true);
    expect(diffRegressionBaselines(expected, expected)).toEqual([]);
  });

  it('canonical form drops label and capturedAt', () => {
    const b = buildRegressionBaseline({
      label: 'test',
      capturedAt: '2026-01-01T00:00:00Z',
      accounts: [],
      activityCount: 0,
      activityTimeSeconds: 0,
      sealCount: 0,
      firsts: []
    });
    const c = canonicalRegressionBaseline(b);
    expect((c as { label?: string }).label).toBeUndefined();
    expect((c as { capturedAt?: string }).capturedAt).toBeUndefined();
  });
});
