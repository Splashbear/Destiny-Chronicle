import {
  buildRiteOfTheNineCard,
  difficultyVariantFromName,
  filterRiteOfTheNineFirsts,
  groupActivitiesByBaseName,
  groupRaidsByBaseName,
  sortPantheonRaidsNewestFirst,
} from './firsts-variant-grouping';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

function first(partial: Partial<ActivityFirstCompletion>): ActivityFirstCompletion {
  return {
    type: 'raid',
    name: 'Last Wish: Normal',
    game: 'D2',
    period: '2020-01-01',
    completionDate: '2020-01-01',
    instanceId: '1',
    referenceId: '1',
    mode: 4,
    characterId: 'c',
    membershipId: 'm',
    completed: 1,
    ...partial,
  };
}

describe('firsts-variant-grouping', () => {
  it('groups by base name and sorts versions', () => {
    const groups = groupActivitiesByBaseName([
      first({ name: 'Duality: Master' }),
      first({ name: 'Duality: Normal' }),
    ]);
    expect(groups[0].baseName).toBe('Duality');
    expect(groups[0].versions.map(v => v.name)).toEqual(['Duality: Normal', 'Duality: Master']);
  });

  it('detects difficulty and pantheon order', () => {
    expect(difficultyVariantFromName('Foo Prestige')).toBe('Prestige');
    const ordered = sortPantheonRaidsNewestFirst([
      first({ name: 'The Pantheon: Atraks Sovereign' }),
      first({ name: 'The Pantheon: Nezarec Sublime' }),
    ]);
    expect(ordered[0].name).toContain('Nezarec');
  });

  it('builds rite of the nine card from filtered firsts', () => {
    const rows = filterRiteOfTheNineFirsts([
      first({ type: 'dungeon', name: 'Ghosts of the Deep: Explorer', referenceId: '9' }),
      first({ type: 'dungeon', name: 'Ghosts of the Deep: Master', referenceId: '8' }),
    ]);
    expect(rows.length).toBe(1);
    const card = buildRiteOfTheNineCard(rows, () => 'Ghosts of the Deep: Explorer');
    expect(card[0].baseName).toBe('Rite of the Nine');
    expect(card[0].variants.length).toBe(1);
  });

  it('groups raids by base keeping earliest duplicate version', () => {
    const groups = groupRaidsByBaseName(
      [
        first({
          name: 'Last Wish',
          referenceId: '10',
          completionDate: '2020-02-01',
        }),
        first({
          name: 'Last Wish',
          referenceId: '10',
          completionDate: '2020-01-01',
          instanceId: '2',
        }),
      ],
      'D2',
      () => 'Last Wish'
    );
    expect(groups[0].baseName).toBe('Last Wish');
    expect(groups[0].variants[0].first?.completionDate).toBe('2020-01-01');
  });
});
