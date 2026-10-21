import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { earliestFirstsByName } from './earliest-firsts-by-name';

function first(
  partial: Partial<ActivityFirstCompletion> & { name: string; completionDate: string }
): ActivityFirstCompletion {
  return {
    type: 'raid',
    game: 'D2',
    membershipId: '1',
    referenceId: '1',
    ...partial,
  } as ActivityFirstCompletion;
}

describe('earliestFirstsByName', () => {
  it('keeps earliest by name for D2', () => {
    const list = [
      first({ name: 'Last Wish', completionDate: '2020-01-02' }),
      first({ name: 'Last Wish', completionDate: '2019-01-01' }),
    ];
    const out = earliestFirstsByName(list);
    expect(out).toHaveSize(1);
    expect(out[0].completionDate).toBe('2019-01-01');
  });

  it('keeps D1 raid variants distinct by referenceId', () => {
    const list = [
      first({
        name: "Crota's End",
        game: 'D1',
        referenceId: '1',
        completionDate: '2015-01-01',
      }),
      first({
        name: "Crota's End",
        game: 'D1',
        referenceId: '2',
        completionDate: '2015-06-01',
      }),
    ];
    expect(earliestFirstsByName(list)).toHaveSize(2);
  });
});
