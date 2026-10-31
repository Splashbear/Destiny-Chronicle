/**
 * Show a success alert unless running under automation/headless (CODE_CLEANUP_SPEC).
 */
export function showSuccessMessage(message: string): void {
  console.log('[Load] ' + message);
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).webdriver) {
      return;
    }
    alert(message);
  } catch {
    // ignore
  }
}
