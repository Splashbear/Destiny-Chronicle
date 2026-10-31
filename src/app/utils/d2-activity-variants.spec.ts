import {
  activityVersionFromName,
  buildD2VariantGroups,
  D2_RAID_VARIANT_DEFS,
  isRiteOfTheNineDungeonName,
  normalizeDesertPerpetualName,
} from './d2-activity-variants';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

describe('d2-activity-variants', () => {
  it('parses version suffix and desert perpetual epic', () => {
    expect(activityVersionFromName('Last Wish: Master')).toBe('Master');
    expect(normalizeDesertPerpetualName('The Desert Perpetual (Epic)', 'Contest')).toEqual({
      baseName: 'The Desert Perpetual',
      version: 'Epic: Contest',
    });
  });

  it('detects Rite of the Nine dungeon names', () => {
    expect(isRiteOfTheNineDungeonName('Ghosts of the Deep: Explorer')).toBe(true);
    expect(isRiteOfTheNineDungeonName('Ghosts of the Deep: Master')).toBe(false);
  });

  it('fills raid variant slots from completions', () => {
    const first: ActivityFirstCompletion = {
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
    };
    const groups = buildD2VariantGroups([first], D2_RAID_VARIANT_DEFS, 'raid');
    const lastWish = groups.find(g => g.baseName === 'Last Wish')!;
    expect(lastWish.variants.some(v => v.hasClear && v.version === 'Normal')).toBe(true);
    expect(lastWish.variants.some(v => v.version === 'Standard' || v.version === 'Normal')).toBe(true);
  });
});
