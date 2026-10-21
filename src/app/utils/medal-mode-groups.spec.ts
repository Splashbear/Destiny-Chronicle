import {
  isAggregateMedalStat,
  isMedalHistoricalStat,
  lookupD1MedalCatalog,
  lookupD2MedalCatalog,
  medalModeGroup,
  medalSubtype,
} from './medal-mode-groups';

describe('lookupD2MedalCatalog', () => {
  it('places Double Play under Crucible · Multi + Streak from MEDALS_LIST', () => {
    const hit = lookupD2MedalCatalog('Double Play');
    expect(hit?.mode).toBe('Crucible');
    expect(hit?.subtype).toBe('Multi + Streak');
  });

  it('places Bolt Charge under Vanguard · Elemental', () => {
    const hit = lookupD2MedalCatalog('Bolt Charge');
    expect(hit?.mode).toBe('Vanguard');
    expect(hit?.subtype).toBe('Elemental');
  });

  it('places Get Primeval under Gambit · Prowess', () => {
    const hit = lookupD2MedalCatalog('Get Primeval');
    expect(hit?.mode).toBe('Gambit');
    expect(hit?.subtype).toBe('Prowess');
  });

  it('disambiguates duplicate names with description', () => {
    const crucible = lookupD2MedalCatalog('Not on My Watch', {
      description: 'Land a final blow on an opponent who has damaged an ally.',
    });
    const gambit = lookupD2MedalCatalog('Not on My Watch', {
      description:
        'Defeat an invader within 10 seconds of their appearance in your arena before they defeat anyone on your team.',
    });
    expect(crucible?.mode).toBe('Crucible');
    expect(crucible?.subtype).toBe('Combat');
    expect(gambit?.mode).toBe('Gambit');
  });
});

describe('lookupD1MedalCatalog', () => {
  it('maps medalsAvenger to Crucible Tier 1 from D1_MEDALS_LIST', () => {
    const hit = lookupD1MedalCatalog('medalsAvenger');
    expect(hit?.mode).toBe('Crucible');
    expect(hit?.subtype).toBe('Tier 1');
    expect(hit?.name).toBe('Avenger');
  });
});

describe('isAggregateMedalStat', () => {
  it('filters Medals Earned / Unknown Medals summary rows', () => {
    expect(isAggregateMedalStat('medalsEarned', 'Medals Earned')).toBe(true);
    expect(isAggregateMedalStat('medalsUnknown', 'Unknown Medals')).toBe(true);
    expect(isAggregateMedalStat('medalMulti2x', 'Double Play')).toBe(false);
  });
});

describe('medalModeGroup', () => {
  it('prefers D2 catalog over heuristics', () => {
    expect(medalModeGroup('unknown_stat', [], { name: 'Double Play', game: 'D2' })).toBe('Crucible');
    expect(medalModeGroup('unknown_stat', [], { name: 'Bolt Charge', game: 'D2' })).toBe('Vanguard');
  });

  it('does not classify as Gambit just because modes[] includes Gambit', () => {
    // Bungie often lists ~48 modes on every medal including Gambit (63)
    const modes = [5, 10, 12, 15, 19, 25, 31, 32, 37, 38, 39, 41, 48, 59, 62, 63, 65, 80, 84];
    expect(
      medalModeGroup('medalControlHold2Zones', modes, {
        name: 'I Live Here Now',
        description: 'Control: Hold two or more zones for at least 1 minute.',
        game: 'D2',
        def: {
          medalTierIdentifier: 'PVP_TIER_1',
          contentIconOverrideId: 'pvp_medal_control_hold',
          modes,
        },
      })
    ).toBe('Crucible');
  });

  it('maps gambit / strike by id and icon hints', () => {
    expect(medalModeGroup('Medals_gambit_bank', [])).toBe('Gambit');
    expect(
      medalModeGroup('x', [], {
        def: { contentIconOverrideId: 'gambit_medal_bank', medalTierIdentifier: 'GAMBIT_TIER_1' },
      })
    ).toBe('Gambit');
    expect(medalModeGroup('Medals_pve_strike', [])).toBe('Vanguard');
  });
});

describe('medalSubtype', () => {
  it('prefers D2 catalog', () => {
    expect(medalSubtype('x', {}, { name: 'Double Play', game: 'D2' })).toBe('Multi + Streak');
  });

  it('classifies by statId and gold tier when catalog misses', () => {
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
