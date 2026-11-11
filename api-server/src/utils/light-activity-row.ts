import { LeanActivity, LightActivityRow } from '../types/lean-activity.types';
import { isD1StatsUnavailable } from './d1-stats-unavailable';

/**
 * Map a parquet/API source completed value without inventing a result.
 * 1/true → true, 0/false → false, null/empty/unknown → null.
 */
export function sourceCompleted(value: unknown): boolean | null {
  if (value == null || value === '') return null;
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  const n = Number(value);
  if (Number.isFinite(n)) return n === 1 ? true : n === 0 ? false : null;
  return null;
}

/**
 * Convert LeanActivity to LightActivityRow for the API response.
 * D1 rows with no usable combat stats set statsUnavailable and null kills/time,
 * but preserve a known source completed flag. Never invent completed when the
 * source did not supply one.
 */
export function toLightActivityRow(activity: LeanActivity): LightActivityRow {
  const completed = sourceCompleted(activity.completed);
  const unavailable = isD1StatsUnavailable(activity) || !!activity.stats_missing;
  if (unavailable) {
    return {
      instanceId: activity.instance_id,
      period: activity.period,
      activityHash: activity.activity_hash,
      mode: activity.mode,
      membershipId: activity.membership_id,
      membershipType: activity.membership_type,
      characterId: activity.character_id,
      completed,
      deaths: null,
      kills: null,
      assists: null,
      durationSeconds: null,
      game: activity.game,
      displayName: activity.display_name || undefined,
      statsUnavailable: true,
    };
  }
  return {
    instanceId: activity.instance_id,
    period: activity.period,
    activityHash: activity.activity_hash,
    mode: activity.mode,
    membershipId: activity.membership_id,
    membershipType: activity.membership_type,
    characterId: activity.character_id,
    completed,
    deaths: activity.deaths,
    kills: activity.kills,
    assists: activity.assists,
    durationSeconds: activity.duration_seconds,
    game: activity.game,
    displayName: activity.display_name || undefined,
  };
}
