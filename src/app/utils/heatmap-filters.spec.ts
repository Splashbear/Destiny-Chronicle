import {
  characterDisplayLabel,
  characterKey,
  classFromProfileCharacter,
  clipRangeToYear,
  filterHeatmapActivities,
  formatDaysHours,
  heatmapHasActivity,
  monthAbbrev,
  platformName,
  platformShortName,
  seasonOverlapsYear,
  uniqueCharacters,
  uniquePlatforms,
  uniqueYears,
  weekMonthLabels
} from './heatmap-filters';

const xboxTitan = {
  period: '2021-05-11T12:00:00Z',
  membershipId: '111',
  membershipType: 1,
  characterId: 'char-titan',
  characterClass: 'Titan',
  game: 'D2' as const,
  values: { timePlayedSeconds: { basic: { value: 3600 } } }
};

const steamHunter = {
  period: '2021-06-01T12:00:00Z',
  membershipId: '222',
  membershipType: 3,
  characterId: 'char-hunter',
  characterClass: 'Hunter',
  game: 'D2' as const,
  values: { timePlayedSeconds: { basic: { value: 1800 } } }
};

const d1Psn = {
  period: '2015-09-18T12:00:00Z',
  membershipId: '111',
  membershipType: 2,
  characterId: 'char-d1',
  characterClass: 'Warlock',
  game: 'D1' as const,
  values: { timePlayedSeconds: { basic: { value: 7200 } } }
};

describe('heatmap filters', () => {
  it('maps membership types to platform names', () => {
    expect(platformName(1)).toBe('Xbox');
    expect(platformName(2)).toBe('PlayStation');
    expect(platformName(3)).toBe('Steam');
    expect(platformName(5)).toBe('Stadia');
    expect(platformName(6)).toBe('Epic');
    expect(platformShortName(1)).toBe('Xbox');
    expect(platformShortName(2)).toBe('PSN');
    expect(platformShortName(3)).toBe('Steam');
    expect(platformShortName(5)).toBe('Stadia');
    expect(platformShortName(6)).toBe('Epic');
  });

  it('filters by platform, character, year, and selected memberships', () => {
    const all = [xboxTitan, steamHunter, d1Psn];
    expect(filterHeatmapActivities(all, { membershipType: 1 }).map(a => a.characterId))
      .toEqual(['char-titan']);
    expect(filterHeatmapActivities(all, { characterKey: characterKey(steamHunter) }).map(a => a.characterId))
      .toEqual(['char-hunter']);
    expect(filterHeatmapActivities(all, { year: 2015 }).map(a => a.game))
      .toEqual(['D1']);
    expect(filterHeatmapActivities(all, { membershipIds: ['222'] }).map(a => a.membershipId))
      .toEqual(['222']);
  });

  it('lists unique platforms, characters, and years', () => {
    const all = [xboxTitan, steamHunter, d1Psn];
    expect(uniquePlatforms(all).map(p => p.name)).toEqual(['Xbox', 'PSN', 'Steam']);
    expect(uniqueCharacters(all).map(c => c.label)).toEqual([
      'D1 PSN Warlock',
      'D2 Steam Hunter',
      'D2 Xbox Titan'
    ]);
    expect(uniqueYears(all)).toEqual([2015, 2021]);
  });

  it('detects season overlap with a calendar year', () => {
    expect(seasonOverlapsYear(new Date(2021, 4, 11), new Date(2021, 7, 24), 2021)).toBe(true);
    expect(seasonOverlapsYear(new Date(2021, 4, 11), new Date(2021, 7, 24), 2022)).toBe(false);
    expect(seasonOverlapsYear(new Date(2020, 10, 10), new Date(2021, 1, 9), 2021)).toBe(true);
  });

  it('formats Braytech-style day/hour totals', () => {
    expect(formatDaysHours(3 * 3600, 1)).toBe('1 day, 3 hours');
    expect(formatDaysHours(0, 0)).toBe('0 days, 0 hours');
  });

  it('labels characters from profile classType when activities omit class', () => {
    const unlabeled = [
      { ...xboxTitan, characterClass: undefined, characterId: 'char-1' },
      { ...xboxTitan, characterClass: undefined, characterId: 'char-2' },
      { ...d1Psn, characterClass: undefined, characterId: 'char-3' }
    ];
    expect(classFromProfileCharacter({ characterBase: { classType: 1 } })).toBe('Hunter');
    expect(uniqueCharacters(unlabeled, {
      [characterKey(unlabeled[0])]: { className: 'Hunter', membershipType: 1 },
      [characterKey(unlabeled[1])]: { className: 'Titan', membershipType: 1 },
      [characterKey(unlabeled[2])]: { className: 'Warlock', membershipType: 2 }
    }).map(c => c.label)).toEqual([
      'D1 PSN Warlock',
      'D2 Xbox Hunter',
      'D2 Xbox Titan'
    ]);
  });

  it('uses profile membershipType when activities omit platform', () => {
    const unlabeled = {
      period: '2015-01-01T12:00:00Z',
      membershipId: '111',
      characterId: 'char-hunter',
      game: 'D1' as const,
      values: { timePlayedSeconds: { basic: { value: 60 } } }
    };
    expect(uniqueCharacters([unlabeled], {
      [characterKey(unlabeled)]: { className: 'Hunter', membershipType: 1 }
    }).map(c => c.label)).toEqual(['D1 Xbox Hunter']);
  });

  it('labels D2 characters as platform plus class for Xbox, PSN, Steam, Epic, and Stadia', () => {
    expect(classFromProfileCharacter({ classType: 0 })).toBe('Titan');
    const d2 = [
      { period: '2024-01-01T12:00:00Z', membershipId: 'xbox', membershipType: 1, characterId: 'c-xbox', game: 'D2' as const, values: { timePlayedSeconds: { basic: { value: 60 } } } },
      { period: '2024-01-01T12:00:00Z', membershipId: 'psn', membershipType: 2, characterId: 'c-psn', game: 'D2' as const, values: { timePlayedSeconds: { basic: { value: 60 } } } },
      { period: '2024-01-01T12:00:00Z', membershipId: 'steam', membershipType: 3, characterId: 'c-steam', game: 'D2' as const, values: { timePlayedSeconds: { basic: { value: 60 } } } },
      { period: '2024-01-01T12:00:00Z', membershipId: 'stadia', membershipType: 5, characterId: 'c-stadia', game: 'D2' as const, values: { timePlayedSeconds: { basic: { value: 60 } } } },
      { period: '2024-01-01T12:00:00Z', membershipId: 'epic', membershipType: 6, characterId: 'c-epic', game: 'D2' as const, values: { timePlayedSeconds: { basic: { value: 60 } } } }
    ];
    expect(uniquePlatforms(d2).map(p => p.name)).toEqual(['Xbox', 'PSN', 'Steam', 'Stadia', 'Epic']);
    expect(uniqueCharacters(d2, {
      [characterKey(d2[0])]: { className: 'Hunter', membershipType: 1, displayName: 'Splashbear' },
      [characterKey(d2[1])]: { className: 'Titan', membershipType: 2, displayName: 'Splashbear' },
      [characterKey(d2[2])]: { className: 'Warlock', membershipType: 3, displayName: 'Splashbear' },
      [characterKey(d2[3])]: { className: 'Hunter', membershipType: 5, displayName: 'Splashbear' },
      [characterKey(d2[4])]: { className: 'Titan', membershipType: 6, displayName: 'Splashbear' }
    }).map(c => c.label)).toEqual([
      'D2 Splashbear Epic Titan',
      'D2 Splashbear PSN Titan',
      'D2 Splashbear Stadia Hunter',
      'D2 Splashbear Steam Warlock',
      'D2 Splashbear Xbox Hunter'
    ]);
  });

  it('builds character labels with game, account name, platform, and class', () => {
    expect(characterDisplayLabel('D2', 'Splashbear', 'PSN', 'Hunter'))
      .toBe('D2 Splashbear PSN Hunter');
  });

  it('clips a season range to a calendar year', () => {
    const clipped = clipRangeToYear(new Date(2014, 11, 9), new Date(2015, 4, 19), 2014);
    expect(clipped?.start.getFullYear()).toBe(2014);
    expect(clipped?.end.getMonth()).toBe(11);
    expect(clipped?.end.getDate()).toBe(31);
  });

  it('detects whether a year has playtime on a platform', () => {
    const all = [xboxTitan, steamHunter, d1Psn];
    expect(heatmapHasActivity(all, { year: 2015, membershipType: 2 })).toBe(true);
    expect(heatmapHasActivity(all, { year: 2015, membershipType: 1 })).toBe(false);
  });

  it('shows 2014 activity across all platforms even when PSN has no 2014 playtime', () => {
    const xbox2014 = {
      period: '2014-10-15T12:00:00Z',
      membershipId: '111',
      membershipType: 1,
      characterId: 'char-d1-xbox',
      characterClass: 'Hunter',
      game: 'D1' as const,
      values: { timePlayedSeconds: { basic: { value: 900 } } }
    };
    const psnLater = {
      period: '2018-04-01T12:00:00Z',
      membershipId: '222',
      membershipType: 2,
      characterId: 'char-d2-psn',
      characterClass: 'Hunter',
      game: 'D2' as const,
      values: { timePlayedSeconds: { basic: { value: 900 } } }
    };
    const all = [xbox2014, psnLater];
    expect(heatmapHasActivity(all, { year: 2014 })).toBe(true);
    expect(heatmapHasActivity(all, { year: 2014, membershipType: 1 })).toBe(true);
    expect(heatmapHasActivity(all, { year: 2014, membershipType: 2 })).toBe(false);
    expect(uniqueCharacters(all, {
      [characterKey(psnLater)]: { className: 'Hunter', membershipType: 2, displayName: 'Splashbear' }
    }).map(c => c.label)).toContain('D2 Splashbear PSN Hunter');
  });

  it('labels the first visible week and each week that contains the 1st of a month', () => {
    expect(monthAbbrev(new Date(2014, 8, 9))).toBe('Sep');
    const pad = { day: 0, date: new Date(0) };
    const sep9 = { day: 9, date: new Date(2014, 8, 9) };
    const sep10 = { day: 10, date: new Date(2014, 8, 10) };
    const oct1 = { day: 1, date: new Date(2014, 9, 1) };
    const oct2 = { day: 2, date: new Date(2014, 9, 2) };
    expect(weekMonthLabels([
      [pad, pad, sep9, sep10, { day: 11, date: new Date(2014, 8, 11) }, { day: 12, date: new Date(2014, 8, 12) }, { day: 13, date: new Date(2014, 8, 13) }],
      [{ day: 28, date: new Date(2014, 8, 28) }, { day: 29, date: new Date(2014, 8, 29) }, { day: 30, date: new Date(2014, 8, 30) }, oct1, oct2, { day: 3, date: new Date(2014, 9, 3) }, { day: 4, date: new Date(2014, 9, 4) }],
      [{ day: 5, date: new Date(2014, 9, 5) }, { day: 6, date: new Date(2014, 9, 6) }, { day: 7, date: new Date(2014, 9, 7) }, { day: 8, date: new Date(2014, 9, 8) }, { day: 9, date: new Date(2014, 9, 9) }, { day: 10, date: new Date(2014, 9, 10) }, { day: 11, date: new Date(2014, 9, 11) }]
    ])).toEqual(['Sep', 'Oct', null]);
  });
});
