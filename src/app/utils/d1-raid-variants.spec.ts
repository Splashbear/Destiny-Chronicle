import {
  buildD1RaidVariantGroups,
  D1_RAID_VARIANT_DEFS_AGGREGATE,
  D1_RAID_VARIANT_DEFS_PER_PLAYER,
} from './d1-raid-variants';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

function raid(name: string, versionHint: string, date: string): ActivityFirstCompletion {
  return {
    type: 'raid',
    name,
    game: 'D1',
    period: date,
    completionDate: date,
    instanceId: date,
    referenceId: versionHint,
    mode: 4,
    characterId: 'c',
    membershipId: 'm',
    completed: 1,
  };
}

describe('d1-raid-variants', () => {
  it('keeps earliest per version on aggregate path', () => {
    const groups = buildD1RaidVariantGroups(
      [
        raid('Vault of Glass', 'Normal', '2015-01-02'),
        raid('Vault of Glass', 'Normal', '2014-12-01'),
      ],
      D1_RAID_VARIANT_DEFS_AGGREGATE,
      {
        getVersion: (ref) => ref,
        keepEarliest: true,
        sortByReleaseOrder: true,
      }
    );
    const vog = groups.find(g => g.baseName === 'Vault of Glass')!;
    const normal = vog.variants.find(v => v.version === 'Normal')!;
    expect(normal.first?.completionDate).toBe('2014-12-01');
    expect(vog.variants.some(v => v.version === '390 Light')).toBe(true);
  });

  it('per-player defs omit 390 Light', () => {
    const groups = buildD1RaidVariantGroups([], D1_RAID_VARIANT_DEFS_PER_PLAYER, {
      getVersion: () => 'Normal',
      keepEarliest: false,
      sortByReleaseOrder: false,
    });
    expect(groups[0].variants.every(v => v.version !== '390 Light')).toBe(true);
  });
});
