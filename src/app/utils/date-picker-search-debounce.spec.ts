import { DATE_PICKER_SEARCH_DEBOUNCE_MS } from './date-picker-search-debounce';

describe('DATE_PICKER_SEARCH_DEBOUNCE_MS', () => {
  it('is long enough for month then day selects without an intermediate search', () => {
    expect(DATE_PICKER_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(500);
    expect(DATE_PICKER_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(1500);
  });
});
