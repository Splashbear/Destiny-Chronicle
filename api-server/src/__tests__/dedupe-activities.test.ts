import { dedupeActivitiesByInstance } from '../utils/dedupe-activities';

describe('dedupeActivitiesByInstance', () => {
  test('drops repeated instance ids per membership, keeps first', () => {
    const rows = [
      { instance_id: '8971330596', membership_id: 'a', mode: 0, n: 1 },
      { instance_id: '8971330596', membership_id: 'a', mode: 0, n: 2 },
      { instance_id: '8971330596', membership_id: 'b', mode: 0, n: 3 },
      { instance_id: '6038538487', membership_id: 'a', mode: 0, n: 4 },
      { instance_id: '', membership_id: 'a', mode: 0, n: 5 },
    ];
    const { kept, removed } = dedupeActivitiesByInstance(rows);
    expect(kept.map(r => r.n)).toEqual([1, 3, 4, 5]);
    expect(removed).toBe(1);
  });

  test('mode 0 rows are kept (not treated as hubs or dupes)', () => {
    const { kept } = dedupeActivitiesByInstance([{ instance_id: '1', membership_id: 'a', mode: 0 }]);
    expect(kept).toHaveLength(1);
  });
});
