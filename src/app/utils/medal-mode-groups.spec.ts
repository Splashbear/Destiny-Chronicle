import { isMedalHistoricalStat, medalModeGroup, medalSubtype } from './medal-mode-groups';

describe('medalModeGroup', () => {
  it('maps modes to Crucible / Gambit / Vanguard', () => {
    expect(medalModeGroup('Medals_gambit_bank', [])).toBe('Gambit');
    expect(medalModeGroup('something', [63])).toBe('Gambit');
    expect(medalModeGroup('Medals_pvp_streak', [])).toBe('Crucible');
    expect(medalModeGroup('Medals_pvp_medal_trial', [])).toBe('Crucible');
    expect(medalModeGroup('x', [19])).toBe('Crucible');
    expect(medalModeGroup('Medals_pve_strike', [])).toBe('Vanguard');
    expect(medalModeGroup('unknown_stat', [])).toBe('Other');
  });
});

describe('medalSubtype', () => {
  it('classifies by statId and gold tier', () => {
    expect(medalSubtype('medalMulti2x', {})).toBe('Multi + Streak');
    expect(medalSubtype('medalWeaponHandCannon', {})).toBe('Weapons');
    expect(medalSubtype('medalAbilityGunslingerQuick', {})).toBe('Class');
    expect(medalSubtype('medalPayback', {})).toBe('Combat');
    expect(medalSubtype('medalControlAdvantageHold', {})).toBe('Gametypes');
    expect(medalSubtype('medalTrialFlawless', {})).toBe('Trials of Osiris');
    expect(medalSubtype('medalIronBanner', {})).toBe('Iron Banner');
    expect(
      medalSubtype('medalMultiEntireTeam', { medalTierIdentifier: 'PVP_TIER_3' })
    ).toBe('Gold Tier');
  });
});

describe('isMedalHistoricalStat', () => {
  it('detects medals group', () => {
    expect(isMedalHistoricalStat({ group: 3 })).toBe(true);
    expect(isMedalHistoricalStat({ medalTierHash: 1 })).toBe(true);
    expect(isMedalHistoricalStat({ group: 1 })).toBe(false);
  });
});
