import {
  accountGames,
  coerceGameFilterChoice,
  displayGameFromFilter,
  effectiveGame,
  gameFilterChipEnabled,
} from './effective-game';

describe('effectiveGame', () => {
  const d1 = { game: 'D1' as const };
  const d2 = { game: 'D2' as const };

  it('returns D1 when every selected account is D1', () => {
    expect(effectiveGame([d1, d1], 'Both')).toBe('D1');
    expect(effectiveGame([d1], 'D2')).toBe('D1');
  });

  it('returns D2 when every selected account is D2', () => {
    expect(effectiveGame([d2, d2], 'Both')).toBe('D2');
    expect(effectiveGame([d2], 'D1')).toBe('D2');
  });

  it('uses userChoice when the selection mixes D1 and D2', () => {
    expect(effectiveGame([d1, d2], 'Both')).toBe('Both');
    expect(effectiveGame([d1, d2], 'D1')).toBe('D1');
    expect(effectiveGame([d1, d2], 'D2')).toBe('D2');
  });

  it('defaults userChoice to Both for mixed or empty selections', () => {
    expect(effectiveGame([d1, d2])).toBe('Both');
    expect(effectiveGame([])).toBe('Both');
  });
});

describe('accountGames / chips / coerce', () => {
  const d1 = { game: 'D1' as const };
  const d2 = { game: 'D2' as const };

  it('collects distinct games from the selection', () => {
    expect([...accountGames([d1, d2, d1])].sort()).toEqual(['D1', 'D2']);
    expect([...accountGames([])]).toEqual([]);
  });

  it('enables chips only when the selection can support them', () => {
    expect(gameFilterChipEnabled('D1', [d1])).toBe(true);
    expect(gameFilterChipEnabled('D2', [d1])).toBe(false);
    expect(gameFilterChipEnabled('Both', [d1])).toBe(false);
    expect(gameFilterChipEnabled('Both', [d1, d2])).toBe(true);
  });

  it('coerces an impossible userChoice when accounts are removed', () => {
    expect(coerceGameFilterChoice([d1], 'D2')).toBe('D1');
    expect(coerceGameFilterChoice([d2], 'D1')).toBe('D2');
    expect(coerceGameFilterChoice([d1, d2], 'D2')).toBe('D2');
    expect(coerceGameFilterChoice([d1, d2], 'Both')).toBe('Both');
  });

  it('picks a display game for single-pane tabs', () => {
    expect(displayGameFromFilter('D1', [d1, d2], 'D2')).toBe('D1');
    expect(displayGameFromFilter('Both', [d1, d2], 'D1')).toBe('D1');
    expect(displayGameFromFilter('Both', [d2], 'D1')).toBe('D2');
  });
});
