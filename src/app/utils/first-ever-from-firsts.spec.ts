import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { pickFirstEverFromFirsts } from './first-ever-from-firsts';

function stub(
  partial: Partial<ActivityFirstCompletion> & Pick<ActivityFirstCompletion, 'name' | 'game' | 'completionDate'>
): ActivityFirstCompletion {
  return {
    type: 'story',
    period: partial.completionDate,
    instanceId: '1',
    referenceId: '0',
    mode: 2,
    characterId: 'c1',
    membershipId: 'm1',
    completed: 1,
    ...partial
  };
}

describe('pickFirstEverFromFirsts', () => {
  it('prefers Homecoming over later D2 story milestones', () => {
    const picked = pickFirstEverFromFirsts(
      [
        stub({
          name: 'The Gateway',
          game: 'D2',
          completionDate: '2017-12-05T12:00:00Z',
          storyReleaseId: 'd2-coo',
          referenceId: '1057017675'
        }),
        stub({
          name: 'Homecoming',
          game: 'D2',
          completionDate: '2017-09-06T18:00:00Z',
          storyReleaseId: 'd2-red-war',
          referenceId: '1658347443'
        })
      ],
      'D2'
    );
    expect(picked?.name).toBe('Homecoming');
  });

  it('prefers A Guardian Rises for D1', () => {
    const picked = pickFirstEverFromFirsts(
      [
        stub({
          name: 'The Coming War',
          game: 'D1',
          completionDate: '2015-09-15T12:00:00Z',
          storyReleaseId: 'd1-ttk',
          referenceId: '853774317'
        }),
        stub({
          name: 'A Guardian Rises',
          game: 'D1',
          completionDate: '2014-09-09T12:00:00Z',
          storyReleaseId: 'd1-base',
          referenceId: '1846390409'
        })
      ],
      'D1'
    );
    expect(picked?.name).toBe('A Guardian Rises');
  });

  it('accepts D2 New Light A Guardian Rises as First Ever', () => {
    const picked = pickFirstEverFromFirsts(
      [
        stub({
          name: 'Battleground: Behemoth',
          game: 'D2',
          completionDate: '2021-03-10T12:00:00Z',
          storyReleaseId: 'd2-chosen',
          referenceId: '773708363'
        }),
        stub({
          name: 'A Guardian Rises',
          game: 'D2',
          completionDate: '2021-03-09T18:00:00Z',
          storyReleaseId: 'd2-new-light',
          referenceId: '3906017155'
        })
      ],
      'D2'
    );
    expect(picked?.name).toBe('A Guardian Rises');
    expect(picked?.referenceId).toBe('3906017155');
  });

  it('never picks a Battleground when the intro mission is missing from firsts', () => {
    const picked = pickFirstEverFromFirsts(
      [
        stub({
          name: 'Battleground: Behemoth',
          game: 'D2',
          completionDate: '2021-03-10T12:00:00Z',
          storyReleaseId: 'd2-chosen',
          referenceId: '773708363'
        }),
        stub({
          name: 'The Gateway',
          game: 'D2',
          completionDate: '2017-12-05T12:00:00Z',
          storyReleaseId: 'd2-coo',
          referenceId: '1057017675'
        })
      ],
      'D2'
    );
    expect(picked).toBeUndefined();
  });

  it('skips an unnamed earlier activity when Homecoming is present', () => {
    const picked = pickFirstEverFromFirsts(
      [
        stub({
          name: 'Unknown Activity',
          game: 'D2',
          completionDate: '2017-09-06T04:20:02Z',
          type: 'story',
          referenceId: '1',
          instanceId: '303555'
        }),
        stub({
          name: 'Homecoming',
          game: 'D2',
          completionDate: '2017-09-06T18:00:00Z',
          storyReleaseId: 'd2-red-war',
          referenceId: '1658347443',
          instanceId: '88001'
        })
      ],
      'D2'
    );
    expect(picked?.name).toBe('Homecoming');
    expect(picked?.instanceId).toBe('88001');
  });

  it('ignores the other game when membership ids are shared', () => {
    const picked = pickFirstEverFromFirsts(
      [
        stub({
          name: 'A Guardian Rises',
          game: 'D1',
          completionDate: '2014-09-09T12:00:00Z',
          storyReleaseId: 'd1-base',
          referenceId: '1846390409'
        }),
        stub({
          name: 'Homecoming',
          game: 'D2',
          completionDate: '2017-09-06T18:00:00Z',
          storyReleaseId: 'd2-red-war',
          referenceId: '1658347443'
        })
      ],
      'D2'
    );
    expect(picked?.name).toBe('Homecoming');
  });
});
