import { buildDisplayTitles, buildTitlesByLock } from './title-display-list';

describe('title-display-list', () => {
  const titles = [
    { name: 'B', locked: true, legacy: false, releaseRank: 1 },
    { name: 'A', locked: false, legacy: false, releaseRank: 2 },
    { name: 'C', locked: false, legacy: true, releaseRank: 3 },
  ];

  it('all-view puts unlocked before locked', () => {
    const rows = buildDisplayTitles(titles, 'all', 'alpha');
    expect(rows.map(t => t.name)).toEqual(['A', 'C', 'B']);
  });

  it('legacy filter returns single sorted list', () => {
    const rows = buildDisplayTitles(titles, 'legacy', 'alpha');
    expect(rows.map(t => t.name)).toEqual(['C']);
  });

  it('by-lock respects filter', () => {
    expect(buildTitlesByLock(titles, false, 'all', 'release').map(t => t.name)).toEqual([
      'C',
      'A',
    ]);
  });
});
