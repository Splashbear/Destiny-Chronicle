import { ActivityHistory } from '../models/activity-history.model';

/**
 * Duration in seconds for an activity row (D1/D2 value shapes).
 * Caps at 24h; returns 0 when missing/invalid.
 */
export function getActivityDurationSeconds(activity: ActivityHistory | { values?: any }): number {
  const values = activity.values as any;
  let seconds =
    values?.timePlayedSeconds?.basic?.value ??
    values?.secondsPlayed?.basic?.value ??
    values?.activityDurationSeconds?.basic?.value;
  if (typeof values?.secondsPlayed === 'number') seconds = values.secondsPlayed;
  if (typeof values?.timePlayedSeconds === 'number') seconds = values.timePlayedSeconds;

  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return 0;
  if (seconds > 86400) return 86400;
  return seconds;
}
