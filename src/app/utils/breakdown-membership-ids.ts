import { PlayerSearchDisplay } from '../models/player-search-display.model';

/** Membership IDs for Breakdown load given account-card filter (CODE_CLEANUP_SPEC). */
export function getBreakdownMembershipIds(
  selectedPlayers: PlayerSearchDisplay[],
  selectedAccountKeys: Set<string>,
  getAccountKey: (player: PlayerSearchDisplay) => string
): string[] {
  if (!selectedPlayers?.length) return [];
  if (selectedAccountKeys.size > 0) {
    return Array.from(
      new Set(
        selectedPlayers
          .filter((p) => selectedAccountKeys.has(getAccountKey(p)))
          .map((p) => p.membershipId)
      )
    );
  }
  return Array.from(new Set(selectedPlayers.map((p) => p.membershipId)));
}
