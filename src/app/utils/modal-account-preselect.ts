import { PlayerSearchDisplay } from '../models/player-search-display.model';

/**
 * Preselect Cross Save + a primary D1 account for the platform picker (CODE_CLEANUP_SPEC).
 */
export function preselectDefaultModalAccounts(input: {
  crossSavePlayer: PlayerSearchDisplay | null;
  d1SearchResults: PlayerSearchDisplay[];
  getPlayerKey(player: PlayerSearchDisplay): string;
}): Set<string> {
  const selected = new Set<string>();
  if (input.crossSavePlayer) {
    selected.add(input.getPlayerKey(input.crossSavePlayer));
  }
  if (input.d1SearchResults.length === 1) {
    selected.add(input.getPlayerKey(input.d1SearchResults[0]));
    return selected;
  }
  if (input.d1SearchResults.length > 1 && input.crossSavePlayer) {
    const match = input.d1SearchResults.find(
      (p) => p.membershipType === input.crossSavePlayer!.membershipType
    );
    if (match) {
      selected.add(input.getPlayerKey(match));
    }
  }
  return selected;
}
