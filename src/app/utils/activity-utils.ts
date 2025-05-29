// Utility functions for Destiny activity logic

export function isPvP(mode: number): boolean {
  return [5, 10, 12, 15, 19, 24, 25, 28, 37, 38, 39, 40, 41, 42, 43, 44, 48, 49, 50, 51, 52, 53].includes(mode);
}

export function getActivityName(activity: any, isD1: boolean): string {
  // This is a direct copy of the logic from player-search.component.ts
  if (!activity) return '';
  if (activity.activityDetails?.referenceId && activity.activityDetails?.referenceId !== 0) {
    if (activity.activityDetails?.displayName) {
      return activity.activityDetails.displayName;
    }
    if (activity.activityDetails?.referenceId) {
      return activity.activityDetails.referenceId.toString();
    }
  }
  if (activity.activityDetails?.mode) {
    return activity.activityDetails.mode.toString();
  }
  return 'Other';
} 