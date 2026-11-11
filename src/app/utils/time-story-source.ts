import {
  ownPlayerTimePlayedSeconds,
  playerTimePlayedSeconds,
} from './player-time-played-seconds';

/**
 * Lean Time Story input. Archive /players/{id}/activities rows carry only
 * durationSeconds (no player timePlayedSeconds). Bungie history rows carry
 * the player's own time, which must win when both exist for an instance.
 */
export interface TimeStorySourceRow {
  instanceId?: string;
  period?: string;
  membershipId?: string;
  characterId?: string;
  game?: 'D1' | 'D2';
  mode?: number;
  activityHash?: string | number;
  /** Set only when the source actually has a player-time field. */
  timePlayedSeconds?: number | null;
  durationSeconds?: number | null;
  /** 1 or 0 when the source has a completed flag; omitted when unknown. */
  completed?: number | null;
}

export function leanFromArchiveLight(light: {
  instanceId?: string | number;
  period?: string;
  membershipId?: string;
  characterId?: string;
  game?: 'D1' | 'D2';
  mode?: number;
  activityHash?: string | number;
  durationSeconds?: number;
  timePlayedSeconds?: number;
  secondsPlayed?: number;
  completed?: number;
}): TimeStorySourceRow | null {
  const instanceId = light?.instanceId != null ? String(light.instanceId) : '';
  if (!instanceId) return null;
  // Archive lights officially carry durationSeconds. Converters also copy
  // that duration into values.timePlayedSeconds for other site totals —
  // do not treat that alias as personal time. Only a distinct top-level
  // player-time field is trusted here.
  const playerTime = ownPlayerTimePlayedSeconds({
    timePlayedSeconds: light.timePlayedSeconds,
    secondsPlayed: light.secondsPlayed,
  });
  return {
    instanceId,
    period: light.period,
    membershipId: light.membershipId,
    characterId: light.characterId != null ? String(light.characterId) : undefined,
    game: light.game,
    mode: light.mode,
    activityHash: light.activityHash,
    timePlayedSeconds: playerTime,
    durationSeconds:
      typeof light.durationSeconds === 'number' && Number.isFinite(light.durationSeconds)
        ? light.durationSeconds
        : null,
    completed: completedFlag(light.completed),
  };
}

export function leanFromBungieHistory(activity: {
  period?: string;
  membershipId?: string;
  characterId?: string;
  game?: 'D1' | 'D2';
  activityDetails?: { instanceId?: string | number; referenceId?: string | number; mode?: number };
  values?: unknown;
  timePlayedSeconds?: number;
  secondsPlayed?: number;
  completed?: number;
}): TimeStorySourceRow | null {
  const instanceId = activity?.activityDetails?.instanceId;
  if (instanceId == null || String(instanceId) === '') return null;
  const values = activity.values as { completed?: { basic?: { value?: number } } | number } | undefined;
  const rawCompleted =
    typeof activity.completed === 'number'
      ? activity.completed
      : typeof values?.completed === 'number'
        ? values.completed
        : values?.completed?.basic?.value;
  return {
    instanceId: String(instanceId),
    period: activity.period,
    membershipId: activity.membershipId,
    characterId: activity.characterId != null ? String(activity.characterId) : undefined,
    game: activity.game,
    mode: activity.activityDetails?.mode,
    activityHash: activity.activityDetails?.referenceId,
    timePlayedSeconds: ownPlayerTimePlayedSeconds(activity),
    completed: completedFlag(rawCompleted),
  };
}

/** Seconds to chart: player time when present, otherwise archive duration. */
export function timeStorySourceSeconds(row: TimeStorySourceRow): number {
  return playerTimePlayedSeconds(row);
}

/**
 * Merge lean rows by instance id (and membership/game when present).
 * A later row with a real player-time value overwrites duration-only time.
 */
export function mergeTimeStorySourceRows(
  base: TimeStorySourceRow[],
  incoming: TimeStorySourceRow[]
): TimeStorySourceRow[] {
  const map = new Map<string, TimeStorySourceRow>();
  const remember = (row: TimeStorySourceRow | null | undefined) => {
    if (!row?.instanceId) return;
    const key = `${row.membershipId ?? ''}|${row.game ?? ''}|${row.instanceId}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...row });
      return;
    }
    const playerTime = row.timePlayedSeconds ?? prev.timePlayedSeconds;
    map.set(key, {
      ...prev,
      ...row,
      timePlayedSeconds: playerTime,
      durationSeconds: row.durationSeconds ?? prev.durationSeconds,
      period: row.period || prev.period,
      mode: row.mode ?? prev.mode,
      activityHash: row.activityHash ?? prev.activityHash,
      completed: row.completed ?? prev.completed,
    });
  };
  for (const row of base) remember(row);
  for (const row of incoming) remember(row);
  return Array.from(map.values());
}

function completedFlag(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value === 1 ? 1 : 0;
}
