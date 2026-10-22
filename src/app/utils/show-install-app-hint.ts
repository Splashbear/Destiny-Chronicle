/** Whether to show the PWA install hint (CODE_CLEANUP_SPEC). */
export function showInstallAppHint(input: {
  showOfflineDeviceReady: boolean;
  isOfflineArchiveMode: boolean;
}): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return !standalone && (input.showOfflineDeviceReady || input.isOfflineArchiveMode);
}
