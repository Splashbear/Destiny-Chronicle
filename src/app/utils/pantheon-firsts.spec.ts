import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import {
  buildGroupedPantheonEventCards,
  filterPantheonEventFirsts,
  sortPantheonEventRaids,
} from './pantheon-firsts';

function raid(name: string, referenceId: string): ActivityFirstCompletion {
  return {
    name,
    referenceId,
    type: 'raid',
    game: 'D2',
    completionDate: '2024-01-01',
    membershipId: '1',
  } as ActivityFirstCompletion;
}

describe('pantheon-firsts', () => {
  it('filters legacy Pantheon by hash', () => {
    const list = [
      raid('The Pantheon: Atraks Sovereign', '4169648176'),
      raid('Last Wish', '1660030045'),
    ];
    const filtered = filterPantheonEventFirsts(list, 'legacy-pantheon');
    expect(filtered.map((f) => f.name)).toEqual(['The Pantheon: Atraks Sovereign']);
  });

  it('sorts legacy Pantheon by config versionSortOrder (higher index first)', () => {
    const list = [
      raid('The Pantheon: Nezarec Sublime', '4169648182'),
      raid('The Pantheon: Atraks Sovereign', '4169648176'),
    ];
    const sorted = sortPantheonEventRaids(list, 'legacy-pantheon');
    // versionSortOrder lists Nezarec first (index 0); sort uses ib - ia so Atraks (higher index) leads
    expect(sorted[0].name).toContain('Atraks');
    expect(sorted[1].name).toContain('Nezarec');
  });

  it('builds grouped cards with cardTitle', () => {
    const list = [
      raid('The Pantheon: Atraks Sovereign', '4169648176'),
      raid('The Pantheon: Nezarec Sublime', '4169648182'),
    ];
    const cards = buildGroupedPantheonEventCards(list, 'legacy-pantheon', (acts) => [
      { baseName: acts[0].name, versions: [acts[0]] },
      { baseName: acts[1].name, versions: [acts[1]] },
    ]);
    expect(cards.length).toBe(2);
    expect(cards.every((c) => c.cardTitle === 'The Pantheon')).toBe(true);
  });
});
