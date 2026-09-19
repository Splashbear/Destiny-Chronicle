/**
 * Username search parsing for the player search box.
 * Comma/newline lists are multiple people. A Bungie Name with # stays one query,
 * even when the display name itself contains a comma.
 */

export function parseUsernames(input: string): string[] {
  const raw = (input || '').split(/[\n,]+/g).map(s => s.trim()).filter(Boolean);
  return Array.from(new Set(raw));
}

/** True for a single Bungie Name like "Splashbear#1078" or "Last, First#1234". */
export function looksLikeSingleBungieName(raw: string): boolean {
  const value = (raw || '').trim();
  if (!value) return false;
  return /^.+#\d{1,6}$/.test(value);
}

/**
 * Whether the raw search box should be sent as one query instead of split.
 * "splashbear, puddlecubs" → false (two people).
 * "Last, First#1234" → true (one Bungie Name).
 */
export function shouldSearchAsSingleUsername(raw: string): boolean {
  const value = (raw || '').trim();
  if (!value) return false;
  if (looksLikeSingleBungieName(value)) return true;
  return parseUsernames(value).length <= 1;
}
