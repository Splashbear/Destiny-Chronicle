/**
 * Clear per-player activity/character caches when selection changes (CODE_CLEANUP_SPEC).
 */
export function clearPlayerSpecificCaches(input: {
  selectedPlayers: Array<{ membershipId: string; game?: 'D1' | 'D2' }>;
  getPlayerKey: (p: { membershipId: string; game?: 'D1' | 'D2' }) => string;
  activityCache: Map<string, unknown>;
  characters: Record<string, unknown>;
  activities: Record<string, unknown>;
}): void {
  for (const player of input.selectedPlayers) {
    input.activityCache.delete(input.getPlayerKey(player));
  }
  for (const key of Object.keys(input.characters)) {
    delete input.characters[key];
  }
  for (const key of Object.keys(input.activities)) {
    delete input.activities[key];
  }
}
