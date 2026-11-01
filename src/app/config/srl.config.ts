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
  mode?: number,
  game?: 'D1' | 'D2'
): boolean {
  const ref = String(referenceId);
  const d1Hash = D1_SRL_HASHES.includes(ref);
  const d2Hash = D2_SRL_HASHES.includes(ref);
  if (game === 'D1') {
    if (d1Hash || mode === SRL_ACTIVITY_MODE_D1) return true;
  } else if (game === 'D2') {
    if (d2Hash || mode === SRL_ACTIVITY_MODE_D2) return true;
  } else if (d1Hash || d2Hash) {
    return true;
  } else if (mode != null && (SRL_ACTIVITY_MODES as readonly number[]).includes(mode)) {
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

/**
 * Bungie history row fields used to detect D2 SRL. Since the Oct 2026 SRL
 * return, Bungie reports many SRL games as mode 32 (PrivateMatchesAll) with
 * directorActivityHash = the SRL playlist node, instead of mode 94.
 */
export interface SrlHistoryRowLike {
  activityDetails?: {
    referenceId?: string | number | null;
    directorActivityHash?: string | number | null;
    mode?: number | null;
    modes?: number[] | null;
  } | null;
}

/** True when a Bungie / stored history row is an SRL race (track, playlist node, or mode list). */
export function isSrlHistoryRow(
  row: SrlHistoryRowLike | null | undefined,
  name?: string,
  game?: 'D1' | 'D2'
): boolean {
  const d = row?.activityDetails;
  if (!d) return false;
  const modes = Array.isArray(d.modes) ? d.modes.map(Number) : [];
  if (game === 'D1') {
    if (modes.includes(SRL_ACTIVITY_MODE_D1)) return true;
  } else if (game === 'D2') {
    if (modes.includes(SRL_ACTIVITY_MODE_D2)) return true;
    if (d.directorActivityHash != null && D2_SRL_HASHES.includes(String(d.directorActivityHash))) {
      return true;
    }
  } else {
    if (modes.some(m => (SRL_ACTIVITY_MODES as readonly number[]).includes(m))) return true;
    if (d.directorActivityHash != null && D2_SRL_HASHES.includes(String(d.directorActivityHash))) {
      return true;
    }
  }
  return isSrlActivity(d.referenceId ?? '', name, d.mode ?? undefined, game);
}

/**
 * Mode to use for grouping. SRL rows reported as mode 32 / 5 get the SRL mode
 * for their game so every race of a track lands in one Breakdown row.
 */
export function srlGroupingMode(
  row: SrlHistoryRowLike | null | undefined,
  game: 'D1' | 'D2',
  name?: string
): number | undefined {
  const mode = row?.activityDetails?.mode ?? undefined;
  if (!isSrlHistoryRow(row, name, game)) return mode;
  return game === 'D1' ? SRL_ACTIVITY_MODE_D1 : SRL_ACTIVITY_MODE_D2;
}