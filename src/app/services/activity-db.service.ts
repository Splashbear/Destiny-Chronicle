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
      this.version(1).stores({
        // Compound index for fast queries by membershipId+characterId+period+mode
        activities: '++id, membershipId, characterId, period, [membershipId+characterId], [membershipId+characterId+period], [membershipId+characterId+mode]'
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

  async addActivities(activities: StoredActivity[]) {
    try {
      console.log(`[Dexie] Adding ${activities.length} activities to database`);
      
      // Group activities by year for better organization
      const activitiesByYear = activities.reduce((acc, activity) => {
        if (!activity.period) return acc;
        const year = new Date(activity.period).getUTCFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(activity);
        return acc;
      }, {} as { [year: string]: StoredActivity[] });

      // Log the years we're adding data for
      console.log(`[Dexie] Adding activities for years: ${Object.keys(activitiesByYear).join(', ')}`);

      // Store activities in the database
      await this.activities.bulkPut(activities);
      
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
      console.log(`[Dexie] Getting activities for ${membershipId}/${characterId} on ${month + 1}/${day}${year ? `/${year}` : ' (all years)'}`);
      
      // Get all activities for this character
      const activities = await this.activities
        .where({ membershipId, characterId })
        .toArray();
      
      console.log(`[Dexie] Found ${activities.length} total activities before date filtering`);
      
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
      console.log(`[Dexie] Activities available for years: ${years.join(', ')}`);
      
      // Filter activities by month, day, and optionally year
      const filtered = activities.filter(a => {
        if (!a.period) return false;
        const d = new Date(a.period);
        const activityMonth = d.getUTCMonth();
        const activityDay = d.getUTCDate();
        const activityYear = d.getUTCFullYear();
        
        // Log detailed date information for debugging
        console.log(`[Dexie] Checking activity date: ${d.toISOString()} (UTC: ${activityMonth + 1}/${activityDay}/${activityYear})`);
        console.log(`[Dexie] Target date: ${month + 1}/${day}${year ? `/${year}` : ' (any year)'}`);
        
        const match = activityMonth === month && 
                     activityDay === day && 
                     (!year || activityYear === year);
                     
        if (match) {
          console.log(`[Dexie] Found matching activity on ${d.toISOString()}`);
        }
        
        return match;
      });
      
      // Group filtered activities by year
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
} 