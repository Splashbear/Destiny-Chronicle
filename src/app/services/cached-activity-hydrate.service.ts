import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { ActivityDbService } from './activity-db.service';

/** Host for instant cached activity display (CODE_CLEANUP_SPEC). */
export interface CachedActivityHydrateHost {
  setPlayerActivities(playerKey: string, activities: ActivityWithMembership[]): void;
  loadAllFilteredActivities(force: boolean): Promise<void>;
}

/**
 * Show IDB-cached activities immediately during offline hydrate (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class CachedActivityHydrateService {
  constructor(private activityDb: ActivityDbService) {}

  async showCachedDataInstantly(
    host: CachedActivityHydrateHost,
    player: PlayerSearchDisplay,
    playerKey: string
  ): Promise<boolean> {
    try {
      const cachedActivities =
        await this.activityDb.getAllActivitiesForMembershipOptimized(
          player.membershipId
        );

      if (cachedActivities.length === 0) {
        return false;
      }

      const activitiesWithMembership: ActivityWithMembership[] =
        cachedActivities.map((activity) => ({
          ...activity,
          membershipId: player.membershipId,
          membershipType: player.membershipType,
          displayName: player.displayName,
          platform: player.platform,
          characterClass: activity.characterClass || 'Unknown',
          game: activity.game || player.game,
        }));

      host.setPlayerActivities(playerKey, activitiesWithMembership);
      await host.loadAllFilteredActivities(true);

      console.log(
        `Instantly displayed ${cachedActivities.length} cached activities for ${player.displayName}`
      );
      return true;
    } catch (error) {
      console.error(
        `Error showing cached data for ${player.displayName}:`,
        error
      );
      return false;
    }
  }
}
