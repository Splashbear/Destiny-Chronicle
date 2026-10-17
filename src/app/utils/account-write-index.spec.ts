import { AccountWriteIndex } from './account-write-index';

describe('account write index', () => {
  const placeholder = {
    id: 1,
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

  it('loads once and keeps a single key across batches', () => {
    const index = new AccountWriteIndex();
    expect(index.has('m1')).toBe(false);
    index.load('m1', [placeholder]);
    expect(index.has('m1')).toBe(true);

    const first = index.plan(['m1'], [real]);
    expect(first.length).toBe(1);
    expect(first[0].id).toBe(1);
    expect(first[0].period).toBe('2020-10-16T00:00:00Z');
    index.commit(first);

    const second = index.plan(['m1'], [real]);
    expect(second).toEqual([]);
    expect(index.keys('m1').length).toBe(1);
  });
});
