import { resolveGameDetailed } from './destiny-game';

/**
 * Detect Destiny 1 vs D2 for a search/display player.
 * Rules live in `destiny-game.ts` (explicit game, then membership type /
 * cross-save fields only count as D2 when corroborated, see tier 4 there).
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
        applicableMembershipTypes?: number[];
        bungieGlobalDisplayNameCode?: number | string;
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
    applicableMembershipTypes: player.applicableMembershipTypes,
    bungieGlobalDisplayNameCode: player.bungieGlobalDisplayNameCode,
  });
  if (source !== 'explicit') {
    console.warn(
      '[isD1Player] Game property not set, using fallback detection for player:',
      player.displayName
    );
  }
  return game === 'D1';
}
