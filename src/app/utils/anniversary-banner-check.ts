/**
 * Pre-check before computing anniversary rows (CODE_CLEANUP_SPEC).
 * Returns 'compute' when it is safe to build anniversary data.
 */
export function anniversaryBannerPrecheck(input: {
  loadingActivities: boolean;
  loadingGuardianFirsts: boolean;
  dismissKey: string;
  dismissedAnniversaries: Set<string>;
  selectedPlayersLength: number;
  selectedDate: string | null | undefined;
}): 'skip' | 'hide' | 'compute' {
  if (input.loadingActivities || input.loadingGuardianFirsts) {
    return 'skip';
  }
  if (input.dismissedAnniversaries.has(input.dismissKey)) {
    return 'hide';
  }
  if (!input.selectedPlayersLength || !input.selectedDate) {
    return 'hide';
  }
  return 'compute';
}
