import { FavoriteAccount } from '../services/activity-db.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

/** Build deduped FavoriteAccount rows from modal selection (CODE_CLEANUP_SPEC). */
export function buildFavoriteAccountsFromPlayers(
  selectedPlayers: PlayerSearchDisplay[],
  getFavoriteKey: (account: {
    membershipId: string;
    game: 'D1' | 'D2';
    membershipType: number;
  }) => string
): FavoriteAccount[] {
  const now = new Date().toISOString();
  const uniqueFavorites = new Map<string, FavoriteAccount>();
  for (const player of selectedPlayers) {
    const fav: FavoriteAccount = {
      membershipId: player.membershipId,
      membershipType: player.membershipType,
      displayName: player.displayName,
      game: player.game,
      platform: player.platform,
      lastUpdated: now,
      compositeKey: getFavoriteKey({
        membershipId: player.membershipId,
        game: player.game,
        membershipType: player.membershipType,
      }),
    };
    const key = getFavoriteKey(fav);
    if (!uniqueFavorites.has(key)) {
      uniqueFavorites.set(key, fav);
    }
  }
  return Array.from(uniqueFavorites.values());
}
