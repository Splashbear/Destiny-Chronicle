import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { ActivityHistory } from '../models/activity-history.model';
import { RAID_NAMES, GuardianFirsts, ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { DestinyManifestService } from './destiny-manifest.service';

export interface StoredActivity extends ActivityHistory {
  membershipId: string;
  characterId: string;
  // period is already in ActivityHistory
  // mode is already in activityDetails
  validated?: boolean;
  validatedAt?: string;
  instanceId?: string;
  game?: 'D1' | 'D2';
}

@Injectable({ providedIn: 'root' })
export class ActivityDbService extends Dexie {
  activities!: Table<StoredActivity, number>;

  constructor(private manifest: DestinyManifestService) {
    super('DestinyActivityDb');
    try {
      this.version(4).stores({
        // Add indexes for validation state and improve date indexing
        activities: '++id, membershipId, characterId, period, instanceId, mode, validated, validatedAt, [membershipId+characterId+instanceId], [membershipId+characterId+mode], [period+membershipId+characterId]'
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
    return a1.membershipId === a2.membershipId &&
           a1.characterId === a2.characterId &&
           a1.activityDetails?.instanceId === a2.activityDetails?.instanceId;
  }

  async addActivities(activities: StoredActivity[]) {
    try {
      console.log(`[Dexie] Adding ${activities.length} activities to database`);
      // Deduplicate activities before storing
      const uniqueActivities = activities.filter((activity, index, self) => {
        return index === self.findIndex(a => this.isDuplicateActivity(a, activity));
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
      
      // Create date range for the specified day
      const startDate = new Date(Date.UTC(year || 2014, month - 1, day, 0, 0, 0));
      const endDate = new Date(Date.UTC(year || 2030, month - 1, day, 23, 59, 59));
      
      // Use compound index for efficient date-based querying
      const activities = await this.activities
        .where('[period+membershipId+characterId]')
        .between(
          [startDate.toISOString(), membershipId, characterId],
          [endDate.toISOString(), membershipId, characterId]
        )
        .toArray();
      
      console.log(`[Dexie] Found ${activities.length} activities for date range`);
      return activities;
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

  async getUnvalidatedActivities(membershipId: string, characterId: string): Promise<StoredActivity[]> {
    try {
      return await this.activities
        .where({ membershipId, characterId })
        .filter(activity => !activity.validated)
        .toArray();
    } catch (error) {
      console.error('[Dexie] Error getting unvalidated activities:', error);
      throw error;
    }
  }

  async getFirstCompletions(membershipId: string, characterId: string, game?: 'D1' | 'D2'): Promise<GuardianFirsts | undefined> {
    try {
      if (!membershipId || !characterId) {
        console.log('[DEBUG] getFirstCompletions: Missing membershipId or characterId');
        return undefined;
      }

      console.log(`[DEBUG] getFirstCompletions: Starting for ${membershipId}/${characterId} (game: ${game})`);

      // Get all activities for the character
      const activities = await this.activities
        .where({ membershipId, characterId })
        .toArray();

      console.log(`[DEBUG] getFirstCompletions: Found ${activities.length} total activities`);

      // Group by activity type and referenceId to find first completions
      const firstCompletions = new Map<string, ActivityFirstCompletion>();

      for (const activity of activities) {
        if (!activity.activityDetails?.referenceId) continue;
        
        const type = this.manifest.getActivityType(activity.activityDetails.referenceId);
        // Only process raids and dungeons
        if (type !== 'raid' && type !== 'dungeon') continue;

        const key = `${type}-${activity.activityDetails.referenceId}`;
        const existing = firstCompletions.get(key);

        if (!existing || new Date(activity.period) < new Date(existing.period)) {
          firstCompletions.set(key, {
            type,
            name: this.manifest.getActivityName(activity.activityDetails.referenceId, activity.game === 'D1'),
            game: activity.game || 'D2', // Default to D2 if undefined
            period: activity.period,
            completionDate: activity.period,
            referenceId: activity.activityDetails.referenceId,
            instanceId: activity.activityDetails.instanceId || '',
            mode: activity.activityDetails.mode,
            characterId: activity.characterId,
            membershipId: activity.membershipId
          });
        }
      }

      const filteredFirsts = Array.from(firstCompletions.values());
      console.log('[DEBUG] Filtered first completions (raids/dungeons only):', filteredFirsts);

      return {
        membershipId,
        characterId,
        displayName: '', // or whatever you use
        platform: '',    // or whatever you use
        firstCompletions: filteredFirsts
      };
    } catch (error) {
      console.error('Error getting first completions:', error);
      return undefined;
    }
  }

  async validateAllActivities() {
    const all = await this.activities.toArray();
    let updated = 0;
    for (const activity of all) {
      if (!activity.validated) {
        activity.validated = true;
        activity.validatedAt = new Date().toISOString();
        await this.activities.put(activity);
        updated++;
      }
      console.log('[DEBUG] Activity membershipId/characterId:', activity.membershipId, activity.characterId);
    }
    console.log(`[DEBUG] Validated ${updated} activities out of ${all.length}`);
  }
} 