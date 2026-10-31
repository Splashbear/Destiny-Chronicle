import { PlayerSearchDisplay } from '../models/player-search-display.model';

/** Flatten cross-save + D2 + D1 search results for the platform picker. */
export function collectModalSearchPlayers(opts: {
  crossSavePlayer: PlayerSearchDisplay | null;
  d2SearchResults: PlayerSearchDisplay[];
  d1SearchResults: PlayerSearchDisplay[];
}): PlayerSearchDisplay[] {
  const all: PlayerSearchDisplay[] = [];
  if (opts.crossSavePlayer) {
    all.push(opts.crossSavePlayer);
  }
  all.push(...opts.d2SearchResults.filter((p) => !p.isCrossSavePrimary));
  all.push(...opts.d1SearchResults);
  return all;
}

/** Players whose keys are in the modal selection set. */
export function filterModalSelectedPlayers(
  all: PlayerSearchDisplay[],
  selectedKeys: Set<string>,
  getPlayerKey: (player: PlayerSearchDisplay) => string
): PlayerSearchDisplay[] {
  return all.filter((player) => selectedKeys.has(getPlayerKey(player)));
}
