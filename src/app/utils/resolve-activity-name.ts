import { ActivityHistory } from '../models/activity-history.model';

/**
 * Prefer live manifest name, then stored name, else Unknown (CODE_CLEANUP_SPEC).
 */
export function resolveActivityDisplayName(
  activity: ActivityHistory,
  isD1: boolean,
  getManifestName: (referenceId: number | string, isD1: boolean) => string | null | undefined
): string {
  const referenceId = activity.activityDetails?.referenceId;
  const stored = (activity as ActivityHistory & { name?: string }).name?.trim();
  if (referenceId) {
    const lookedUp = getManifestName(referenceId, isD1);
    if (lookedUp && lookedUp !== 'Unknown Activity') {
      return lookedUp;
    }
  }
  if (stored && stored !== 'Unknown Activity') {
    return stored;
  }
  return 'Unknown Activity';
}
