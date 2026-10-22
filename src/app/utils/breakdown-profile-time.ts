/**
 * Total playtime seconds for the current Breakdown view from activity stats (CODE_CLEANUP_SPEC).
 */
export function getBreakdownProfileTotalTimeSeconds(input: {
  perPlatformStats?: Array<{ accountKey: string; totalTime?: number }> | null;
  hasBreakdownAccountFilter: boolean;
  selectedAccountKeysForBreakdown: Set<string>;
  accountStats?: { totalActivityTime?: number; totalTime?: number } | null;
}): number {
  const per = input.perPlatformStats;
  if (per && per.length) {
    if (!input.hasBreakdownAccountFilter) {
      return per.reduce((sum, s) => sum + (s.totalTime ?? 0), 0);
    }
    return per
      .filter((s) => input.selectedAccountKeysForBreakdown.has(s.accountKey))
      .reduce((sum, s) => sum + (s.totalTime ?? 0), 0);
  }
  return (
    input.accountStats?.totalActivityTime ?? input.accountStats?.totalTime ?? 0
  );
}
