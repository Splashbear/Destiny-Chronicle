/**
 * Pure PvP / Trials classifier (site + future archive/Discord reuse).
 * Rules: docs/specs/TRIALS_BREAKDOWN_SPEC.md — modes array first, then mode fallback.
 * Never infer Trials from map name alone.
 */

import {
  D2_TRIALS_NINE_MODES,
  isD1TrialsActivityTypeHash,
  isD1TrialsPlaylistHash,
  isD2TrialsNinePlaylistHash,
  isTrialsFreelanceHash,
  MODE_TRIALS_OF_OSIRIS_D1,
  MODE_TRIALS_OF_OSIRIS_D2,
} from '../config/trials.config';

export type DestinyGame = 'D1' | 'D2';

/** Fine-grained Trials / Crucible / other buckets. */
export type PvpBucket =
  | 'trials-too' // D2 Trials of Osiris (fireteam / unknown playlist)
  | 'trials-freelance' // D2 Freelance playlist
  | 'trials-nine' // D2 Trials of the Nine (incl. Y1 countdown/survival)
  | 'trials-d1' // D1 Trials of Osiris (mode 14)
  | 'crucible' // Non-Trials PvP
  | 'other';

export type TrialsSubBucket = Exclude<PvpBucket, 'crucible' | 'other'>;

/**
 * Modes that count as general Crucible / PvP when not already classified as Trials.
 * Includes D2 Trials modes so a lone 84 still matches PvP membership checks elsewhere;
 * classifyPvp peels Trials first. D1 Trials mode 14 is NOT listed — D1-only via game gate.
 */
export const CRUCIBLE_OR_PVP_MODES: ReadonlySet<number> = new Set([
  5, 10, 12, 13, 15, 19, 25, 27, 31, 32, 37, 38, 39, 41, 42, 43, 44, 45, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 59, 60, 61, 62, 65, 68, 69, 70, 71, 72, 73, 74,
  80, 81, 84, 88, 89, 90, 91,
]);

export interface ClassifyPvpInput {
  game: DestinyGame;
  /** Full modes array from the report when present. */
  modes?: number[] | null;
  /** Fallback when modes is missing/empty: activityDetails.mode */
  mode?: number | null;
  /** Playlist / director hash preferred; referenceId checked second for Freelance. */
  directorActivityHash?: string | number | null;
  referenceId?: string | number | null;
  /** D1 DestinyActivityDefinition.activityTypeHash when present on the history row. */
  activityTypeHash?: string | number | null;
}

export interface ClassifyPvpResult {
  bucket: PvpBucket;
  /** True when bucket is any Trials variant. */
  isTrials: boolean;
  /** Effective modes list used for the decision (modes or [mode]). */
  effectiveModes: number[];
}

function resolveModes(modes: number[] | null | undefined, mode: number | null | undefined): number[] {
  if (Array.isArray(modes) && modes.length > 0) {
    return modes.map(Number).filter(n => Number.isFinite(n));
  }
  if (mode != null && Number.isFinite(Number(mode))) {
    return [Number(mode)];
  }
  return [];
}

function modesContain(effective: number[], target: number): boolean {
  return effective.includes(target);
}

function modesContainAny(effective: number[], targets: readonly number[]): boolean {
  return targets.some(t => effective.includes(t));
}

/**
 * Classify one activity into Trials / Crucible / other.
 * D1 mode 14 is Trials only when game === 'D1' (never treat D2 mode 14 as Trials).
 */
export function classifyPvp(input: ClassifyPvpInput): ClassifyPvpResult {
  const effectiveModes = resolveModes(input.modes, input.mode);
  const game = input.game === 'D1' ? 'D1' : 'D2';

  // D1 Trials — mode 14, playlist hash, or D1 Trials activityTypeHash (history often reports AllPvP=5).
  if (
    game === 'D1' &&
    (modesContain(effectiveModes, MODE_TRIALS_OF_OSIRIS_D1) ||
      isD1TrialsPlaylistHash(input.directorActivityHash) ||
      isD1TrialsPlaylistHash(input.referenceId) ||
      isD1TrialsActivityTypeHash(input.activityTypeHash))
  ) {
    return { bucket: 'trials-d1', isTrials: true, effectiveModes };
  }

  // D2 Trials of the Nine (mode 39/41/42 or Y1 Nine playlist hash when mode is only AllPvP).
  if (
    game === 'D2' &&
    (modesContainAny(effectiveModes, D2_TRIALS_NINE_MODES) ||
      isD2TrialsNinePlaylistHash(input.directorActivityHash) ||
      isD2TrialsNinePlaylistHash(input.referenceId))
  ) {
    return { bucket: 'trials-nine', isTrials: true, effectiveModes };
  }

  // D2 Trials of Osiris (2021+), including Freelance via playlist hash.
  if (game === 'D2' && modesContain(effectiveModes, MODE_TRIALS_OF_OSIRIS_D2)) {
    const freelance =
      isTrialsFreelanceHash(input.directorActivityHash) ||
      isTrialsFreelanceHash(input.referenceId);
    return {
      bucket: freelance ? 'trials-freelance' : 'trials-too',
      isTrials: true,
      effectiveModes,
    };
  }

  // Non-Trials PvP → Crucible. On D1, mode 14 already returned; remaining PvP modes count.
  if (effectiveModes.some(m => CRUCIBLE_OR_PVP_MODES.has(m))) {
    return { bucket: 'crucible', isTrials: false, effectiveModes };
  }

  // D1 Iron Banner / Control etc. already in set; also accept bare D1 mode 14 miss → other.
  // D1 non-Trials PvP that used mode numbers overlapping Reserved* still covered via set.
  if (game === 'D1' && effectiveModes.some(m => m === 5 || m === 10 || m === 12 || m === 19 || m === 27)) {
    return { bucket: 'crucible', isTrials: false, effectiveModes };
  }

  return { bucket: 'other', isTrials: false, effectiveModes };
}

/** True when this bucket rolls into a Trials breakdown tile. */
export function isTrialsBucket(bucket: PvpBucket): boolean {
  return (
    bucket === 'trials-too' ||
    bucket === 'trials-freelance' ||
    bucket === 'trials-nine' ||
    bucket === 'trials-d1'
  );
}

/** Breakdown section key: Osiris (incl. Freelance + D1) vs Nine stay separate tiles. */
export function trialsSectionKey(bucket: PvpBucket): 'trials-osiris' | 'trials-nine' | null {
  if (bucket === 'trials-nine') return 'trials-nine';
  if (bucket === 'trials-too' || bucket === 'trials-freelance' || bucket === 'trials-d1') {
    return 'trials-osiris';
  }
  return null;
}

/** Display label for a Trials sub-bucket. */
export function trialsSubBucketLabel(bucket: TrialsSubBucket): string {
  switch (bucket) {
    case 'trials-too':
      return 'Trials of Osiris';
    case 'trials-freelance':
      return 'Freelance';
    case 'trials-nine':
      return 'Trials of the Nine';
    case 'trials-d1':
      return 'Trials of Osiris (D1)';
  }
}

/** Stable activity key: game|instanceId */
export function pvpActivityKey(game: DestinyGame, instanceId: string | number | null | undefined): string {
  return `${game}|${instanceId != null ? String(instanceId) : ''}`;
}
