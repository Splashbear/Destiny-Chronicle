import {
  chroniclePgcrUrl,
  completedMark,
  durationExcelSerial,
  idAsText,
  localDateYmd,
  localTimeAmpm,
} from './chronicle-xlsx';

describe('chronicle-xlsx helpers', () => {
  it('builds D1 and D2 report links', () => {
    expect(chroniclePgcrUrl('123', 'D2')).toBe('https://www.bungie.net/en/PGCR/123');
    expect(chroniclePgcrUrl(456, 'D1')).toBe('https://pgcr.eververse.trade/destiny1/456');
    expect(chroniclePgcrUrl('', 'D2')).toBe('');
  });

  it('formats local date/time without raw Z strings', () => {
    const period = '2019-11-02T04:30:00.000Z';
    const date = localDateYmd(period);
    const time = localTimeAmpm(period);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(date.includes('Z')).toBe(false);
    expect(time.includes('Z')).toBe(false);
    expect(time.length).toBeGreaterThan(0);
  });

  it('stores durations as Excel day fractions and IDs as text', () => {
    expect(durationExcelSerial(3660)).toBeCloseTo(3660 / 86400, 8);
    expect(durationExcelSerial(null)).toBe('');
    expect(idAsText(1560000000)).toBe('1560000000');
    expect(idAsText(undefined)).toBe('');
  });

  it('marks completions', () => {
    expect(completedMark(1)).toBe('✓');
    expect(completedMark(0)).toBe('–');
  });
});
