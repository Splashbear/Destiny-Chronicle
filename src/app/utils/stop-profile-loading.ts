/**
 * Apply stop-profile-loading UI resets (CODE_CLEANUP_SPEC).
 * Caller still clears players / syncs stores / detects changes.
 */
export function applyStopProfileLoadingFlags(c: {
  profileLoadInProgress: boolean;
  showLoadingModal: boolean;
  isLoadingComplete: boolean;
  loadingProgress: unknown;
  favoriteAccounts: unknown[];
  showFavoritesLoadPrompt: boolean;
}): void {
  console.log('[LOAD] User stopped profile loading');
  c.profileLoadInProgress = false;
  c.showLoadingModal = false;
  c.isLoadingComplete = false;
  c.loadingProgress = null;
  if (c.favoriteAccounts.length > 0) {
    c.showFavoritesLoadPrompt = true;
  }
}
