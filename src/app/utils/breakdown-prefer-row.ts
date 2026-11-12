import { isActivityCompleted } from './activity-completed';
import { getActivityDurationSeconds } from './activity-duration';

/**
 * When several stored rows share one game|instanceId (wrong characterId copies),
 * Breakdown must keep a single Bungie-accurate row: prefer a clear, then more
 * duration (real participation over a near-zero ghost row).
 */
export function preferBreakdownActivityRow<T>(current: T, incoming: T): T {
  const curClear = isActivityCompleted(current);
  const incClear = isActivityCompleted(incoming);
  if (incClear && !curClear) return incoming;
  if (curClear && !incClear) return current;
  const curDur = getActivityDurationSeconds(current as any);
  const incDur = getActivityDurationSeconds(incoming as any);
  if (incDur > curDur) return incoming;
  return current;
}
