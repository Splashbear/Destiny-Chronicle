import {
  anyCharacterActivityLoading,
  isCharacterActivityLoadingKey,
} from './schedule-process-and-group';

describe('schedule-process-and-group helpers', () => {
  it('treats membership-character keys as character loads', () => {
    expect(isCharacterActivityLoadingKey('4611686018467252287-2305843009264935670')).toBe(true);
    expect(isCharacterActivityLoadingKey('2021-04-23')).toBe(false);
  });

  it('reports idle when only the selected-date flag is set', () => {
    expect(
      anyCharacterActivityLoading({
        '2021-04-23': true,
        '4611686018467252287-2305843009264935670': false,
      })
    ).toBe(false);
  });

  it('reports busy while any character key is true', () => {
    expect(
      anyCharacterActivityLoading({
        '2021-04-23': false,
        '4611686018467252287-2305843009264935670': true,
      })
    ).toBe(true);
  });
});
