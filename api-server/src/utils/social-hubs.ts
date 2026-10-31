/**
 * W6: social hubs are valid archive rows but off-focus (Bungie history never lists them).
 * Exclude from player-activity lists, coverage checks, and clear/completion-oriented counts.
 *
 * Rule: mode === 40 (Social), OR mode === 0 with a known hub activity hash.
 * Hashes from bungie_independence/oddity/report.md (manifest names).
 */

/**
 * D1 Tower / Tower-like spaces (BOT_DECISIONS 2026-10-30 addendum).
 * Treated as social regardless of mode — keep in DB, exclude from lists/totals.
 */
export const D1_SOCIAL_ACTIVITY_HASHES: ReadonlySet<number> = new Set([
  2330516073, // Tower
  1522220810, // Tower variant
  2370413227, // unidentified Tower-like (not in D1 manifest)
]);

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
  // W13: blank-named def with directActivityModeType=40 / Social mode hash (often stored as mode 0)
  1202765834,
  ...D1_SOCIAL_ACTIVITY_HASHES,
]);

export interface SocialHubLike {
  mode?: number | null;
  activity_hash?: number | null;
  activityHash?: number | null;
}

/** True if this row is a social hub visit (mode 40, D1 Tower hash, or mode-0 hub hash). */
export function isSocialHubActivity(row: SocialHubLike): boolean {
  const hash = Number(row.activity_hash ?? row.activityHash ?? NaN);
  if (Number.isFinite(hash) && D1_SOCIAL_ACTIVITY_HASHES.has(hash)) return true;
  const mode = Number(row.mode ?? NaN);
  if (mode === 40) return true;
  if (mode !== 0) return false;
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
