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
