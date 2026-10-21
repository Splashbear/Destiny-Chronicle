/**
 * Queue work until a "ready" predicate is true (CODE_CLEANUP_SPEC).
 * Polls every `intervalMs` after an immediate first check.
 */
export function scheduleAfterReady(
  isReady: () => boolean,
  fn: () => void,
  intervalMs = 250
): void {
  const tryRun = () => {
    if (isReady()) {
      fn();
      return;
    }
    setTimeout(tryRun, intervalMs);
  };
  setTimeout(tryRun, 0);
}
