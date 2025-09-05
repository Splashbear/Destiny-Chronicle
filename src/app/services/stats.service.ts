import { Injectable } from '@angular/core';
import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

export interface AccountStats {
  totalActivities: number;
  totalTimePlayed: number;
  activitiesByType: Map<string, number>;
  activitiesByCharacter: Map<string, number>;
  platformStats: Map<string, PlatformStats>;
}

export interface PlatformStats {
  activities: number;
  timePlayed: number;
  characters: number;
}

export interface ActivityGroup {
  baseName: string;
  versions: ActivityVersion[];
}

export interface ActivityVersion {
  version: string;
  activities: ActivityHistory[];
  completionCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class StatsService {

  /**
   * Calculates comprehensive stats for selected players
   */
  calculateAccountStats(
    players: PlayerSearchDisplay[],
    activitiesMap: Map<string, ActivityHistory[]>
  ): AccountStats {
    const stats: AccountStats = {
      totalActivities: 0,
      totalTimePlayed: 0,
      activitiesByType: new Map(),
      activitiesByCharacter: new Map(),
      platformStats: new Map()
    };

    for (const player of players) {
      const playerKey = `${player.game}|${player.membershipId}`;
      const activities = activitiesMap.get(playerKey) || [];
      
      // Update totals
      stats.totalActivities += activities.length;
      stats.totalTimePlayed += this.calculateTotalTimePlayed(activities);
      
      // Update type breakdown
      this.updateActivitiesByType(stats.activitiesByType, activities);
      
      // Update character breakdown
      this.updateActivitiesByCharacter(stats.activitiesByCharacter, activities);
      
      // Update platform stats
      this.updatePlatformStats(stats.platformStats, player, activities);
    }

    return stats;
  }

  /**
   * Groups activities by base name and versions
   */
  groupActivitiesByBaseName(activities: ActivityHistory[]): ActivityGroup[] {
    const groupMap = new Map<string, ActivityHistory[]>();
    
    for (const activity of activities) {
      const baseName = this.getBaseActivityName(activity.activityDetails?.referenceId || '');
      
      if (!groupMap.has(baseName)) {
        groupMap.set(baseName, []);
      }
      groupMap.get(baseName)!.push(activity);
    }
    
    // Convert to array and sort
    return Array.from(groupMap.entries())
      .map(([baseName, activities]) => ({
        baseName,
        versions: this.groupByVersion(activities)
      }))
      .sort((a, b) => a.baseName.localeCompare(b.baseName));
  }

  /**
   * Groups activities by version within a base name
   */
  private groupByVersion(activities: ActivityHistory[]): ActivityVersion[] {
    const versionMap = new Map<string, ActivityHistory[]>();
    
    for (const activity of activities) {
      const version = this.getActivityVersion(activity.activityDetails?.referenceId || '');
      
      if (!versionMap.has(version)) {
        versionMap.set(version, []);
      }
      versionMap.get(version)!.push(activity);
    }
    
    // Convert to array and sort by version order
    return Array.from(versionMap.entries())
      .map(([version, activities]) => ({
        version,
        activities,
        completionCount: activities.length
      }))
      .sort((a, b) => this.compareVersions(a.version, b.version));
  }

  /**
   * Calculates total time played from activities
   */
  private calculateTotalTimePlayed(activities: ActivityHistory[]): number {
    return activities.reduce((total, activity) => {
      return total + (activity.values?.timePlayedSeconds?.basic?.value || 0);
    }, 0);
  }

  /**
   * Updates activities by type breakdown
   */
  private updateActivitiesByType(
    activitiesByType: Map<string, number>,
    activities: ActivityHistory[]
  ): void {
    for (const activity of activities) {
      const activityType = String(activity.activityDetails?.mode || 'unknown');
      const current = activitiesByType.get(activityType) || 0;
      activitiesByType.set(activityType, current + 1);
    }
  }

  /**
   * Updates activities by character breakdown
   */
  private updateActivitiesByCharacter(
    activitiesByCharacter: Map<string, number>,
    activities: ActivityHistory[]
  ): void {
    for (const activity of activities) {
      // Use a placeholder since ActivityHistory doesn't have characterId
      const characterId = 'unknown';
      const current = activitiesByCharacter.get(characterId) || 0;
      activitiesByCharacter.set(characterId, current + 1);
    }
  }

  /**
   * Updates platform stats
   */
  private updatePlatformStats(
    platformStats: Map<string, PlatformStats>,
    player: PlayerSearchDisplay,
    activities: ActivityHistory[]
  ): void {
    const current = platformStats.get(player.platform) || {
      activities: 0,
      timePlayed: 0,
      characters: 0
    };
    
    const uniqueCharacters = 1; // Placeholder since ActivityHistory doesn't have characterId
    
    platformStats.set(player.platform, {
      activities: current.activities + activities.length,
      timePlayed: current.timePlayed + this.calculateTotalTimePlayed(activities),
      characters: Math.max(current.characters, uniqueCharacters)
    });
  }

  /**
   * Gets base activity name from reference ID
   */
  private getBaseActivityName(referenceId: string): string {
    // This would need to be implemented based on your manifest service
    // For now, returning a placeholder
    return `Activity ${referenceId}`;
  }

  /**
   * Gets activity version from reference ID
   */
  private getActivityVersion(referenceId: string): string {
    // This would need to be implemented based on your manifest service
    // For now, returning a placeholder
    return 'Standard';
  }

  /**
   * Compares versions for sorting
   */
  private compareVersions(versionA: string, versionB: string): number {
    const versionOrder = ['Normal', 'Standard', 'Explorer', 'Eternity', 'Ultimatum', 'Master'];
    
    const indexA = versionOrder.indexOf(versionA);
    const indexB = versionOrder.indexOf(versionB);
    
    if (indexA === -1 && indexB === -1) return versionA.localeCompare(versionB);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  }
}
