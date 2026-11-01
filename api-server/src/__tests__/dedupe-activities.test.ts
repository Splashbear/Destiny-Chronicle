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

describe('dedupeActivitiesByInstance: deterministic pick among duplicates', () => {
  const mk = (n: number, o: Record<string, unknown>) => ({ instance_id: '9969920038', membership_id: 'a', mode: 82, n, ...o });
  // Real shape (Aramis, game 9969920038): same game, two character rows.
  const done = mk(1, { character_id: '2305843009264955251', completed: true, duration_seconds: 817 });
  const idle = mk(2, { character_id: '2305843009264955253', completed: false, duration_seconds: 75 });

  test('prefers the completed row regardless of input order', () => {
    expect(dedupeActivitiesByInstance([done, idle]).kept[0].n).toBe(1);
    expect(dedupeActivitiesByInstance([idle, done]).kept[0].n).toBe(1);
  });

  test('same completed flag: prefers the longest duration', () => {
    const a = mk(1, { character_id: '5', completed: false, duration_seconds: 100 });
    const b = mk(2, { character_id: '9', completed: false, duration_seconds: 300 });
    expect(dedupeActivitiesByInstance([a, b]).kept[0].n).toBe(2);
    expect(dedupeActivitiesByInstance([b, a]).kept[0].n).toBe(2);
  });

  test('same completed and duration: prefers the highest characterId (numeric, not lexical)', () => {
    const a = mk(1, { character_id: '2305843009264955253', completed: true, duration_seconds: 50 });
    const b = mk(2, { character_id: '999', completed: true, duration_seconds: 50 });
    expect(dedupeActivitiesByInstance([a, b]).kept[0].n).toBe(1);
    expect(dedupeActivitiesByInstance([b, a]).kept[0].n).toBe(1);
  });

  test('all permutations of three rows give the same winner', () => {
    const r = [done, idle, mk(3, { character_id: '2305843009264955252', completed: true, duration_seconds: 817 })];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const p of perms) {
      const { kept, removed } = dedupeActivitiesByInstance(p.map(i => r[i]));
      expect(kept).toHaveLength(1);
      expect(removed).toBe(2);
      expect(kept[0].n).toBe(3); // completed, longest, highest character id (…252 > …251)
    }
  });

  test('winner keeps the list position of the first row for that game', () => {
    const other = { instance_id: '1', membership_id: 'a', n: 9 };
    const { kept } = dedupeActivitiesByInstance([idle, other, done]);
    expect(kept.map(r => r.n)).toEqual([1, 9]);
  });

  test('missing completed/duration/character fields do not throw', () => {
    const { kept } = dedupeActivitiesByInstance([
      { instance_id: '7', membership_id: 'a', n: 1 },
      { instance_id: '7', membership_id: 'a', n: 2, character_id: 'not-a-number' },
    ]);
    expect(kept).toHaveLength(1);
  });
});
