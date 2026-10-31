/** Title-case loading status for UI (CODE_CLEANUP_SPEC). */
export function formatStatusDisplay(status: string): string {
  return status.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
