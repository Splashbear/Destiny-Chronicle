import { Injectable } from '@angular/core';
import { ActivityHistory } from '../models/activity-history.model';
import { DestinyManifestService } from './destiny-manifest.service';

export interface GroupedActivity {
  type: string;
  name: string;
  activities: ActivityHistory[];
  totalCount: number;
  totalPlaytime: number;
  averageScore: number;
  image?: string;
}

export interface ActivityGroup {
  date: string;
  groups: GroupedActivity[];
  totalActivities: number;
  totalPlaytime: number;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityGroupingService {
  private groupingCache = new Map<string, ActivityGroup[]>();

  constructor(private manifest: DestinyManifestService) {}

  /**
   * Group activities by date and type with caching
   */
  groupActivitiesByDate(
    activities: ActivityHistory[],
    membershipId: string
  ): ActivityGroup[] {
    const cacheKey = `${membershipId}-${activities.length}-${activities[0]?.period || ''}`;
    
    if (this.groupingCache.has(cacheKey)) {
      return this.groupingCache.get(cacheKey)!;
    }

    const grouped = this.performGrouping(activities);
    this.groupingCache.set(cacheKey, grouped);
    
    // Limit cache size
    if (this.groupingCache.size > 10) {
      const firstKey = this.groupingCache.keys().next().value;
      if (firstKey) {
        this.groupingCache.delete(firstKey);
      }
    }

    return grouped;
  }

  private performGrouping(activities: ActivityHistory[]): ActivityGroup[] {
    // Group by date first
    const dateGroups = new Map<string, ActivityHistory[]>();
    
    activities.forEach(activity => {
      const date = new Date(activity.period).toDateString();
      if (!dateGroups.has(date)) {
        dateGroups.set(date, []);
      }
      dateGroups.get(date)!.push(activity);
    });

    // Process each date group
    const result: ActivityGroup[] = [];
    
    for (const [date, dateActivities] of dateGroups) {
      const typeGroups = this.groupByType(dateActivities);
      const totalActivities = dateActivities.length;
      const totalPlaytime = dateActivities.reduce((sum, activity) => {
        return sum + (activity.values?.timePlayedSeconds?.basic?.value || 0);
      }, 0);

      result.push({
        date,
        groups: typeGroups,
        totalActivities,
        totalPlaytime
      });
    }

    // Sort by date (most recent first)
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private groupByType(activities: ActivityHistory[]): GroupedActivity[] {
    const typeGroups = new Map<string, ActivityHistory[]>();
    
    // Group by activity type
    activities.forEach(activity => {
      const mode = activity.activityDetails?.mode || 0;
      const referenceId = String(activity.activityDetails?.referenceId || '');
      const type = this.manifest.getActivityType(referenceId, mode);
      
      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type)!.push(activity);
    });

    // Convert to GroupedActivity objects
    const result: GroupedActivity[] = [];
    
    for (const [type, typeActivities] of typeGroups) {
      const totalPlaytime = typeActivities.reduce((sum, activity) => {
        return sum + (activity.values?.timePlayedSeconds?.basic?.value || 0);
      }, 0);

      const totalScore = typeActivities.reduce((sum, activity) => {
        return sum + (activity.values?.score?.basic?.value || 0);
      }, 0);

      const averageScore = typeActivities.length > 0 ? totalScore / typeActivities.length : 0;

      // Get representative activity name and image
      const representativeActivity = typeActivities[0];
      const name = this.getActivityDisplayName(representativeActivity, type);
      const image = this.getActivityImage(representativeActivity);

      result.push({
        type,
        name,
        activities: typeActivities.sort((a, b) => 
          new Date(b.period).getTime() - new Date(a.period).getTime()
        ),
        totalCount: typeActivities.length,
        totalPlaytime,
        averageScore,
        image
      });
    }

    // Sort by activity count (most played first)
    return result.sort((a, b) => b.totalCount - a.totalCount);
  }

  private getActivityDisplayName(activity: ActivityHistory, type: string): string {
    const referenceId = String(activity.activityDetails?.referenceId || '');
    const mode = activity.activityDetails?.mode || 0;
    
    // Try to get specific activity name from manifest
    const specificName = this.manifest.getActivityName(referenceId, mode > 4);
    if (specificName && specificName !== 'Unknown Activity') {
      return specificName;
    }

    // Fall back to type-based names
    const typeNames: { [key: string]: string } = {
      'raid': 'Raid',
      'dungeon': 'Dungeon',
      'strike': 'Strike',
      'nightfall': 'Nightfall',
      'crucible': 'Crucible',
      'gambit': 'Gambit',
      'patrol': 'Patrol',
      'story': 'Story Mission',
      'other': 'Other Activities'
    };

    return typeNames[type] || 'Unknown Activity';
  }

  private getActivityImage(activity: ActivityHistory): string | undefined {
    const referenceId = String(activity.activityDetails?.referenceId || '');
    const mode = activity.activityDetails?.mode || 0;
    const isD1 = mode <= 4;
    
    // Try to get PGCR image first
    const pgcrImage = this.manifest.getActivityPgcrImage(referenceId, isD1);
    if (pgcrImage && (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/'))) {
      return 'https://www.bungie.net' + pgcrImage;
    }

    // Fall back to activity type icon
    const type = this.manifest.getActivityType(referenceId, mode);
    return `/assets/icons/activities/${type}.svg`;
  }

  /**
   * Clear the grouping cache
   */
  clearCache(): void {
    this.groupingCache.clear();
  }

  /**
   * Get quick stats for a set of activities
   */
  getQuickStats(activities: ActivityHistory[]): {
    totalActivities: number;
    totalPlaytime: number;
    mostPlayedType: string;
    averageSessionLength: number;
  } {
    const totalActivities = activities.length;
    const totalPlaytime = activities.reduce((sum, activity) => {
      return sum + (activity.values?.timePlayedSeconds?.basic?.value || 0);
    }, 0);

    // Find most played activity type
    const typeCounts: { [key: string]: number } = {};
    activities.forEach(activity => {
      const mode = activity.activityDetails?.mode || 0;
      const referenceId = String(activity.activityDetails?.referenceId || '');
      const type = this.manifest.getActivityType(referenceId, mode);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const mostPlayedType = Object.entries(typeCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';

    const averageSessionLength = totalActivities > 0 ? totalPlaytime / totalActivities : 0;

    return {
      totalActivities,
      totalPlaytime,
      mostPlayedType,
      averageSessionLength
    };
  }
}