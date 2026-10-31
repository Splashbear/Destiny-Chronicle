import { interleavePlayersForConcurrency } from './interleave-players';

describe('interleavePlayersForConcurrency', () => {
  it('alternates D1 and D2 by index', () => {
    expect(interleavePlayersForConcurrency(['d1a', 'd1b'], ['d2a'])).toEqual([
      'd1a',
      'd2a',
      'd1b',
    ]);
  });

  it('handles empty sides', () => {
    expect(interleavePlayersForConcurrency([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(interleavePlayersForConcurrency(['a'], [])).toEqual(['a']);
  });
});
