import { ActivityHistory } from '../models/activity-history.model';
import { isD1RaidReferenceId } from '../config/d1-raid-reference-ids';
import { isSrlActivity } from '../config/srl.config';

export interface ActivityTypeFilterOption {
  label: string;
  d1Mode?: number;
  d2Mode?: number;
}

/**
 * Filter activities by selected type + game (CODE_CLEANUP_SPEC).
 */
export function filterActivitiesBySelectedType(
  activities: ActivityHistory[],
  game: string,
  selectedType: ActivityTypeFilterOption,
  resolve: {
    getActivityType(
      referenceId: string,
      mode: number,
      isD1: boolean
    ): string | null | undefined;
    getActivityName(referenceId: string, isD1: boolean): string;
  }
): ActivityHistory[] {
  return activities.filter((activity) => {
    const mode = activity.activityDetails?.mode;
    const referenceId = String(activity.activityDetails?.referenceId);
    if (selectedType.label === 'Raid' && game === 'D1') {
      return isD1RaidReferenceId(referenceId);
    }
    if (!mode) return false;
    if (selectedType.label === 'Dungeon') {
      if (game !== 'D2') return false;
      const activityType = resolve.getActivityType(referenceId, mode, false);
      return activityType === 'dungeon';
    }
    if (selectedType.label === 'Sparrow Racing League') {
      const isD1 = game === 'D1';
      const activityName = resolve.getActivityName(referenceId, isD1);
      const activityType = resolve.getActivityType(referenceId, mode, isD1);
      return (
        activityType === 'sparrow-racing-league' ||
        isSrlActivity(referenceId, activityName, mode)
      );
    }
    return (
      (game === 'D1' && mode === selectedType.d1Mode) ||
      (game === 'D2' && mode === selectedType.d2Mode)
    );
  });
}
