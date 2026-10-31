import { ActivityHistory } from '../models/activity-history.model';

/** Kills from an activity values block (CODE_CLEANUP_SPEC). */
export function getActivityKills(activity: ActivityHistory): number | undefined {
  return activity.values?.kills?.basic?.value;
}

/** Deaths from an activity values block (CODE_CLEANUP_SPEC). */
export function getActivityDeaths(activity: ActivityHistory): number | undefined {
  return activity.values?.deaths?.basic?.value;
}

/** K/D ratio string, or undefined when not computable (CODE_CLEANUP_SPEC). */
export function getActivityKdRatio(activity: ActivityHistory): string | undefined {
  const kills = getActivityKills(activity);
  const deaths = getActivityDeaths(activity);
  if (kills !== undefined && deaths !== undefined && deaths !== 0) {
    return (kills / deaths).toFixed(2);
  }
  return undefined;
}
