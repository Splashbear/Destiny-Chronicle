import { isMedalHistoricalStat, medalModeGroup } from './medal-mode-groups';

describe('medalModeGroup', () => {
  it('classifies by mode ids and by statId heuristics', () => {
    expect(medalModeGroup('Medals_gambit_bank', [])).toBe('Gambit');
    expect(medalModeGroup('something', [63])).toBe('Gambit');
    expect(medalModeGroup('Medals_pvp_streak', [])).toBe('Crucible');
    expect(medalModeGroup('Medals_pvp_medal_trial', [])).toBe('Trials');
    expect(medalModeGroup('x', [19])).toBe('Iron Banner');
    expect(medalModeGroup('Medals_pve_strike', [])).toBe('Strikes / Vanguard');
    expect(medalModeGroup('unknown_stat', [])).toBe('Other');
  });
});

describe('isMedalHistoricalStat', () => {
  it('accepts group 3 or medalTierHash', () => {
    expect(isMedalHistoricalStat({ group: 3 })).toBe(true);
    expect(isMedalHistoricalStat({ group: 1, medalTierHash: 1 })).toBe(true);
    expect(isMedalHistoricalStat({ group: 1 })).toBe(false);
    expect(isMedalHistoricalStat(null)).toBe(false);
  });
});
