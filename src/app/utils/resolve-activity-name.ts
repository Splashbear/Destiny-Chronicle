import { ActivityHistory } from '../models/activity-history.model';
import {
  formatActivityPgcrTitle,
  formatUnknownActivityTitle,
  ActivityDefLike,
} from './activity-pgcr-title';
import { mapRetiredDirectorToReferenceId } from './retired-director-reference-map';

export interface ActivityNameLookup {
  /** Plain display name from DestinyActivityDefinition (or D1). */
  getName: (referenceId: number | string, isD1: boolean) => string | null | undefined;
  /** True when a live def exists for this hash (D2). */
  hasDef?: (referenceId: number | string, isD1: boolean) => boolean;
  /** Raw def for PGCR-style description - name (D2 referenceId fallback). */
  getDef?: (referenceId: number | string, isD1: boolean) => ActivityDefLike | null | undefined;
}

function isUnknownName(name: string | null | undefined): boolean {
  if (!name) return true;
  const t = name.trim();
  return !t || t === 'Unknown Activity' || t === 'Loading...';
}

function directorOrStoredHash(activity: ActivityHistory): string | null {
  const details = activity.activityDetails as ActivityHistory['activityDetails'] & {
    directorActivityHash?: string | number;
    activityHash?: string | number;
  };
  const candidates = [
    details?.directorActivityHash,
    details?.referenceId,
    details?.activityHash,
    (activity as ActivityHistory & { activityHash?: string | number }).activityHash,
  ];
  for (const c of candidates) {
    if (c != null && String(c) !== '' && String(c) !== '0') {
      return String(c);
    }
  }
  return null;
}

/**
 * Resolve a display title for an activity row.
 * D2: director hash first; if retired, map → referenceId as description - name;
 * else Unknown activity (mode, Mon YYYY). Never drops the game.
 */
export function resolveActivityDisplayName(
  activity: ActivityHistory,
  isD1: boolean,
  lookup:
    | ActivityNameLookup
    | ((referenceId: number | string, isD1: boolean) => string | null | undefined)
): string {
  const getName =
    typeof lookup === 'function' ? lookup : lookup.getName.bind(lookup);
  const hasDef =
    typeof lookup === 'function'
      ? undefined
      : lookup.hasDef?.bind(lookup);
  const getDef =
    typeof lookup === 'function'
      ? undefined
      : lookup.getDef?.bind(lookup);

  const stored = (activity as ActivityHistory & { name?: string }).name?.trim();
  const directorHash = directorOrStoredHash(activity);

  if (directorHash) {
    const known =
      hasDef?.(directorHash, isD1) ??
      !isUnknownName(getName(directorHash, isD1));
    if (known) {
      const name = getName(directorHash, isD1);
      if (!isUnknownName(name)) {
        return name!.trim();
      }
    }

    if (!isD1) {
      const mappedRef = mapRetiredDirectorToReferenceId(directorHash);
      if (mappedRef) {
        const def = getDef?.(mappedRef, false);
        const pgcr = formatActivityPgcrTitle(def ?? undefined);
        if (pgcr) return pgcr;
        const mappedName = getName(mappedRef, false);
        if (!isUnknownName(mappedName)) {
          return mappedName!.trim();
        }
      }
    }
  }

  if (stored && !isUnknownName(stored) && !stored.startsWith('Unknown activity (')) {
    return stored;
  }

  if (isD1) {
    return stored && !isUnknownName(stored) ? stored : 'Unknown Activity';
  }

  return formatUnknownActivityTitle(
    activity.activityDetails?.mode,
    activity.period
  );
}
