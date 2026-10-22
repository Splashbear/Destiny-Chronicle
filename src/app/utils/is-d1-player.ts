/**
 * Detect Destiny 1 vs D2 for a search/display player (CODE_CLEANUP_SPEC).
 * Prefers explicit `game`; falls back to membership/cross-save heuristics.
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

  // Explicit game is most reliable (set from which API was used).
  if ((player as any).game) {
    return (player as any).game === 'D1';
  }

  console.warn(
    '[isD1Player] Game property not set, using fallback detection for player:',
    player.displayName
  );

  const isXboxOrPlayStation =
    player.membershipType === 1 || player.membershipType === 2;

  if (isXboxOrPlayStation) {
    const hasCrossSaveIndicators =
      (player as any).bungieGlobalDisplayName ||
      (player as any).isCrossSavePrimary ||
      (player as any).crossSaveOverride;

    if (!hasCrossSaveIndicators) {
      return true;
    }

    const crossSaveOverride = (player as any).crossSaveOverride;
    if (
      crossSaveOverride &&
      crossSaveOverride !== player.membershipType
    ) {
      return false;
    }

    return true;
  }

  return false;
}
