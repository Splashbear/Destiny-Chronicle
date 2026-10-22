import {
  aggregateGuardianFirstsFromLists,
  dedupeFirstCompletionsEarliest,
  guardianFirstsDedupKey,
} from './guardian-firsts-dedupe';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

function first(
  partial: Partial<ActivityFirstCompletion> & {
    name: string;
    completionDate: string;
    type?: ActivityFirstCompletion['type'];
  }
): ActivityFirstCompletion {
  return {
    game: 'D2',
    type: partial.type || 'raid',
    name: partial.name,
    referenceId: partial.referenceId || '1',
    completionDate: partial.completionDate,
    isSolo: partial.isSolo,
    isSoloFlawless: partial.isSoloFlawless,
    completed: partial.completed,
    storyReleaseId: partial.storyReleaseId,
  } as ActivityFirstCompletion;
}

describe('guardian-firsts-dedupe', () => {
  it('keys story by release id', () => {
    expect(
      guardianFirstsDedupKey(
        first({ name: 'S', type: 'story', storyReleaseId: 'red-war', completionDate: '2017-01-01' })
      )
    ).toBe('D2|story|red-war');
  });

  it('keeps earliest and merges solo flags', () => {
    const out = dedupeFirstCompletionsEarliest([
      first({ name: 'Last Wish', referenceId: '10', completionDate: '2020-01-02', isSolo: false }),
      first({ name: 'Last Wish', referenceId: '10', completionDate: '2020-01-01', isSolo: true }),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].completionDate).toBe('2020-01-01');
    expect(out[0].isSolo).toBe(true);
  });

  it('aggregates across player lists', () => {
    const agg = aggregateGuardianFirstsFromLists([
      [first({ name: 'Prophecy', type: 'dungeon', referenceId: '2', completionDate: '2021-01-02' })],
      [
        first({
          name: 'Prophecy',
          type: 'dungeon',
          referenceId: '2',
          completionDate: '2021-01-01',
          isSoloFlawless: true,
        }),
      ],
    ]);
    expect(agg.length).toBe(1);
    expect(agg[0].completionDate).toBe('2021-01-01');
    expect(agg[0].isSoloFlawless).toBe(true);
  });
});
