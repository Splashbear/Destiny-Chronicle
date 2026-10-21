import { ActivityDbService } from '../services/activity-db.service';

/** Look up the ACTIVITY_FAMILY_MAP name for a reference id, if any. */
export function getMappedActivityName(referenceId: string): string | null {
  const mapping = (ActivityDbService as any).ACTIVITY_FAMILY_MAP as
    | Record<string, string>
    | undefined;
  return mapping?.[referenceId] || null;
}
