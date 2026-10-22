/**
 * Unique key for activity/player account cards: game-platform-membershipId (CODE_CLEANUP_SPEC).
 */
export function buildAccountKey(input: {
  game?: string;
  membershipId?: string;
  membershipType?: number;
  getPlatformName(membershipType: number): string;
}): string {
  const game = input.game || 'D2';
  const platform = input.getPlatformName(input.membershipType ?? 0);
  return `${game}-${platform}-${input.membershipId ?? ''}`;
}
