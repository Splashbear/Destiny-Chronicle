import { Injectable } from '@angular/core';
import { ActivityHistory } from '../models/activity-history.model';
import { ActivityDbService } from './activity-db.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { 
  AnalyticsTimePeriod, 
  AnalyticsDataPoint, 
  ActivityAnalytics, 
  AnalyticsSummary,
  ActivityOption
} from '../models/analytics.model';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  constructor(
    private activityDb: ActivityDbService,
    private manifest: DestinyManifestService
  ) {}

  /**
   * Generate analytics for a specific activity over a time period
   */
  async getActivityAnalytics(
    activityName: string,
    timePeriod: AnalyticsTimePeriod,
    playerIds: string[],
    game: 'D1' | 'D2' | 'both'
  ): Promise<ActivityAnalytics> {
    const activities = await this.getActivitiesInPeriod(timePeriod, playerIds, game);
    const filteredActivities = activities.filter(activity => {
      const isD1 = this.isD1Activity(activity);
      return this.manifest.getActivityName(activity.activityDetails?.referenceId, isD1) === activityName;
    });

    const dataPoints = this.generateDataPoints(filteredActivities, timePeriod);
    const totalTimeSpent = filteredActivities.reduce((sum, activity) => 
      sum + this.getActivityDuration(activity), 0
    );

    // Determine the actual game type for this activity
    const actualGame = filteredActivities.length > 0 ? 
      (this.isD1Activity(filteredActivities[0]) ? 'D1' : 'D2') : 
      (game === 'both' ? 'D2' : game);

    return {
      activityName,
      activityType: this.getActivityType(activityName),
      game: actualGame,
      totalPlayCount: filteredActivities.length,
      totalTimeSpent: Math.round(totalTimeSpent / 60), // Convert to minutes
      averageTimePerActivity: filteredActivities.length > 0 ? 
        Math.round(totalTimeSpent / filteredActivities.length / 60) : 0,
      winRate: this.calculateWinRate(filteredActivities),
      completionRate: this.calculateCompletionRate(filteredActivities),
      dataPoints,
      trend: this.calculateTrend(dataPoints),
      trendPercentage: this.calculateTrendPercentage(dataPoints)
    };
  }

  /**
   * Generate analytics summary for all activities
   */
  async getAnalyticsSummary(
    timePeriod: AnalyticsTimePeriod,
    playerIds: string[],
    game: 'D1' | 'D2' | 'both',
    activityType?: string
  ): Promise<AnalyticsSummary> {
    const activities = await this.getActivitiesInPeriod(timePeriod, playerIds, game);
    
    // Group activities by name
    const activityGroups = new Map<string, ActivityHistory[]>();
    activities.forEach(activity => {
      const isD1 = this.isD1Activity(activity);
      const name = this.manifest.getActivityName(activity.activityDetails?.referenceId, isD1);
      const type = this.getActivityType(name);
      
      // Filter by activity type if specified
      if (activityType && type !== activityType) {
        return;
      }
      
      if (!activityGroups.has(name)) {
        activityGroups.set(name, []);
      }
      activityGroups.get(name)!.push(activity);
    });

    // Find most played activity
    let mostPlayedActivity = '';
    let maxCount = 0;
    activityGroups.forEach((activities, name) => {
      if (activities.length > maxCount) {
        maxCount = activities.length;
        mostPlayedActivity = name;
      }
    });

    // Calculate total time
    const totalTimeSpent = activities.reduce((sum, activity) => 
      sum + this.getActivityDuration(activity), 0
    );

    // Calculate average sessions per day
    const daysInPeriod = this.getDaysInPeriod(timePeriod);
    const averageSessionsPerDay = daysInPeriod > 0 ? activities.length / daysInPeriod : 0;

    // Find peak activity day
    const dailyCounts = this.getDailyActivityCounts(activities, timePeriod);
    const peakDay = Array.from(dailyCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    // Get top 5 activities
    const topActivities = Array.from(activityGroups.entries())
      .map(([name, activities]) => {
        // Determine the actual game type for this activity
        const actualGame = activities.length > 0 ? 
          (this.isD1Activity(activities[0]) ? 'D1' : 'D2') : 
          (game === 'both' ? 'D2' : game);
        
        return {
          activityName: name,
          activityType: this.getActivityType(name),
          game: actualGame,
          totalPlayCount: activities.length,
          totalTimeSpent: Math.round(activities.reduce((sum, activity) => 
            sum + this.getActivityDuration(activity), 0) / 60),
          averageTimePerActivity: Math.round(activities.reduce((sum, activity) => 
            sum + this.getActivityDuration(activity), 0) / activities.length / 60),
          dataPoints: this.generateDataPoints(activities, timePeriod),
          trend: 'stable' as const,
          trendPercentage: 0
        };
      })
      .sort((a, b) => b.totalPlayCount - a.totalPlayCount)
      .slice(0, 5);

    return {
      totalActivities: activities.length,
      totalTimeSpent: Math.round(totalTimeSpent / 60),
      mostPlayedActivity,
      averageSessionsPerDay: Math.round(averageSessionsPerDay * 100) / 100,
      peakActivityDay: peakDay,
      topActivities
    };
  }

  /**
   * Get activities within a specific time period
   */
  private async getActivitiesInPeriod(
    timePeriod: AnalyticsTimePeriod,
    playerIds: string[],
    game: 'D1' | 'D2' | 'both'
  ): Promise<ActivityHistory[]> {
    const activities: ActivityHistory[] = [];
    
    console.log(`Getting activities for period: ${timePeriod.startDate.toISOString()} to ${timePeriod.endDate.toISOString()}`);
    
    // Get all activities for all players
    for (const playerId of playerIds) {
      const playerActivities = await this.activityDb.getActivitiesInDateRange(
        playerId,
        timePeriod.startDate,
        timePeriod.endDate
      );
      console.log(`Player ${playerId} has ${playerActivities.length} activities in this period`);
      activities.push(...playerActivities);
    }
    
    console.log(`Total activities found: ${activities.length}`);
    
    // Filter by game if not 'both'
    if (game !== 'both') {
      return activities.filter(activity => {
        const isD1 = this.isD1Activity(activity);
        return game === 'D1' ? isD1 : !isD1;
      });
    }
    
    return activities;
  }

  /**
   * Check if an activity is from Destiny 1
   */
  private isD1Activity(activity: ActivityHistory): boolean {
    // Check if this is a D1 activity based on reference ID ranges
    const refId = activity.activityDetails?.referenceId;
    if (!refId) return false;
    
    // Use comprehensive D1 family map from activity-db.service
    // This includes all D1 raid variants (Normal, Hard, 390, etc.)
    const d1RaidHashes = [
      // Vault of Glass (all variants)
      '3801607287', '708693006', '2659248071', '2659248068', '2659248069', 
      '856898338', '4038697181',
      // Crota's End (all variants)
      '898834093', '112157962', '3879860662', '1836893116', '1836893119',
      '2324706853', '4000873610',
      // King's Fall (all variants)
      '1733556769', '3534581229', '1016659723', '3978884648',
      // Wrath of the Machine (all variants)
      '2578867903', '4007500989', '1099433614', '1342567280', '260765522',
      '1387993552', '430160982', '3356249023'
    ];
    
    const refIdStr = String(refId);
    return d1RaidHashes.includes(refIdStr) || 
           (parseInt(refIdStr) < 1000000000); // D1 activities typically have smaller reference IDs
  }

  /**
   * Generate data points for charting
   */
  private generateDataPoints(
    activities: ActivityHistory[],
    timePeriod: AnalyticsTimePeriod
  ): AnalyticsDataPoint[] {
    const dataPoints: AnalyticsDataPoint[] = [];
    const dailyCounts = this.getDailyActivityCounts(activities, timePeriod);
    
    const currentDate = new Date(timePeriod.startDate);
    const endDate = new Date(timePeriod.endDate);
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const count = dailyCounts.get(dateStr) || 0;
      
      dataPoints.push({
        date: dateStr,
        value: count,
        label: currentDate.toLocaleDateString()
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dataPoints;
  }

  /**
   * Get daily activity counts
   */
  private getDailyActivityCounts(
    activities: ActivityHistory[],
    timePeriod: AnalyticsTimePeriod
  ): Map<string, number> {
    const counts = new Map<string, number>();
    
    activities.forEach(activity => {
      const activityDate = new Date(activity.period);
      const dateStr = activityDate.toISOString().split('T')[0];
      counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
    });
    
    return counts;
  }

  /**
   * Calculate win rate for PvP activities
   */
  private calculateWinRate(activities: ActivityHistory[]): number | undefined {
    const pvpActivities = activities.filter(activity => 
      this.isPvPActivity(activity)
    );
    
    if (pvpActivities.length === 0) return undefined;
    
    const wins = pvpActivities.filter(activity => 
      activity.values?.standing?.basic?.value === 0
    ).length;
    
    return Math.round((wins / pvpActivities.length) * 100);
  }

  /**
   * Calculate completion rate for PvE activities
   */
  private calculateCompletionRate(activities: ActivityHistory[]): number | undefined {
    const pveActivities = activities.filter(activity => 
      !this.isPvPActivity(activity)
    );
    
    if (pveActivities.length === 0) return undefined;
    
    const completions = pveActivities.filter(activity => 
      activity.values?.completed?.basic?.value === 1
    ).length;
    
    return Math.round((completions / pveActivities.length) * 100);
  }

  /**
   * Calculate trend direction
   */
  private calculateTrend(dataPoints: AnalyticsDataPoint[]): 'up' | 'down' | 'stable' {
    if (dataPoints.length < 2) return 'stable';
    
    const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
    const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, point) => sum + point.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, point) => sum + point.value, 0) / secondHalf.length;
    
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 10) return 'up';
    if (change < -10) return 'down';
    return 'stable';
  }

  /**
   * Calculate trend percentage
   */
  private calculateTrendPercentage(dataPoints: AnalyticsDataPoint[]): number {
    if (dataPoints.length < 2) return 0;
    
    const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
    const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, point) => sum + point.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, point) => sum + point.value, 0) / secondHalf.length;
    
    return Math.round(((secondAvg - firstAvg) / firstAvg) * 100);
  }

  /**
   * Get activity duration in seconds
   */
  private getActivityDuration(activity: ActivityHistory): number {
    return activity.values?.timePlayedSeconds?.basic?.value || 0;
  }

  /**
   * Check if activity is PvP
   */
  private isPvPActivity(activity: ActivityHistory): boolean {
    const mode = activity.activityDetails?.mode;
    return mode === 5 || mode === 6 || mode === 7 || mode === 8; // PvP modes
  }

  /**
   * Get activity type from name
   */
  private getActivityType(activityName: string): string {
    const name = activityName.toLowerCase();
    
    // Use comprehensive lists from existing codebase
    const raidNames = [
      'vault of glass', 'crota\'s end', 'king\'s fall', 'wrath of the machine',
      'leviathan', 'eater of worlds', 'spire of stars', 'crown of sorrow',
      'last wish', 'scourge of the past', 'garden of salvation', 'deep stone crypt',
      'vow of the disciple', 'vault of glass', 'king\'s fall', 'crota\'s end',
      'root of nightmares', 'salvation\'s edge', 'pantheon', 'desert perpetual',
      'atraks', 'oryx', 'rhulk', 'nezarec'
    ];
    
    const dungeonNames = [
      'shattered throne', 'pit of heresy', 'prophecy', 'grasp of avarice',
      'duality', 'spire of the watcher', 'ghost of the deep', 'warlord\'s ruin',
      'vesper\'s host', 'sundered doctrine'
    ];
    
    const seasonalNames = [
      'the coil', 'seasonal', 'battleground', 'heist', 'nightmare hunt',
      'empire hunt', 'override', 'expedition', 'ketchcrash', 'dares of eternity',
      'psiops', 'containment', 'seraph', 'defiant', 'deep', 'witch', 'plunder',
      'haunted', 'risen', 'chosen', 'splicer', 'hunt', 'worthy', 'dawn'
    ];
    
    const lostSectorNames = [
      'k1 logistics', 'the salt mines', 'kell\'s fall', 'caldera',
      'conductor\'s keep', 'the inverted spire', 'the glassway',
      'fractured expanse', 'k1 revelation', 'k1 crew quarters', 'k1 communion',
      'k1 lost sector', 'lost sector', 'k1 logistics', 'k1 revelation',
      'k1 crew quarters', 'k1 communion', 'k1 lost sector'
    ];
    
    const pvpNames = [
      'crucible', 'control', 'clash', 'survival', 'elimination', 'rumble',
      'iron banner', 'trials', 'comp', 'momentum', 'mayhem', 'scorched',
      'team scorched', 'supremacy', 'countdown', 'breakthrough', 'lockdown',
      'showdown', 'salvage', 'rift', 'zone control', 'relay', 'osiris',
      'banner', 'altar of flame', 'endless vale', 'skywatch'
    ];
    
    const strikeNames = [
      'strike', 'nightfall', 'ordeal', 'proving grounds', 'the dark priestess',
      'creation', 'the citadel', 'ash & iron', 'battleground', 'master conquest',
      'expert conquest', 'fabled mission', 'quarantine'
    ];
    
    const patrolNames = [
      'cosmodrome', 'european dead zone', 'neomuna', 'savathûn\'s throne world',
      'savathûn\'s spire', 'vesper\'s host', 'widow\'s court'
    ];
    
    // Check for exact matches first
    if (raidNames.some(raid => name.includes(raid))) {
      return 'Raid';
    }
    
    if (dungeonNames.some(dungeon => name.includes(dungeon))) {
      return 'Dungeon';
    }
    
    if (lostSectorNames.some(lostSector => name.includes(lostSector))) {
      return 'Lost Sector';
    }
    
    if (seasonalNames.some(seasonal => name.includes(seasonal))) {
      return 'Seasonal';
    }
    
    if (pvpNames.some(pvp => name.includes(pvp))) {
      return 'PvP';
    }
    
    if (strikeNames.some(strike => name.includes(strike))) {
      return 'Strike';
    }
    
    // Check for generic patterns
    if (name.includes('raid')) return 'Raid';
    if (name.includes('dungeon')) return 'Dungeon';
    if (name.includes('crucible')) return 'PvP';
    if (name.includes('gambit')) return 'Gambit';
    if (name.includes('strike') || name.includes('nightfall')) return 'Strike';
    if (name.includes('seasonal') || name.includes('battleground')) return 'Seasonal';
    
    // Log unknown activities for debugging
    console.log(`Unknown activity type for: ${activityName}`);
    return 'Other';
  }

  /**
   * Get number of days in period
   */
  private getDaysInPeriod(timePeriod: AnalyticsTimePeriod): number {
    const diffTime = timePeriod.endDate.getTime() - timePeriod.startDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get all available activities for the dropdown
   */
  async getAvailableActivities(
    timePeriod: AnalyticsTimePeriod,
    playerIds: string[],
    game: 'D1' | 'D2' | 'both' = 'D2',
    activityType?: string
  ): Promise<ActivityOption[]> {
    console.log(`Getting available activities for type: ${activityType || 'All'}, game: ${game}`);
    const activities = await this.getActivitiesInPeriod(timePeriod, playerIds, game);
    const activityMap = new Map<string, ActivityOption>();

    activities.forEach(activity => {
      const isD1 = this.isD1Activity(activity);
      const name = this.manifest.getActivityName(activity.activityDetails?.referenceId, isD1);
      const type = this.getActivityType(name);
      const timeSpent = activity.values?.timePlayedSeconds?.basic?.value || 0;

      // Filter by activity type if specified
      if (activityType && type !== activityType) {
        console.log(`Filtering out activity: ${name} (type: ${type}, looking for: ${activityType})`);
        return;
      }

      if (activityMap.has(name)) {
        const existing = activityMap.get(name)!;
        existing.playCount++;
        existing.timeSpent += timeSpent;
      } else {
        console.log(`Including activity: ${name} (type: ${type})`);
        activityMap.set(name, {
          name,
          type,
          game: isD1 ? 'D1' : 'D2',
          playCount: 1,
          timeSpent
        });
      }
    });

    const result = Array.from(activityMap.values()).sort((a, b) => b.timeSpent - a.timeSpent);
    console.log(`Returning ${result.length} activities:`, result.map(a => `${a.name} (${a.type})`));
    return result;
  }

  /**
   * Get pie chart data for multiple specific activities
   */
  async getPieChartData(
    activityNames: string[],
    timePeriod: AnalyticsTimePeriod,
    playerIds: string[],
    game: 'D1' | 'D2' | 'both' = 'D2',
    metric: 'playCount' | 'timeSpent' | 'winRate' | 'completionRate' = 'timeSpent'
  ): Promise<{ labels: string[], data: number[], colors: string[] }> {
    const activities = await this.getActivitiesInPeriod(timePeriod, playerIds, game);
    const activityData = new Map<string, { playCount: number, timeSpent: number, winRate: number, completionRate: number }>();

    // Initialize data for selected activities
    activityNames.forEach(name => {
      activityData.set(name, { playCount: 0, timeSpent: 0, winRate: 0, completionRate: 0 });
    });

    // Aggregate data
    activities.forEach(activity => {
      const isD1 = this.isD1Activity(activity);
      const name = this.manifest.getActivityName(activity.activityDetails?.referenceId, isD1);
      
      if (activityNames.includes(name)) {
        const data = activityData.get(name)!;
        data.playCount++;
        data.timeSpent += activity.values?.timePlayedSeconds?.basic?.value || 0;
        
        // Calculate win rate for PvP activities
        if (this.getActivityType(name) === 'PvP') {
          const completed = activity.values?.completed?.basic?.value || 0;
          data.winRate = completed > 0 ? (completed / data.playCount) * 100 : 0;
        }
        
        // Calculate completion rate for PvE activities
        if (['Raid', 'Dungeon', 'Strike'].includes(this.getActivityType(name))) {
          const completed = activity.values?.completed?.basic?.value || 0;
          data.completionRate = completed > 0 ? (completed / data.playCount) * 100 : 0;
        }
      }
    });

    const labels: string[] = [];
    const data: number[] = [];
    const colors: string[] = [];

    activityData.forEach((value, name) => {
      labels.push(name);
      
      switch (metric) {
        case 'playCount':
          data.push(value.playCount);
          break;
        case 'timeSpent':
          data.push(Math.round(value.timeSpent / 60)); // Convert to minutes
          break;
        case 'winRate':
          data.push(Math.round(value.winRate));
          break;
        case 'completionRate':
          data.push(Math.round(value.completionRate));
          break;
      }
      
      // Generate colors based on activity type
      const type = this.getActivityType(name);
      colors.push(this.getActivityTypeColor(type));
    });

    return { labels, data, colors };
  }

  private getActivityTypeColor(activityType: string): string {
    const colors = {
      'Raid': '#ff6b6b',
      'Dungeon': '#4ecdc4',
      'Lost Sector': '#ff9ff3',
      'Seasonal': '#ffa726',
      'PvP': '#45b7d1',
      'Strike': '#96ceb4',
      'Gambit': '#feca57',
      'Other': '#a4b0be'
    };
    return colors[activityType as keyof typeof colors] || '#a4b0be';
  }

}
