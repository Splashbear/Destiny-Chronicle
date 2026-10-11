import { D1_HISTORY_MODES, dedupeByInstanceId, isSocialActivity, SOCIAL_ACTIVITY_MODE } from './activity-history-filters';

describe('activity-history-filters', () => {
  it('D1 history pages a single all-modes request', () => {
    expect([...D1_HISTORY_MODES]).toEqual([0]);
  });

  it('mode 0 games are not social (e.g. Dark Priestess Adept, Chasm of Screams)', () => {
    expect(isSocialActivity(0)).toBeFalse();
    expect(isSocialActivity(0, { directActivityModeType: 18, activityModeTypes: [18, 7] })).toBeFalse();
    expect(isSocialActivity(0, null)).toBeFalse();
  });

  it('social mode or social manifest definition is excluded', () => {
    expect(isSocialActivity(SOCIAL_ACTIVITY_MODE)).toBeTrue();
    expect(isSocialActivity(0, { directActivityModeType: 40 })).toBeTrue();
    expect(isSocialActivity(0, { activityModeTypes: [40] })).toBeTrue();
    expect(isSocialActivity(undefined, { isSocial: true })).toBeTrue();
  });

  it('dedupes by instance id across stored and history row shapes', () => {
    const rows = [
      { instanceId: '1', n: 1 },
      { activityDetails: { instanceId: '1' }, n: 2 },
      { instanceId: 2, n: 3 },
      { instanceId: '2', n: 4 },
      { n: 5 },
    ];
    expect(dedupeByInstanceId(rows).map(r => r.n)).toEqual([1, 3, 5]);
  });
});
