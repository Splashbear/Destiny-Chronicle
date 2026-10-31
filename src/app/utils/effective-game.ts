/**
 * GAME_FILTER_SPEC — shared game filter from selected accounts + user choice.
 * Accounts are keyed by game (+ platform + membership elsewhere); never by name.
 */

export type GameFilterChoice = 'D1' | 'D2' | 'Both';
export type EffectiveGame = 'D1' | 'D2' | 'Both';

export interface GameFilterAccount {
  game?: string | null;
}

/** Which Destiny games appear in the current selection. */
export function accountGames(selectedAccounts: GameFilterAccount[]): Set<'D1' | 'D2'> {
  const games = new Set<'D1' | 'D2'>();
  for (const account of selectedAccounts || []) {
    if (account?.game === 'D1') games.add('D1');
    else if (account?.game === 'D2') games.add('D2');
  }
  return games;
}

/**
 * Resolve which game filter applies.
 * - All selected accounts D1 → D1
 * - All selected accounts D2 → D2
 * - Mixed (or empty) → userChoice (default Both)
 */
export function effectiveGame(
  selectedAccounts: GameFilterAccount[],
  userChoice: GameFilterChoice = 'Both'
): EffectiveGame {
  const games = accountGames(selectedAccounts);
  if (games.size === 1) {
    return games.has('D1') ? 'D1' : 'D2';
  }
  return userChoice;
}

/** True when a chip/game is available for the current selection. */
export function gameFilterChipEnabled(
  chip: GameFilterChoice,
  selectedAccounts: GameFilterAccount[]
): boolean {
  const games = accountGames(selectedAccounts);
  if (chip === 'Both') return games.size > 1;
  return games.has(chip);
}

/**
 * Single-game tabs (Accomplishments, Firsts, …) need D1 or D2 for content.
 * When the filter is Both, keep the current pane if still valid.
 */
export function displayGameFromFilter(
  effective: EffectiveGame,
  selectedAccounts: GameFilterAccount[],
  current: 'D1' | 'D2' = 'D2'
): 'D1' | 'D2' {
  if (effective === 'D1' || effective === 'D2') return effective;
  const games = accountGames(selectedAccounts);
  if (games.has(current)) return current;
  if (games.has('D2')) return 'D2';
  if (games.has('D1')) return 'D1';
  return current;
}

/** Coerce userChoice when the selection makes it impossible (e.g. D2 chosen, last D2 removed). */
export function coerceGameFilterChoice(
  selectedAccounts: GameFilterAccount[],
  userChoice: GameFilterChoice
): GameFilterChoice {
  const games = accountGames(selectedAccounts);
  if (games.size === 0) return 'Both';
  if (games.size === 1) return games.has('D1') ? 'D1' : 'D2';
  if (userChoice === 'D1' || userChoice === 'D2') {
    return games.has(userChoice) ? userChoice : 'Both';
  }
  return 'Both';
}
