/** Running report-count status line during activity fetch (CODE_CLEANUP_SPEC). */
export function activityCountStatusMessage(input: {
  count: number;
  isDone: boolean;
  game: string;
  displayName: string;
  platform: string;
}): string {
  const { count, isDone, game, displayName, platform } = input;
  if (count === 0 && !isDone) {
    return `Fetching ${game} activities for ${displayName}...`;
  }
  return `${count} report${count === 1 ? '' : 's'} for ${displayName} ${platform} found${
    isDone ? '. Done!' : ''
  }`;
}
