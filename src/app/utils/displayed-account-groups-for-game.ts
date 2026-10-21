/**
 * Cached displayed account groups for Activities tab (CODE_CLEANUP_SPEC).
 */
export function getOrBuildDisplayedAccountGroupsForGame(input: {
  game: 'D1' | 'D2';
  cache: Map<'D1' | 'D2', { source: any[]; preset: string; accounts: string; groups: any[] }>;
  source: any[];
  preset: string;
  selectedAccountKeys: Set<string>;
  buildGroups: () => any[];
}): any[] {
  const accounts = Array.from(input.selectedAccountKeys).sort().join('\n');
  const hit = input.cache.get(input.game);
  if (
    hit &&
    hit.source === input.source &&
    hit.preset === input.preset &&
    hit.accounts === accounts
  ) {
    return hit.groups;
  }
  const groups = input.buildGroups();
  input.cache.set(input.game, {
    source: input.source,
    preset: input.preset,
    accounts,
    groups,
  });
  return groups;
}
