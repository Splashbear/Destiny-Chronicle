/**
 * Trials of Osiris / Trials of the Nine — mode numbers and Freelance playlist hashes.
 * Classification rules: docs/specs/TRIALS_BREAKDOWN_SPEC.md
 */

/** D2 DestinyActivityModeType.TrialsOfOsiris */
export const MODE_TRIALS_OF_OSIRIS_D2 = 84;

/** D1 DestinyActivityModeType.TrialsOfOsiris (classic D1 enum; not D2's 84). */
export const MODE_TRIALS_OF_OSIRIS_D1 = 14;

/** D2 Trials of the Nine + Y1 Countdown/Survival variants. */
export const MODE_TRIALS_OF_THE_NINE = 39;
export const MODE_TRIALS_COUNTDOWN = 41;
export const MODE_TRIALS_SURVIVAL = 42;

export const D2_TRIALS_NINE_MODES = [
  MODE_TRIALS_OF_THE_NINE,
  MODE_TRIALS_COUNTDOWN,
  MODE_TRIALS_SURVIVAL,
] as const;

/**
 * Freelance: Trials of Osiris playlist hashes (DestinyActivityDefinition isPlaylist).
 * directorActivityHash on history/PGCR points at these; map referenceId is the map.
 */
export const TRIALS_FREELANCE_HASHES: ReadonlySet<string> = new Set([
  '1728343233',
  '1845851296',
]);

/**
 * D1 "Trials of Osiris" playlist activity hashes (bundled D1 manifest).
 * Used when history rows are tagged AllPvP (5) instead of mode 14.
 */
export const D1_TRIALS_PLAYLIST_HASHES: ReadonlySet<string> = new Set([
  '3234259779',
  '3670262295',
]);

/**
 * D2 Trials of the Nine playlist hashes (Y1). Mode is often 39; history may only report AllPvP (5).
 * Note: 1166905690 is named "Trials of Osiris" in the manifest but modes include 39 (Nine).
 */
export const D2_TRIALS_NINE_PLAYLIST_HASHES: ReadonlySet<string> = new Set([
  '1166905690',
  '2737374369',
  '3799743268',
]);

/** D1 DestinyActivityDefinition.activityTypeHash for Trials of Osiris playlists. */
export const D1_TRIALS_ACTIVITY_TYPE_HASH = '736189348';

/** Label for Freelance bucket / hash map entries. */
export const TRIALS_FREELANCE_LABEL = 'Freelance';

/** Hash → playlist label (Freelance only for now; unknown Trials hashes stay plain ToO). */
export const TRIALS_PLAYLIST_HASH_LABELS: Readonly<Record<string, string>> = {
  '1728343233': TRIALS_FREELANCE_LABEL,
  '1845851296': TRIALS_FREELANCE_LABEL,
};

export function trialsPlaylistLabel(hash: string | number | null | undefined): string | null {
  if (hash == null || hash === '') return null;
  return TRIALS_PLAYLIST_HASH_LABELS[String(hash)] ?? null;
}

export function isTrialsFreelanceHash(hash: string | number | null | undefined): boolean {
  if (hash == null || hash === '') return false;
  return TRIALS_FREELANCE_HASHES.has(String(hash));
}

export function isD1TrialsPlaylistHash(hash: string | number | null | undefined): boolean {
  if (hash == null || hash === '') return false;
  return D1_TRIALS_PLAYLIST_HASHES.has(String(hash));
}

export function isD2TrialsNinePlaylistHash(hash: string | number | null | undefined): boolean {
  if (hash == null || hash === '') return false;
  return D2_TRIALS_NINE_PLAYLIST_HASHES.has(String(hash));
}

export function isD1TrialsActivityTypeHash(hash: string | number | null | undefined): boolean {
  if (hash == null || hash === '') return false;
  return String(hash) === D1_TRIALS_ACTIVITY_TYPE_HASH;
}
