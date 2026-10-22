import { normalizeExportFromDate } from './export-options-date';

describe('normalizeExportFromDate', () => {
  it('converts YYYY-MM-DD to UTC ISO', () => {
    expect(normalizeExportFromDate('2024-04-23')).toBe(
      new Date(Date.UTC(2024, 3, 23)).toISOString()
    );
  });

  it('converts legacy MM-DD using current year', () => {
    const year = new Date().getFullYear();
    expect(normalizeExportFromDate('04-23')).toBe(
      new Date(Date.UTC(year, 3, 23)).toISOString()
    );
  });

  it('passes through non-strings', () => {
    expect(normalizeExportFromDate(null)).toBeNull();
    const d = new Date();
    expect(normalizeExportFromDate(d)).toBe(d);
  });
});
