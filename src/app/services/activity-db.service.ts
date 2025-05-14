import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { ActivityHistory } from '../models/activity-history.model';

export interface StoredActivity extends ActivityHistory {
  membershipId: string;
  characterId: string;
  // period is already in ActivityHistory
  // mode is already in activityDetails
}

@Injectable({ providedIn: 'root' })
export class ActivityDbService extends Dexie {
  activities!: Table<StoredActivity, number>;

  constructor() {
    super('DestinyActivityDb');
    try {
      this.version(3).stores({
        // Use top-level instanceId and mode for compound indexes
        activities: '++id, membershipId, characterId, period, instanceId, mode, [membershipId+characterId+instanceId], [membershipId+characterId+mode]'
      });
      this.activities = this.table('activities');
      console.log('[Dexie] ActivityDbService initialized successfully');
      
      // Test the database connection
      this.activities.count().then(count => {
        console.log(`[Dexie] Current activity count: ${count}`);
      }).catch(error => {
        console.error('[Dexie] Error checking activity count:', error);
      });
    } catch (error) {
      console.error('[Dexie] Error initializing ActivityDbService:', error);
      throw error;
    }
  }

  private isDuplicateActivity(a1: StoredActivity, a2: StoredActivity): boolean {
    const isDuplicate = a1.membershipId === a2.membershipId &&
           a1.characterId === a2.characterId &&
           a1.activityDetails?.instanceId === a2.activityDetails?.instanceId &&
           a1.period === a2.period;

    // Debug logging for our target activity
    if (a1.activityDetails?.instanceId === '1859166440' || a2.activityDetails?.instanceId === '1859166440') {
      console.log('[Dexie] Checking for duplicate of target activity:', {
        activity1: {
          instanceId: a1.activityDetails?.instanceId,
          period: a1.period,
          membershipId: a1.membershipId,
          characterId: a1.characterId
        },
        activity2: {
          instanceId: a2.activityDetails?.instanceId,
          period: a2.period,
          membershipId: a2.membershipId,
          characterId: a2.characterId
        },
        isDuplicate,
        reason: isDuplicate ? 'All fields match' : 'Fields differ'
      });
    }

    return isDuplicate;
  }

  async addActivities(activities: StoredActivity[]) {
    try {
      console.log(`[Dexie] Adding ${activities.length} activities to database`);
      
      // Log if our target activity is in the incoming batch
      const targetActivity = activities.find(a => a.activityDetails?.instanceId === '1859166440');
      if (targetActivity) {
        console.log('[Dexie] Target activity found in incoming batch:', {
          period: targetActivity.period,
          utc: new Date(targetActivity.period).toISOString(),
          local: new Date(targetActivity.period).toLocaleString(),
          membershipId: targetActivity.membershipId,
          characterId: targetActivity.characterId
        });
      }
      
      // Deduplicate activities before storing
      const uniqueActivities = activities.filter((activity, index, self) => {
        const isDuplicate = index !== self.findIndex(a => this.isDuplicateActivity(a, activity));
        
        // Log if this is our target activity
        if (activity.activityDetails?.instanceId === '1859166440') {
          console.log('[Dexie] Target activity being deduplicated:', {
            isDuplicate,
            period: activity.period,
            utc: new Date(activity.period).toISOString(),
            local: new Date(activity.period).toLocaleString(),
            membershipId: activity.membershipId,
            characterId: activity.characterId
          });
        }
        
        return !isDuplicate;
      });

      console.log(`[Dexie] After deduplication: ${uniqueActivities.length} unique activities`);
      
      // Store activities in the database
      await this.activities.bulkPut(uniqueActivities);
      
      // Log the total count after adding
      const totalCount = await this.activities.count();
      console.log(`[Dexie] Total activities in database: ${totalCount}`);
    } catch (error) {
      console.error('[Dexie] Error adding activities:', error);
      throw error;
    }
  }

  async getActivitiesByDate(membershipId: string, characterId: string, month: number, day: number, year?: number): Promise<StoredActivity[]> {
    try {
      console.log(`[Dexie] Getting activities for ${membershipId}/${characterId} on ${month}/${day}${year ? `/${year}` : ' (all years)'}`);
      
      // Get all activities for this character
      const activities = await this.activities
        .where({ membershipId, characterId })
        .toArray();
      
      console.log(`[Dexie] Found ${activities.length} total activities before date filtering`);
      
      // Filter activities by month, day, and optionally year using UTC
      const filtered = activities.filter(a => {
        if (!a.period) return false;
        const d = new Date(a.period);
        const activityMonth = d.getUTCMonth() + 1; // Convert 0-11 to 1-12
        const activityDay = d.getUTCDate();
        const activityYear = d.getUTCFullYear();
        
        // Log detailed date information for debugging
        console.log(`[Dexie] Checking activity date:`, {
          period: a.period, // Log the raw period string
          utc: d.toISOString(),
          local: d.toLocaleString(),
          month: activityMonth,
          day: activityDay,
          year: activityYear,
          targetMonth: month,
          targetDay: day,
          targetYear: year
        });
        
        const match = activityMonth === month && 
                     activityDay === day && 
                     (!year || activityYear === year);
                     
        if (match) {
          console.log(`[Dexie] Found matching activity on ${d.toISOString()}`);
        }
        
        return match;
      });

      // Group filtered activities by year for analysis
      const filteredByYear = filtered.reduce((acc, activity) => {
        const year = new Date(activity.period).getUTCFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(activity);
        return acc;
      }, {} as { [year: string]: StoredActivity[] });

      // Log detailed information about filtered activities
      const filteredYears = Object.keys(filteredByYear).sort();
      console.log(`[Dexie] Found matches in years: ${filteredYears.join(', ')}`);
      
      filteredYears.forEach(year => {
        console.log(`[Dexie] Year ${year}: ${filteredByYear[year].length} activities`);
        // Log sample of activity types for this year
        const types = new Set(filteredByYear[year].map(a => a.activityDetails.mode));
        console.log(`[Dexie] Activity types in ${year}: ${Array.from(types).join(', ')}`);
      });

      return filtered;
    } catch (error) {
      console.error('[Dexie] Error getting activities by date:', error);
      throw error;
    }
  }

  async getActivitiesByMode(membershipId: string, characterId: string, mode: number): Promise<StoredActivity[]> {
    try {
      console.log(`[Dexie] Getting activities for ${membershipId}/${characterId} with mode ${mode}`);
      const activities = await this.activities
        .where({ membershipId, characterId })
        .filter(a => a.activityDetails.mode === mode)
        .toArray();
      console.log(`[Dexie] Found ${activities.length} activities for mode`);
      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting activities by mode:', error);
      throw error;
    }
  }

  async clearActivitiesForCharacter(membershipId: string, characterId: string) {
    try {
      console.log(`[Dexie] Clearing activities for ${membershipId}/${characterId}`);
      await this.activities
        .where({ membershipId, characterId })
        .delete();
      console.log('[Dexie] Activities cleared successfully');
    } catch (error) {
      console.error('[Dexie] Error clearing activities:', error);
      throw error;
    }
  }

  async getAllActivitiesForCharacter(membershipId: string, characterId: string): Promise<StoredActivity[]> {
    try {
      console.log(`[Dexie] Getting all activities for ${membershipId}/${characterId}`);
      const activities = await this.activities.where({ membershipId, characterId }).toArray();
      
      // Group activities by year for better analysis
      const activitiesByYear = activities.reduce((acc, activity) => {
        if (!activity.period) return acc;
        const year = new Date(activity.period).getUTCFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(activity);
        return acc;
      }, {} as { [year: string]: StoredActivity[] });

      // Log the years we have data for
      const years = Object.keys(activitiesByYear).sort();
      console.log(`[Dexie] Found activities for years: ${years.join(', ')}`);
      
      // Log activity counts per year
      years.forEach(year => {
        console.log(`[Dexie] Year ${year}: ${activitiesByYear[year].length} activities`);
      });

      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting all activities:', error);
      throw error;
    }
  }

  async clearAllActivities() {
    try {
      await this.activities.clear();
      console.log('[Dexie] All activities cleared.');
    } catch (error) {
      console.error('[Dexie] Error clearing all activities:', error);
      throw error;
    }
  }

  async getActivityByInstanceId(instanceId: string): Promise<StoredActivity | undefined> {
    try {
      return await this.activities.where('instanceId').equals(instanceId).first();
    } catch (error) {
      console.error('[Dexie] Error getting activity by instance ID:', error);
      return undefined;
    }
  }
} 