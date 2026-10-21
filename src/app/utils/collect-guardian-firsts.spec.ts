import { collectPlayerFirstCompletions, GuardianFirstsDb } from './collect-guardian-firsts';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

function row(
  partial: Partial<ActivityFirstCompletion> & { name: string; completionDate: string }
): ActivityFirstCompletion {
  return {
    game: 'D2',
    type: 'raid',
    referenceId: '1',
    completed: 1,
    ...partial,
  } as ActivityFirstCompletion;
}

describe('collectPlayerFirstCompletions', () => {
  it('loads per character and dedupes earliest', async () => {
    const db: GuardianFirstsDb = {
      getFirstCompletions: async (_m, characterId) => ({
        firstCompletions: [
          row({
            name: 'Last Wish',
            referenceId: '10',
            completionDate: characterId === 'c1' ? '2020-01-02' : '2020-01-01',
          }),
        ],
      }),
      getStoryMilestoneFirstCompletionsForMembership: async () => [],
    };

    const out = await collectPlayerFirstCompletions(db, {
      membershipId: 'm1',
      characterIds: ['c1', 'c2'],
      game: 'D2',
    });
    expect(out.length).toBe(1);
    expect(out[0].completionDate).toBe('2020-01-01');
  });

  it('merges D1 membership story firsts when requested', async () => {
    const db: GuardianFirstsDb = {
      getFirstCompletions: async () => ({ firstCompletions: [] }),
      getStoryMilestoneFirstCompletionsForMembership: async () => [
        row({
          game: 'D1',
          type: 'story',
          name: 'Story',
          storyReleaseId: 'titan',
          completionDate: '2014-09-09',
        }),
      ],
    };

    const out = await collectPlayerFirstCompletions(db, {
      membershipId: 'm1',
      characterIds: ['c1'],
      game: 'D1',
      includeD1MembershipStoryFirsts: true,
    });
    expect(out.map(f => f.storyReleaseId)).toEqual(['titan']);
  });
});
