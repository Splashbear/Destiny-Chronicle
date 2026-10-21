import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

export interface ActivityWithMembershipLike {
  membershipId?: string;
  game?: string;
}

/**
 * Build per-player activity map for StatsService.calculateAccountStats (CODE_CLEANUP_SPEC).
 */
export function buildAccountStatsActivitiesMap(
  selectedPlayers: PlayerSearchDisplay[],
  filteredActivitiesForDate: ActivityWithMembershipLike[]
): Map<string, ActivityHistory[]> {
  const activitiesMap = new Map<string, ActivityHistory[]>();
  for (const player of selectedPlayers) {
    const playerKey = `${player.game}|${player.membershipId}`;
    const playerActivities = filteredActivitiesForDate.filter(
      (activity) =>
        activity.membershipId === player.membershipId &&
        activity.game === player.game
    ) as ActivityHistory[];
    activitiesMap.set(playerKey, playerActivities);
  }
  return activitiesMap;
}
