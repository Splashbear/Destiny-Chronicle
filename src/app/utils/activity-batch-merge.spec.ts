import { hasRealPeriod, planActivityWrites } from './activity-batch-merge';

describe('activity batch merge', () => {
  const placeholder = (game: 'D1' | 'D2', iid: string, id?: number) => ({
    id,
    game,
    membershipId: 'm',
    characterId: 'c',
    period: '',
    activityDetails: { instanceId: iid },
  });
  const real = (game: 'D1' | 'D2', iid: string, period = '2020-10-16T00:00:00Z', id?: number) => ({
    id,
    game,
    membershipId: 'm',
    characterId: 'c',
    period,
    activityDetails: { instanceId: iid },
  });

  it('replaces an empty-period placeholder with the real row and keeps its id', () => {
    const writes = planActivityWrites(
      [placeholder('D2', '10', 7)],
      [real('D2', '10')]
    );
    expect(writes.length).toBe(1);
    expect(writes[0].id).toBe(7);
    expect(hasRealPeriod(writes[0])).toBe(true);
  });

  it('does not drop a real row when the same key arrives again', () => {
    const kept = real('D2', '10', '2020-10-16T00:00:00Z', 3);
    const writes = planActivityWrites([kept], [real('D2', '10', '2021-01-01T00:00:00Z')]);
    expect(writes).toEqual([]);
  });

  it('replaces a zero-stat row that already has a period when live stats arrive', () => {
    const stub = {
      ...real('D1', '10', '2015-06-01T00:00:00Z', 4),
      values: { kills: { basic: { value: 0 } }, timePlayedSeconds: { basic: { value: 0 } } }
    };
    const live = {
      ...real('D1', '10', '2015-06-01T00:00:00Z'),
      values: { kills: { basic: { value: 12 } }, timePlayedSeconds: { basic: { value: 900 } } }
    };
    const writes = planActivityWrites([stub], [live]);
    expect(writes.length).toBe(1);
    expect(writes[0].id).toBe(4);
    expect(writes[0].values?.kills?.basic?.value).toBe(12);
    expect(writes[0].values?.timePlayedSeconds?.basic?.value).toBe(900);
  });

  it('does not let a zero-stat row overwrite a stored row that has stats', () => {
    const kept = {
      ...real('D1', '10', '2015-06-01T00:00:00Z', 4),
      values: { kills: { basic: { value: 12 } }, timePlayedSeconds: { basic: { value: 900 } } }
    };
    const stub = {
      ...real('D1', '10', '2015-06-01T00:00:00Z'),
      values: { kills: { basic: { value: 0 } }, timePlayedSeconds: { basic: { value: 0 } } }
    };
    expect(planActivityWrites([kept], [stub])).toEqual([]);
  });

  it('replaces a kills-only row when the live row has duration', () => {
    const killsOnly = {
      ...real('D1', '999602761', '2014-12-09T09:33:44Z', 8),
      values: { kills: { basic: { value: 71 } }, timePlayedSeconds: { basic: { value: 0 } } }
    };
    const live = {
      ...real('D1', '999602761', '2014-12-09T09:33:44Z'),
      values: { kills: { basic: { value: 71 } }, timePlayedSeconds: { basic: { value: 752 } } }
    };
    const writes = planActivityWrites([killsOnly], [live]);
    expect(writes.length).toBe(1);
    expect(writes[0].id).toBe(8);
    expect(writes[0].values?.timePlayedSeconds?.basic?.value).toBe(752);
    expect(writes[0].values?.kills?.basic?.value).toBe(71);
  });

  it('keeps D1 and D2 rows that share an instance id', () => {
    const writes = planActivityWrites([], [real('D1', '10'), real('D2', '10')]);
    expect(writes.map(row => row.game)).toEqual(['D1', 'D2']);
  });

  it('collapses a placeholder and a real row in the same batch to the real row', () => {
    const writes = planActivityWrites([], [placeholder('D2', '10'), real('D2', '10')]);
    expect(writes.length).toBe(1);
    expect(hasRealPeriod(writes[0])).toBe(true);
  });
});
