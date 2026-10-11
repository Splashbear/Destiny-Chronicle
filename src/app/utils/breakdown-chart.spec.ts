import { buildBreakdownCategoryOptions, selectBreakdownChartItems, breakdownCategoryFromLabel } from './breakdown-chart';

const D = '\u2013';
const groups = [
  { label: `Raid ${D} D1`, game: 'D1' as const, rows: [{ baseName: 'Vault of Glass', timeSeconds: 50 }] },
  { label: `Raid ${D} D2`, game: 'D2' as const, rows: [{ baseName: 'Last Wish', timeSeconds: 120 }] },
  { label: `Dungeon ${D} D2`, game: 'D2' as const, rows: [{ baseName: 'Duality', variantName: 'Standard', timeSeconds: 30 }, { baseName: 'Prophecy', timeSeconds: 70 }] },
  { label: `Strike ${D} D1`, game: 'D1' as const, rows: [{ baseName: 'Winter\'s Run', timeSeconds: 10 }] },
];

describe('breakdown-chart', () => {
  it('parses en-dash and hyphen labels', () => {
    expect(breakdownCategoryFromLabel(`Dungeon ${D} D2`)).toBe('Dungeon');
    expect(breakdownCategoryFromLabel('Dungeon - D2')).toBe('Dungeon');
  });

  it('options list every category', () => {
    expect(buildBreakdownCategoryOptions(groups, { Raid: 'Raids', Dungeon: 'Dungeons' }).map(o => o.label))
      .toEqual(['All activity types', 'Raids', 'Dungeons', 'Strikes']);
  });

  it('All + game filter uses group.game (en-dash labels)', () => {
    const r = selectBreakdownChartItems(groups, { tilesSelected: false, category: 'all', game: 'D2' });
    expect(r.summary).toBeTrue();
    expect(r.items.map(i => i.label)).toEqual([`Raid ${D} D2`, `Dungeon ${D} D2`]);
  });

  it('category dropdown drills into that category, sorted desc', () => {
    const r = selectBreakdownChartItems(groups, { tilesSelected: false, category: 'Dungeon', game: 'all' });
    expect(r.items.map(i => i.label)).toEqual(['Prophecy', 'Duality (Standard)']);
  });

  it('tile selection still honours game and category filters', () => {
    const tiles = [groups[0], groups[2]]; // Raid D1 + Dungeon D2 selected
    expect(selectBreakdownChartItems(tiles, { tilesSelected: true, category: 'all', game: 'D2' }).items.map(i => i.label))
      .toEqual(['Prophecy', 'Duality (Standard)']);
    expect(selectBreakdownChartItems(tiles, { tilesSelected: true, category: 'Raid', game: 'all' }).items.map(i => i.label))
      .toEqual(['Vault of Glass']);
  });
});
