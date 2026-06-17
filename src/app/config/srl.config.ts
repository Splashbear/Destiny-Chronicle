/**
 * Sparrow Racing League (SRL).
 * D1 (Dawning): PGCR mode 29.
 * D2 (Monument of Triumph 9.7.0+): PGCR mode 94; playlist may also report aggregate PvP mode 5 — use hash/name fallbacks.
 */

/** Bungie DestinyActivityModeType for D1 SRL. */
export const SRL_ACTIVITY_MODE_D1 = 29;

/** Bungie DestinyActivityModeType for D2 SRL (MoT 9.7.0+). */
export const SRL_ACTIVITY_MODE_D2 = 94;

export const SRL_ACTIVITY_MODES = [SRL_ACTIVITY_MODE_D1, SRL_ACTIVITY_MODE_D2] as const;

/** @deprecated Use SRL_ACTIVITY_MODES; D1-only callers may still use 29. */
export const SRL_ACTIVITY_MODE = SRL_ACTIVITY_MODE_D1;

/** Known D1 SRL activity referenceIds (from bundled D1 manifest). */
export const D1_SRL_HASHES: string[] = [
  '496237130',
  '1478347980', // Campus Martius
  '1604535501',
  '2243240710', // Infinite Descent
  '4222208550'
];

/**
 * D2 SRL track / playlist referenceIds (Monument of Triumph 9.7.0+, manifest mode 94).
 * Variants per track are normal/prestige or playlist node duplicates.
 */
export const D2_SRL_HASHES: string[] = [
  // Campus Martius
  '2227496071',
  '2880643637',
  // Infinite Descent
  '672398899',
  '3870512513',
  // Quantum Circuit (new MoT track)
  '3683857964',
  '4058499058',
  // Haakon Precipice
  '1079634867',
  '3528554193',
  // Shining Sands
  '94140435',
  '2632405857',
  // Sparrow Racing League playlist nodes
  '342590048',
  '1751043439',
  '3532626736'
];

/** D2 SRL type hash from DestinyActivityDefinition (all MoT SRL tracks). */
export const D2_SRL_TYPE_HASH = 728792238;

/** Track names for grouping in Activities / Breakdown (case-insensitive exact match). */
export const SRL_TRACK_NAMES: string[] = [
  'Campus Martius',
  'Infinite Descent',
  'Quantum Circuit',
  'Haakon Precipice',
  'Shining Sands',
  'Sparrow Racing League'
];

const SRL_NAME_PATTERNS = [
  'Sparrow Racing League',
  'Sparrow Racing'
];

/** Crucible playlist name that is not MoT SRL. */
const SRL_EXCLUDE_NAME_PATTERNS = ['Sparrow Control'];

export function isSrlActivity(
  referenceId: string | number,
  name?: string,
  mode?: number
): boolean {
  const ref = String(referenceId);
  if (D1_SRL_HASHES.includes(ref) || D2_SRL_HASHES.includes(ref)) {
    return true;
  }
  if (mode != null && (SRL_ACTIVITY_MODES as readonly number[]).includes(mode)) {
    return true;
  }
  if (!name) {
    return false;
  }
  const lower = name.toLowerCase().trim();
  if (SRL_EXCLUDE_NAME_PATTERNS.some((p) => lower === p.toLowerCase())) {
    return false;
  }
  if (SRL_NAME_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) {
    return true;
  }
  return SRL_TRACK_NAMES.some((track) => lower === track.toLowerCase());
}

/** Display family for grouping: track name when known, else generic SRL label. */
export function getSrlDisplayBaseName(activityName: string): string {
  const trimmed = (activityName || '').trim();
  if (!trimmed) {
    return 'Sparrow Racing League';
  }
  const lower = trimmed.toLowerCase();
  const track = SRL_TRACK_NAMES.find((t) => lower === t.toLowerCase());
  if (track) {
    return track;
  }
  if (SRL_NAME_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) {
    return 'Sparrow Racing League';
  }
  return trimmed;
}
