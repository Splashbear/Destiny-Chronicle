/**
 * Bungie ships many sunset / variant activities with
 * displayProperties.icon = "/img/misc/missing_icon_d2.png".
 * That asset is a tiny grey slash box — treat it as "no icon".
 */
const PLACEHOLDER_ICON_RE = /missing_icon(?:_d2)?(?:\.png)?(?:\?|$)/i;

/** True when a manifest icon path is Bungie's empty/missing placeholder. */
export function isPlaceholderBungieIcon(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return true;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_ICON_RE.test(trimmed);
}

/** Return the path when it is usable art; otherwise null. */
export function usableBungieIconPath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl || isPlaceholderBungieIcon(pathOrUrl)) return null;
  return pathOrUrl.trim();
}
