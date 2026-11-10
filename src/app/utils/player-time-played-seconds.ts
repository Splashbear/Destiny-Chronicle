/**
 * Player time in one activity (seconds).
 * Prefers the player's own timePlayedSeconds / secondsPlayed and does not
 * fall through to instance/archive activityDurationSeconds when a player-time
 * field is present (those can be the fireteam clock if a raid was left open).
 */
function numericSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return null;
}

function basicOrNumber(field: unknown): number | null {
  if (field && typeof field === 'object') {
    const basic = (field as { basic?: { value?: unknown } }).basic?.value;
    return numericSeconds(basic);
  }
  return numericSeconds(field);
}

export function playerTimePlayedSeconds(activity: any): number {
  const values = activity?.values;
  const playerTime =
    basicOrNumber(values?.timePlayedSeconds) ??
    basicOrNumber(values?.secondsPlayed) ??
    numericSeconds(activity?.timePlayedSeconds) ??
    numericSeconds(activity?.secondsPlayed);

  if (playerTime != null) {
    return playerTime > 86400 ? 86400 : playerTime;
  }

  // Only when no player-time field exists: archive light rows expose durationSeconds.
  const fallback =
    numericSeconds(activity?.durationSeconds) ??
    basicOrNumber(values?.activityDurationSeconds) ??
    numericSeconds(activity?.activityDurationSeconds) ??
    0;
  return fallback > 86400 ? 86400 : fallback;
}
