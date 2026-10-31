import { PlayerSearchDisplay } from '../models/player-search-display.model';

function isPlayable(player: PlayerSearchDisplay): boolean {
  return player.hasGames !== false;
}

/**
 * Preselect playable accounts for the platform picker (GAME_FILTER_SPEC 2.1).
 * Empty Stadia/Epic/etc. stay listed but are not selected.
 */
export function preselectDefaultModalAccounts(input: {
  crossSavePlayer: PlayerSearchDisplay | null;
  d1SearchResults: PlayerSearchDisplay[];
  d2SearchResults?: PlayerSearchDisplay[];
  getPlayerKey(player: PlayerSearchDisplay): string;
}): Set<string> {
  const selected = new Set<string>();
  if (input.crossSavePlayer && isPlayable(input.crossSavePlayer)) {
    selected.add(input.getPlayerKey(input.crossSavePlayer));
  }
  for (const player of input.d2SearchResults || []) {
    if (!isPlayable(player) || player.isCrossSavePrimary) continue;
    selected.add(input.getPlayerKey(player));
  }
  const playableD1 = input.d1SearchResults.filter(isPlayable);
  if (playableD1.length === 1) {
    selected.add(input.getPlayerKey(playableD1[0]));
    return selected;
  }
  if (playableD1.length > 1 && input.crossSavePlayer) {
    const match = playableD1.find(
      (p) => p.membershipType === input.crossSavePlayer!.membershipType
    );
    if (match) {
      selected.add(input.getPlayerKey(match));
    }
  }
  return selected;
}
