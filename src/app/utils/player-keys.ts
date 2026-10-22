/** Stable player / favorite keys (CODE_CLEANUP_SPEC). */

export function getPlayerKey(p: {
  membershipId: string;
  game?: 'D1' | 'D2' | string;
}): string {
  return `${p.game || 'D2'}|${p.membershipId}`;
}

/** Composite favorite key — order matches ActivityDb favorites. */
export function getFavoriteKey(p: {
  membershipId: string;
  game?: 'D1' | 'D2' | string;
  membershipType?: number;
}): string {
  return `${p.membershipId}|${p.game || 'D2'}|${p.membershipType ?? ''}`;
}
