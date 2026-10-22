/**
 * Cached lookup for displayed account groups by game (CODE_CLEANUP_SPEC).
 */
export function getCachedDisplayedAccountGroups<T>(
  cache: Map<'D1' | 'D2', { source: any[]; preset: string; accounts: string; groups: T[] }>,
  game: 'D1' | 'D2',
  source: any[],
  preset: string,
  accounts: string
): T[] | null {
  const hit = cache.get(game);
  if (
    hit &&
    hit.source === source &&
    hit.preset === preset &&
    hit.accounts === accounts
  ) {
    return hit.groups;
  }
  return null;
}

export function putCachedDisplayedAccountGroups<T>(
  cache: Map<'D1' | 'D2', { source: any[]; preset: string; accounts: string; groups: T[] }>,
  game: 'D1' | 'D2',
  source: any[],
  preset: string,
  accounts: string,
  groups: T[]
): void {
  cache.set(game, { source, preset, accounts, groups });
}
