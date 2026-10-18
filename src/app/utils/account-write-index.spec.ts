import { AccountWriteIndex, persistPlannedRows, placeholderIdsToDrop } from './account-write-index';

describe('account write index', () => {
  const placeholder = {
    game: 'D2',
    membershipId: 'm1',
    characterId: 'c1',
    period: '',
    activityDetails: { instanceId: '9' },
  };
  const real = {
    game: 'D2',
    membershipId: 'm1',
    characterId: 'c1',
    period: '2020-10-16T00:00:00Z',
    activityDetails: { instanceId: '9' },
  };

  it('replaces a placeholder when the real row arrives in a later batch', () => {
    const table: Array<typeof real & { id?: number }> = [];
    const index = new AccountWriteIndex();
    let next = 1;
    const write = (incoming: Array<typeof real>) => {
      if (!index.has('m1')) {
        index.load('m1', table);
      }
      const planned = index.plan(['m1'], incoming);
      const stored = persistPlannedRows(table, planned, () => next++);
      index.commit(stored);
    };

    write([placeholder]);
    write([real]);

    const kept = table.filter(row => row.activityDetails.instanceId === '9');
    expect(kept.length).toBe(1);
    expect(kept[0].period).toBe('2020-10-16T00:00:00Z');
    expect(index.keys('m1').length).toBe(1);
  });

  it('drops an empty-period row when the real row is already stored', () => {
    const drop = placeholderIdsToDrop([
      { id: 1, game: 'D2', membershipId: 'm1', characterId: 'c1', period: '', activityDetails: { instanceId: '15947549356' } },
      { id: 2, game: 'D2', membershipId: 'm1', characterId: 'c1', period: '2025-02-27T23:17:24Z', activityDetails: { instanceId: '15947549356' } },
      { id: 3, game: 'D2', membershipId: 'm1', characterId: 'c1', period: '2024-01-01T00:00:00Z', activityDetails: { instanceId: 'other' } },
    ]);
    expect(drop).toEqual([1]);
  });
});
