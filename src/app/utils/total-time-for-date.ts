/**
 * Sum activity durations for the selected date, optionally filtered by account (CODE_CLEANUP_SPEC).
 */
export function sumTotalTimeForSelectedDate<T>(input: {
  activities: T[] | null | undefined;
  selectedAccountKeys: Set<string>;
  getAccountKey: (act: T) => string;
  getDurationSeconds: (act: T) => number;
}): number {
  if (!input.activities || input.activities.length === 0) return 0;
  const list =
    input.selectedAccountKeys.size > 0
      ? input.activities.filter((act) =>
          input.selectedAccountKeys.has(input.getAccountKey(act))
        )
      : input.activities;
  return list.reduce((sum, act) => sum + input.getDurationSeconds(act), 0);
}
