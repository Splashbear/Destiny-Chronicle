/**
 * Account Summary accuracy checks.
 * Time in activities = summed activity-report durations (IndexedDB).
 * Total time in game = Bungie profile minutesPlayedTotal.
 */
export function accountSummaryTimeIssue(input: {
  activityCount: number;
  timeInActivitiesSeconds: number;
  timeInGameSeconds: number;
}): string | null {
  const { activityCount, timeInActivitiesSeconds, timeInGameSeconds } = input;

  if (activityCount > 0 && timeInActivitiesSeconds <= 0) {
    return (
      `Time in activities is ${timeInActivitiesSeconds}s but activity count is ${activityCount}. ` +
      'Activity time must be summed from IndexedDB history, not an empty UI cache.'
    );
  }

  // Allow small slack: profile clock vs summed reports can disagree slightly.
  if (
    timeInGameSeconds > 0 &&
    timeInActivitiesSeconds > timeInGameSeconds + 3600
  ) {
    return (
      `Time in activities (${timeInActivitiesSeconds}s) exceeds total time in game ` +
      `(${timeInGameSeconds}s) by more than 1h — check double-counting or unit errors.`
    );
  }

  return null;
}
