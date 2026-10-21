import { PlayerSearchResult } from '../core/data/bungie-api.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { getPlatformName } from './platform-name';

/** Normalize a search result into a dashboard PlayerSearchDisplay row. */
export function toDisplayPlayer(
  player: PlayerSearchResult | PlayerSearchDisplay,
  opts: { isPrimary: boolean; game?: 'D1' | 'D2' }
): PlayerSearchDisplay {
  const game = opts.game || (player as PlayerSearchDisplay).game || 'D2';
  return {
    ...player,
    game,
    platform: getPlatformName(player.membershipType),
    isPrimary: opts.isPrimary,
  } as PlayerSearchDisplay;
}
