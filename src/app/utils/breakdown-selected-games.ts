import { PlatformStats } from '../models/platform-stats.model';

/** Games represented by selected Breakdown account cards (CODE_CLEANUP_SPEC). */
export function getBreakdownSelectedGames(
  perPlatformStats: PlatformStats[] | null | undefined,
  selectedAccountKeys: Set<string>
): ('D1' | 'D2')[] {
  if (!perPlatformStats?.length || selectedAccountKeys.size === 0) {
    return [];
  }
  const set = new Set<'D1' | 'D2'>();
  for (const s of perPlatformStats) {
    if (selectedAccountKeys.has(s.accountKey)) {
      set.add(s.game);
    }
  }
  return Array.from(set);
}
