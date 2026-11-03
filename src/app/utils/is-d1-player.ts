import { resolveGameDetailed } from './destiny-game';

/**
 * Detect Destiny 1 vs D2 for a search/display player.
 * Rules live in `destiny-game.ts` (explicit game, then membership type /
 * cross-save override).
 */
export function isD1Player(
  player:
    | {
        displayName?: string;
        membershipType?: number;
        game?: 'D1' | 'D2' | string;
        bungieGlobalDisplayName?: string;
        isCrossSavePrimary?: boolean;
        crossSaveOverride?: number;
      }
    | undefined
    | null
): boolean {
  if (!player) {
    return false;
  }
  const { game, source } = resolveGameDetailed({
    game: player.game,
    membershipType: player.membershipType,
    crossSaveOverride: player.crossSaveOverride,
  });
  if (source !== 'explicit') {
    console.warn(
      '[isD1Player] Game property not set, using fallback detection for player:',
      player.displayName
    );
  }
  return game === 'D1';
}
