/**
 * Debounced Breakdown tab refresh when activities finish storing (CODE_CLEANUP_SPEC).
 */
export function scheduleBreakdownRefresh(input: {
  getActiveTab: () => string;
  selectedPlayersLength: number;
  currentTimer: ReturnType<typeof setTimeout> | null;
  delayMs: number;
  setDirty: () => void;
  setTimer: (id: ReturnType<typeof setTimeout> | null) => void;
  reload: () => void;
}): void {
  if (input.getActiveTab() !== 'breakdown' || input.selectedPlayersLength === 0) {
    return;
  }
  input.setDirty();
  if (input.currentTimer) {
    clearTimeout(input.currentTimer);
  }
  const timer = setTimeout(() => {
    input.setTimer(null);
    if (input.getActiveTab() === 'breakdown') {
      input.reload();
    }
  }, input.delayMs);
  input.setTimer(timer);
}
