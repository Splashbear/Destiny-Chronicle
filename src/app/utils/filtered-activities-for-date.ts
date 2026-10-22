import { ActivityTypeOption } from '../models/activity-types';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { StoredActivity } from '../services/activity-db.service';
import { isSrlActivity } from '../config/srl.config';

export interface FilteredDatePlayer {
  membershipId: string;
  membershipType: number;
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
}

export interface ActivityTypeManifest {
  getActivityType(referenceId: string, mode: number | undefined, isD1?: boolean): string;
  getActivityName(referenceId: string, isD1: boolean): string;
  getActivityIcon(referenceId: number | string | undefined, isD1: boolean): string | undefined;
}

/** Cache key for per-date filtered lists (accounts keyed by game:membershipId). */
export function filteredActivitiesCacheKey(
  selectedDate: string,
  players: Array<{ game?: string; membershipId: string }>,
  activityTypeLabel: string
): string {
  const accountKey = players
    .map(player => `${player.game || ''}:${player.membershipId}`)
    .sort()
    .join('|');
  return `filtered-${selectedDate}-${accountKey}-${activityTypeLabel}`;
}

/** Apply Activities-tab type filter (All / Dungeon / SRL / mode). */
export function filterStoredActivitiesByType(
  activities: StoredActivity[],
  player: FilteredDatePlayer,
  selectedActivityType: ActivityTypeOption,
  manifest: ActivityTypeManifest
): StoredActivity[] {
  if (selectedActivityType.label === 'All') {
    return activities;
  }

  let playerActivities = activities;

  if (selectedActivityType.label === 'Dungeon' && player.game === 'D2') {
    playerActivities = playerActivities.filter(a => {
      const referenceId = String(a.activityDetails?.referenceId ?? '');
      const activityType = manifest.getActivityType(referenceId, a.activityDetails?.mode, false);
      return activityType === 'dungeon';
    });
  } else if (selectedActivityType.label === 'Sparrow Racing League') {
    playerActivities = playerActivities.filter(a => {
      const referenceId = String(a.activityDetails?.referenceId ?? '');
      const activityName = manifest.getActivityName(referenceId, player.game === 'D1');
      const activityType = manifest.getActivityType(
        referenceId,
        a.activityDetails?.mode,
        player.game === 'D1'
      );
      return (
        activityType === 'sparrow-racing-league' ||
        isSrlActivity(referenceId, activityName, a.activityDetails?.mode)
      );
    });
  } else {
    const mode =
      player.game === 'D1' ? selectedActivityType.d1Mode : selectedActivityType.d2Mode;
    if (mode !== undefined) {
      playerActivities = playerActivities.filter(a => a.activityDetails?.mode === mode);
    }
  }

  return playerActivities;
}

/** Drop wrong-game / wrong-membership rows, then stamp display fields. */
export function stampActivitiesForPlayer(
  activities: StoredActivity[],
  player: FilteredDatePlayer,
  manifest: ActivityTypeManifest
): ActivityWithMembership[] {
  let playerActivities = activities.filter(a => {
    const g = (a as any).game as 'D1' | 'D2' | undefined;
    return !g || g === player.game;
  });
  playerActivities = playerActivities.filter(a => a.membershipId === player.membershipId);

  return playerActivities.map(activity => ({
    ...activity,
    membershipId: activity.membershipId,
    membershipType: player.membershipType,
    displayName: player.displayName,
    platform: player.platform,
    game: player.game,
    iconPath: manifest.getActivityIcon(activity.activityDetails?.referenceId, player.game === 'D1'),
  }));
}

/** Deduplicate by game|membershipId|instanceId; sort newest-first. */
export function dedupeAndSortFilteredActivities(
  activities: ActivityWithMembership[]
): ActivityWithMembership[] {
  const dedupedMap = new Map<string, ActivityWithMembership>();

  for (const activity of activities) {
    const instanceId = activity.activityDetails?.instanceId;
    const membershipId = (activity as any).membershipId as string | undefined;
    const game = ((activity as any).game as string | undefined) || 'D2';
    if (instanceId && membershipId) {
      const key = `${game}|${membershipId}|${instanceId}`;
      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, activity);
      }
    }
  }

  const dedupedActivities = Array.from(dedupedMap.values());
  dedupedActivities.sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
  return dedupedActivities;
}
