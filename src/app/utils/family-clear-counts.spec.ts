import { countClearsByBaseName } from './family-clear-counts';

describe('countClearsByBaseName', () => {
  const familyMap: Record<string, string> = {
    '1': 'Last Wish: Standard',
    '2': 'Last Wish: Master',
    '3': 'Prophecy: Normal',
  };

  const clear = (ref: string, iid: string, game: 'D1' | 'D2' = 'D2') => ({
    game,
    period: '2020-01-01T00:00:00Z',
    activityDetails: { referenceId: ref, instanceId: iid, mode: 4 },
    values: { completed: { basic: { value: 1 } } },
  });

  it('counts unique instances per base family across difficulties', () => {
    const counts = countClearsByBaseName(
      [
        clear('1', '10'),
        clear('1', '10'), // same instance, second character
        clear('2', '20'),
        clear('3', '30'),
        {
          ...clear('1', '40'),
          values: { completed: { basic: { value: 0 } } },
        },
      ],
      {
        game: 'D2',
        familyMap,
        isCompletion: a => (a as any).values?.completed?.basic?.value === 1,
      }
    );
    expect(counts.get('Last Wish')).toBe(2);
    expect(counts.get('Prophecy')).toBe(1);
  });
});
