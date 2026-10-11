/**
 * Activity history helpers shared by the Bungie and archive load paths.
 *
 * Goal: show every activity Bungie has a report for, except social spaces
 * (Tower, Farm, Reef and other hubs). Social is identified from the activity
 * mode / manifest definition, never from display names.
 */

/** DestinyActivityModeType.Social (D2). */
export const SOCIAL_ACTIVITY_MODE = 40;

/**
 * D1 activity history modes to page. Mode 0 (None) returns every activity in
 * one request; the old [2, 6, 4] list only fetched Story, Patrol and Raid.
 */
export const D1_HISTORY_MODES: readonly number[] = [0];

/** Minimal manifest activity definition fields used for social detection. */
export interface ActivityDefLike {
  directActivityModeType?: number | null;
  activityModeTypes?: number[] | null;
  isSocial?: boolean | null;
}

/**
 * True when an activity is a social space visit.
 * mode: the PGCR / history mode. def: manifest activity definition (optional).
 * Mode 0 alone is NOT social: many real games are stored as mode 0.
 */
export function isSocialActivity(mode: number | null | undefined, def?: ActivityDefLike | null): boolean {
  if (Number(mode) === SOCIAL_ACTIVITY_MODE) return true;
  if (!def) return false;
  if (def.isSocial === true) return true;
  if (Number(def.directActivityModeType) === SOCIAL_ACTIVITY_MODE) return true;
  return Array.isArray(def.activityModeTypes) && def.activityModeTypes.some(m => Number(m) === SOCIAL_ACTIVITY_MODE);
}

/** Instance id from a stored row or a Bungie history row. */
function instanceIdOf(row: any): string {
  const id = row?.instanceId ?? row?.activityDetails?.instanceId ?? row?.instance_id;
  return id == null ? '' : String(id);
}

/**
 * Keep the first row per instance id (rows without an id are kept).
 * Bungie history returns one row per character, so callers pass one character's rows.
 */
export function dedupeByInstanceId<T>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = instanceIdOf(row);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(row);
  }
  return out;
}
