import {
  completedClearRows,
  firstTags,
  heatGlyph,
  pageSections,
  playedWithDisplayName,
  splitTitles,
  textViewShouldBuild,
  textYearCalendar,
  yearsAgoLabel,
} from './text-tab-rows';

describe('text tab rows', () => {
  it('does not build the text day while accounts are still loading', () => {
    expect(textViewShouldBuild(true, false)).toBe(false);
    expect(textViewShouldBuild(false, true)).toBe(false);
    expect(textViewShouldBuild(false, false)).toBe(true);
  });

  it('pages rows without dropping later sections', () => {
    const paged = pageSections(
      [
        { title: 'Raids', rows: [1, 2] },
        { title: 'Dungeons', rows: [3] },
      ],
      2,
      1
    );
    expect(paged.shown).toBe(2);
    expect(paged.total).toBe(3);
    expect(paged.sections.map(section => section.title)).toEqual(['Raids']);
    expect(pageSections([{ title: 'Raids', rows: [1, 2] }, { title: 'Dungeons', rows: [3] }], 2, 2).sections.map(s => s.title))
      .toEqual(['Raids', 'Dungeons']);
  });

  it('keeps completed clears and skips empty variants', () => {
    const rows = completedClearRows([{
      baseName: 'Vault',
      variants: [
        { version: 'Normal', hasClear: true, when: '2021-10-16T00:00:00Z', tags: '[flawless]' },
        { version: 'Master', hasClear: false, when: '' },
      ],
    }]);
    expect(rows).toEqual([{ name: 'Vault', when: '2021-10-16', tags: '[flawless]' }]);
  });

  it('labels solo and flawless only when the archive confirmed them', () => {
    expect(firstTags({})).toBe('-');
    expect(firstTags({ isSolo: true, isFlawless: true })).toBe('[solo] [flawless]');
  });

  it('counts whole years from the clear date', () => {
    expect(yearsAgoLabel('2021-10-16', new Date(2026, 9, 16))).toBe('5 yrs');
    expect(yearsAgoLabel('2025-12-01', new Date(2026, 9, 16))).toBe('this year');
  });

  it('splits titles into owned and missing without inventing dates', () => {
    const split = splitTitles([
      { name: 'Rivensbane', completed: true },
      { name: 'Chronicler', completed: false },
    ]);
    expect(split.owned.map(t => t.name)).toEqual(['Rivensbane']);
    expect(split.missing.map(t => t.name)).toEqual(['Chronicler']);
  });

  it('maps a day of play to a block and an empty day to none', () => {
    expect(heatGlyph(0)).toBe('░');
    expect(heatGlyph(1)).toBe('█');
    const year = textYearCalendar(2024, (_y, month, day) => (month === 1 && day === 1 ? 100 : 0));
    expect(year[0].days[0].glyph).toBe('█');
    expect(year[0].days[1].glyph).toBe('░');
    expect(year.length).toBe(12);
  });

  it('labels a private played-with name without ranking language', () => {
    expect(playedWithDisplayName('Private')).toBe('Private Guardian');
    expect(playedWithDisplayName('')).toBe('Private Guardian');
    expect(playedWithDisplayName('Example Friend#1111')).toBe('Example Friend#1111');
  });
});
