/**
 * Align Accomplishments game tab when every selected account is D1 or D2 (CODE_CLEANUP_SPEC).
 */
export function syncAccomplishmentsGameWithPlayers(
  players: Array<{ isD1: boolean }>,
  current: 'D1' | 'D2'
): 'D1' | 'D2' | null {
  if (!players.length) return null;
  const allD1 = players.every((p) => p.isD1);
  const allD2 = players.every((p) => !p.isD1);
  if (allD1) return 'D1';
  if (allD2) return 'D2';
  return null;
}
