import {
  aggregateUnifiedCountRows,
  buildUnifiedYearBars,
  filterUnifiedByYear,
  instanceIdsForSection,
  sectionTotalsFromRecords,
  type UnifiedBreakdownSource,
} from './unified-breakdown-year';

function rec(partial: Partial<UnifiedBreakdownSource> & Pick<UnifiedBreakdownSource, 'period' | 'sectionKey' | 'seconds'>): UnifiedBreakdownSource {
  return {
    instanceId: partial.instanceId || `i-${partial.period}-${partial.sectionKey}`,
    game: partial.game || 'D2',
    sectionLabel: partial.sectionLabel || partial.sectionKey,
    referenceId: partial.referenceId || partial.sectionKey,
    baseName: partial.baseName || partial.sectionKey,
    variantName: partial.variantName || '',
    mode: partial.mode ?? 0,
    completed: partial.completed ?? true,
    membershipId: partial.membershipId,
    period: partial.period,
    sectionKey: partial.sectionKey,
    seconds: partial.seconds,
  };
}

const FIXTURE: UnifiedBreakdownSource[] = [
  rec({ period: '2024-02-01T12:00:00Z', sectionKey: 'mode-4', sectionLabel: 'Raid', referenceId: 'raid-a', baseName: 'Last Wish', mode: 4, seconds: 3600, instanceId: 'r1' }),
  rec({ period: '2024-03-01T12:00:00Z', sectionKey: 'mode-4', sectionLabel: 'Raid', referenceId: 'raid-a', baseName: 'Last Wish', mode: 4, seconds: 1800, instanceId: 'r2', completed: false }),
  rec({ period: '2024-06-01T12:00:00Z', sectionKey: 'pvp', sectionLabel: 'Crucible', referenceId: 'clash', baseName: 'Clash', mode: 12, seconds: 600, instanceId: 'c1' }),
  rec({ period: '2024-07-01T12:00:00Z', sectionKey: 'trials-osiris', sectionLabel: 'Trials of Osiris', referenceId: 'too', baseName: 'Trials', mode: 84, seconds: 900, instanceId: 't1' }),
  rec({ period: '2024-08-01T12:00:00Z', sectionKey: 'mode-0', sectionLabel: 'None', referenceId: 'unk', baseName: 'Unknown (unk)', mode: 0, seconds: 120, instanceId: 'u1' }),
  rec({ period: '2023-11-01T12:00:00Z', sectionKey: 'mode-4', sectionLabel: 'Raid', referenceId: 'raid-b', baseName: 'Vault of Glass', mode: 4, seconds: 2400, instanceId: 'r3', game: 'D1' }),
  rec({ period: '2023-12-01T12:00:00Z', sectionKey: 'pvp', sectionLabel: 'Crucible', referenceId: 'clash', baseName: 'Clash', mode: 12, seconds: 300, instanceId: 'c2' }),
];

describe('unified Breakdown year source', () => {
  const tz = 'UTC';
  const order = ['mode-4', 'trials-osiris', 'pvp', 'mode-0'];

  it('reconciles 2024 groups and child rows with the year bar', () => {
    const bars = buildUnifiedYearBars(FIXTURE, tz, order);
    const y2024 = bars.years.find(bar => bar.year === 2024)!;
    const filtered = filterUnifiedByYear(FIXTURE, 2024, tz);
    expect(filtered.length).toBe(y2024.games);
    expect(filtered.reduce((s, r) => s + r.seconds, 0)).toBe(y2024.seconds);
    expect(y2024.seconds).toBe(3600 + 1800 + 600 + 900 + 120);
    expect(y2024.games).toBe(5);

    const rows = aggregateUnifiedCountRows(filtered);
    expect(rows.reduce((s, r) => s + r.runs, 0)).toBe(y2024.games);
    expect(rows.reduce((s, r) => s + r.timeSeconds, 0)).toBe(y2024.seconds);
    const lastWish = rows.find(r => r.baseName === 'Last Wish')!;
    expect(lastWish.runs).toBe(2);
    expect(lastWish.clears).toBe(1);
    expect(lastWish.fails).toBe(1);
    expect(lastWish.timeSeconds).toBe(5400);

    const sections = sectionTotalsFromRecords(filtered);
    for (const part of y2024.groups) {
      expect(sections.get(part.group)?.seconds).toBe(part.seconds);
      expect(sections.get(part.group)?.games).toBe(part.games);
    }
    const raidRows = rows.filter(r => r.mode === 4);
    expect(raidRows.reduce((s, r) => s + r.timeSeconds, 0)).toBe(sections.get('mode-4')!.seconds);
  });

  it('All years and reset after a 2024 filter return the full aggregation', () => {
    const bars = buildUnifiedYearBars(FIXTURE, tz, order);
    const y2024 = filterUnifiedByYear(FIXTURE, 2024, tz);
    expect(y2024.reduce((s, r) => s + r.seconds, 0)).toBe(7020);
    const all = filterUnifiedByYear(FIXTURE, 'all', tz);
    expect(all.length).toBe(bars.totalGames);
    expect(all.reduce((s, r) => s + r.seconds, 0)).toBe(bars.totalSeconds);
    expect(bars.totalSeconds).toBe(7020 + 2400 + 300);
    expect(aggregateUnifiedCountRows(all).reduce((s, r) => s + r.runs, 0)).toBe(bars.totalGames);
  });

  it('keeps Trials out of Crucible and retains Unknown (mode-0)', () => {
    const y2024 = filterUnifiedByYear(FIXTURE, 2024, tz);
    const sections = sectionTotalsFromRecords(y2024);
    expect(sections.get('trials-osiris')?.games).toBe(1);
    expect(sections.get('pvp')?.games).toBe(1);
    expect(sections.get('pvp')?.seconds).toBe(600);
    expect(sections.has('mode-0')).toBe(true);
    expect(sections.get('mode-0')?.seconds).toBe(120);
    expect(y2024.some(r => r.sectionKey === 'pvp' && r.sectionKey === 'trials-osiris')).toBe(false);
    expect(instanceIdsForSection(y2024, 'pvp')).toEqual(['c1']);
    expect(instanceIdsForSection(y2024, 'trials-osiris')).toEqual(['t1']);
  });

  it('table drilldown population matches the bar segment games', () => {
    const bars = buildUnifiedYearBars(FIXTURE, tz, order);
    const y2024 = bars.years.find(bar => bar.year === 2024)!;
    const filtered = filterUnifiedByYear(FIXTURE, 2024, tz);
    for (const part of y2024.groups) {
      const ids = instanceIdsForSection(filtered, part.group);
      expect(ids.length).toBe(part.games);
    }
  });

  it('respects game and account filters on the same record set', () => {
    const d2 = FIXTURE.filter(r => r.game === 'D2');
    const bars = buildUnifiedYearBars(d2, tz, order);
    expect(bars.years.some(bar => bar.groups.some(g => g.group === 'mode-4') && bar.year === 2023)).toBe(false);
    expect(filterUnifiedByYear(d2, 'all', tz).every(r => r.game === 'D2')).toBe(true);
    expect(filterUnifiedByYear(d2, 2023, tz).length).toBe(1); // 2023 crucible c2 is D2
    const oneAccount = FIXTURE.filter(r => r.membershipId == null);
    // fixture rows have no membershipId; a selected-account filter is applied before classify
    const midA = FIXTURE.map((r, i) => ({ ...r, membershipId: i < 5 ? 'a' : 'b' }));
    const onlyA = midA.filter(r => r.membershipId === 'a');
    expect(filterUnifiedByYear(onlyA, 'all', tz).length).toBe(5);
    expect(buildUnifiedYearBars(onlyA, tz, order).totalGames).toBe(5);
  });

  it('uses IANA year bounds so a late UTC period can fall on the previous local year', () => {
    const late = [
      rec({ period: '2024-01-01T04:00:00Z', sectionKey: 'pvp', seconds: 100, instanceId: 'nye' }),
    ];
    const utc = buildUnifiedYearBars(late, 'UTC', ['pvp']);
    const ny = buildUnifiedYearBars(late, 'America/New_York', ['pvp']);
    expect(utc.years[0].year).toBe(2024);
    expect(ny.years[0].year).toBe(2023);
  });
});
