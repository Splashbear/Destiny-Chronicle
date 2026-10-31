/**
 * Duration for one stored / history activity row (seconds).
 * Shared by Account Summary and activity-db so PGCR time stays consistent.
 */
export function activityDurationSeconds(activity: any): number {
  const values = activity?.values as any;
  let seconds =
    values?.timePlayedSeconds?.basic?.value ??
    values?.secondsPlayed?.basic?.value ??
    values?.activityDurationSeconds?.basic?.value;
  if (typeof values?.secondsPlayed === 'number') seconds = values.secondsPlayed;
  if (typeof values?.timePlayedSeconds === 'number') seconds = values.timePlayedSeconds;
  if (typeof values?.activityDurationSeconds === 'number') {
    seconds = values.activityDurationSeconds;
  }
  if (typeof activity?.secondsPlayed === 'number') seconds = activity.secondsPlayed;
  if (typeof activity?.timePlayedSeconds === 'number') seconds = activity.timePlayedSeconds;

  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return 0;
  if (seconds > 86400) return 86400;
  return seconds;
}

/** Sum durations for a list of stored activities. */
export function sumActivityDurationSeconds(activities: readonly any[]): number {
  let sum = 0;
  for (const activity of activities) {
    sum += activityDurationSeconds(activity);
  }
  return sum;
}
