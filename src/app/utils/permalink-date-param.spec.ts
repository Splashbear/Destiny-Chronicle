import { parsePermalinkDateParam } from './permalink-date-param';

describe('parsePermalinkDateParam', () => {
  it('accepts valid Destiny-era dates', () => {
    expect(parsePermalinkDateParam('2021-04-23')).toEqual({
      year: 2021,
      month: 4,
      day: 23,
      date: '2021-04-23',
    });
  });

  it('rejects invalid formats and out-of-range years', () => {
    expect(parsePermalinkDateParam('04-23-2021')).toBeNull();
    expect(parsePermalinkDateParam('2010-01-01')).toBeNull();
    expect(parsePermalinkDateParam('')).toBeNull();
  });
});
