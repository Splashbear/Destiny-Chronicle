/**
 * W6: social hubs are valid archive rows but off-focus (Bungie history never lists them).
 * Exclude from player-activity lists, coverage checks, and clear/completion-oriented counts.
 *
 * Rule: mode === 40 (Social), OR mode === 0 with a known hub activity hash.
 * Hashes from bungie_independence/oddity/report.md (manifest names).
 */

/** Activity hashes for mode-0 hub visits (and known Tower variants). */
export const SOCIAL_HUB_ACTIVITY_HASHES: ReadonlySet<number> = new Set([
  3737830648, // Tower
  2728138991, // Tower (variant)
  1771176108, // The Last City
  2081550970, // The Enclave
  3449580079, // Hall of Champions
  2565561509, // Xur's Treasure Hoard
  330545737, // The Farm
  3053411168, // Last City: Eliksni Quarter
]);

export interface SocialHubLike {
  mode?: number | null;
  activity_hash?: number | null;
  activityHash?: number | null;
}

/** True if this row is a social hub visit (mode 40 or mode-0 hub hash). */
export function isSocialHubActivity(row: SocialHubLike): boolean {
  const mode = Number(row.mode ?? NaN);
  if (mode === 40) return true;
  if (mode !== 0) return false;
  const hash = Number(row.activity_hash ?? row.activityHash ?? NaN);
  return Number.isFinite(hash) && SOCIAL_HUB_ACTIVITY_HASHES.has(hash);
}

/** Drop hub rows; returns kept + how many were excluded. */
export function filterSocialHubs<T extends SocialHubLike>(
  rows: T[]
): { kept: T[]; excluded: number } {
  const kept: T[] = [];
  let excluded = 0;
  for (const row of rows) {
    if (isSocialHubActivity(row)) excluded++;
    else kept.push(row);
  }
  return { kept, excluded };
}
