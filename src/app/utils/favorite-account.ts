import { FavoriteAccount } from '../services/activity-db.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

/** Whether a player matches a favorite row (CODE_CLEANUP_SPEC). */
export function isFavoriteAccount(
  favorites: FavoriteAccount[],
  player: Pick<PlayerSearchDisplay, 'membershipId' | 'game' | 'membershipType'>
): boolean {
  return favorites.some(
    (f) =>
      f.membershipId === player.membershipId &&
      f.game === player.game &&
      f.membershipType === player.membershipType
  );
}

/** Build a FavoriteAccount row from a search display player (CODE_CLEANUP_SPEC). */
export function buildFavoriteAccountFromPlayer(
  player: PlayerSearchDisplay,
  getFavoriteKey: (account: {
    membershipId: string;
    game: 'D1' | 'D2';
    membershipType: number;
  }) => string
): FavoriteAccount {
  return {
    membershipId: player.membershipId,
    membershipType: player.membershipType,
    displayName: player.displayName,
    game: player.game,
    platform: player.platform,
    lastUpdated: new Date().toISOString(),
    compositeKey: getFavoriteKey({
      membershipId: player.membershipId,
      game: player.game,
      membershipType: player.membershipType,
    }),
  };
}
