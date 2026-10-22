/** Load dismissed anniversary ids from sessionStorage. */
export function loadDismissedAnniversaryIds(storageKey: string): Set<string> {
  try {
    const dismissed = sessionStorage.getItem(storageKey);
    if (dismissed) {
      return new Set(JSON.parse(dismissed));
    }
  } catch (e) {
    console.warn('Failed to load dismissed anniversaries:', e);
  }
  return new Set();
}

/** Persist dismissed anniversary ids to sessionStorage. */
export function saveDismissedAnniversaryIds(
  storageKey: string,
  ids: Set<string>
): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
  } catch (e) {
    console.warn('Failed to save dismissed anniversaries:', e);
  }
}
