import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { ActivityHistory } from '../models/activity-history.model';
import { RAID_NAMES, GuardianFirsts, ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { DestinyManifestService } from './destiny-manifest.service';
import { BungieApiService } from './bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { BungieMembershipType } from 'bungie-api-ts/user';

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

export interface FavoriteAccount {
  membershipId: string;
  membershipType: number;
  displayName: string;
  game: 'D1' | 'D2';
  platform: string;
  lastUpdated: string; // ISO date
}

@Injectable({ providedIn: 'root' })
export class ActivityDbService extends Dexie {
  activities!: Table<StoredActivity, number>;
  favorites!: Table<FavoriteAccount, string>;

  // Canonical mapping for all D2 and D1 raids/dungeons (2024, expand as needed)
  private static readonly ACTIVITY_FAMILY_MAP: Record<string, string> = {
    // --- Destiny 2 Raids ---
    '2693136600': 'Leviathan',
    '2693136601': 'Leviathan',
    '2693136602': 'Leviathan',
    '2693136603': 'Leviathan',
    '2693136604': 'Leviathan',
    '2693136605': 'Leviathan',
    '3333172150': 'Eater of Worlds',
    '3916343513': 'Eater of Worlds',
    '3089205900': 'Spire of Stars',
    '119944200': 'Spire of Stars',
    '2122313384': 'Crown of Sorrow',
    '3458480158': 'Garden of Salvation',
    '910380154': 'Deep Stone Crypt',
    '1374392663': 'Vow of the Disciple',
    '1441982566': 'Vault of Glass',
    '2381413762': "King's Fall",
    '3711931140': "Crota's End",
    '2381413763': 'Root of Nightmares',
    '4179289725': "Salvation's Edge",
    // --- Destiny 2 Dungeons ---
    '2032534090': 'The Shattered Throne',
    '1375089621': 'Pit of Heresy',
    '4148187374': 'Prophecy',
    '4078656646': 'Grasp of Avarice',
    '1441982567': 'Duality',
    '3213556450': 'Spire of the Watcher',
    '4226118555': 'Ghosts of the Deep',
    '4226118556': "Warlord's Ruin",
    // Vesper's Host (all variants)
    '1915770060': "Vesper's Host",
    '300092127': "Vesper's Host",
    '3492566689': "Vesper's Host",
    '4293676253': "Vesper's Host",
    // Sundered Doctrine (all variants)
    '247869137': 'Sundered Doctrine',
    '3521648250': 'Sundered Doctrine',
    '3834447244': 'Sundered Doctrine',
    // --- Destiny 1 Raids ---
    '3801607287': 'Vault of Glass',
    '708693006': 'Vault of Glass',
    '3879860661': "Crota's End",
    '898834093': "Crota's End",
    '1733556769': "King's Fall",
    '421023204': "King's Fall",
    '2578867903': 'Wrath of the Machine',
    '4007500989': 'Wrath of the Machine',
  };

  constructor(
    private manifest: DestinyManifestService,
    private bungieService: BungieApiService
  ) {
    super('DestinyChronicleDb');
    try {
      this.version(2).stores({
        activities: '++id, membershipId, characterId, period, instanceId, mode, validated, validatedAt, [membershipId+characterId+instanceId], [membershipId+characterId+mode], [period+membershipId+characterId]',
        favorites: 'membershipId, game'
      });
      this.activities = this.table('activities');
      this.favorites = this.table('favorites');
      // console.log('[Dexie] ActivityDbService initialized successfully');
      
      // Test the database connection
      // this.activities.count().then(count => {
      //   console.log(`[Dexie] Current activity count: ${count}`);
      // }).catch(error => {
      //   console.error('[Dexie] Error checking activity count:', error);
      // });
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
      // console.log(`[Dexie] Adding ${activities.length} activities to database`);
      // Deduplicate activities before storing
      const uniqueActivities = activities.filter((activity, index, self) => {
        return index === self.findIndex(a => this.isDuplicateActivity(a, activity));
      });
      // console.log(`[Dexie] After deduplication: ${uniqueActivities.length} unique activities`);
      // Store activities in the database
      await this.activities.bulkPut(uniqueActivities);
      // Log the total count after adding
      // const totalCount = await this.activities.count();
      // console.log(`[Dexie] Total activities in database: ${totalCount}`);
    } catch (error) {
      console.error('[Dexie] Error adding activities:', error);
      throw error;
    }
  }

  async getActivitiesByDate(membershipId: string, characterId: string, month: number, day: number, year?: number): Promise<StoredActivity[]> {
    try {
      // console.log(`[Dexie] Getting activities for ${membershipId}/${characterId} on ${month}/${day}${year ? `/${year}` : ' (all years)'}`);
      
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
      
      // console.log(`[Dexie] Found ${activities.length} activities for date range`);
      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting activities by date:', error);
      throw error;
    }
  }

  async getActivitiesByMode(membershipId: string, characterId: string, mode: number): Promise<StoredActivity[]> {
    try {
      // console.log(`[Dexie] Getting activities for ${membershipId}/${characterId} with mode ${mode}`);
      const activities = await this.activities
        .where({ membershipId, characterId })
        .filter(a => a.activityDetails.mode === mode)
        .toArray();
      // console.log(`[Dexie] Found ${activities.length} activities for mode`);
      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting activities by mode:', error);
      throw error;
    }
  }

  async clearActivitiesForCharacter(membershipId: string, characterId: string) {
    try {
      // console.log(`[Dexie] Clearing activities for ${membershipId}/${characterId}`);
      await this.activities
        .where({ membershipId, characterId })
        .delete();
      // console.log('[Dexie] Activities cleared successfully');
    } catch (error) {
      console.error('[Dexie] Error clearing activities:', error);
      throw error;
    }
  }

  async getAllActivitiesForCharacter(membershipId: string, characterId: string): Promise<StoredActivity[]> {
    try {
      // console.log(`[Dexie] Getting all activities for ${membershipId}/${characterId}`);
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
      // const years = Object.keys(activitiesByYear).sort();
      // console.log(`[Dexie] Found activities for years: ${years.join(', ')}`);
      
      // Log activity counts per year
      // years.forEach(year => {
      //   console.log(`[Dexie] Year ${year}: ${activitiesByYear[year].length} activities`);
      // });

      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting all activities:', error);
      throw error;
    }
  }

  async clearAllActivities() {
    try {
      await this.activities.clear();
      // console.log('[Dexie] All activities cleared.');
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
        // console.log('[DEBUG] getFirstCompletions: Missing membershipId or characterId');
        return undefined;
      }

      // D1 family map for grouping
      const D1_FAMILY_MAP: Record<string, string> = {
        '3801607287': 'Vault of Glass', '708693006': 'Vault of Glass',
        '3879860661': "Crota's End", '898834093': "Crota's End",
        '1733556769': "King's Fall", '421023204': "King's Fall",
        '2578867903': 'Wrath of the Machine', '4007500989': 'Wrath of the Machine',
      };

      // Get all activities for the character
      const activities = await this.activities
        .where({ membershipId, characterId })
        .toArray();

      // console.log('[DEBUG] getFirstCompletions: Found activities:', {
      //   total: activities.length,
      //   game,
      //   membershipId,
      //   characterId
      // });

      // Group by canonical activity family
      const firstCompletions = new Map<string, ActivityFirstCompletion>();

      for (const activity of activities) {
        if (!activity.activityDetails?.referenceId) continue;
        if (activity.values?.completed?.basic?.value !== 1) continue;

        // Debug log for each activity
        // console.log('[DEBUG] getFirstCompletions: Processing activity:', {
        //   referenceId: activity.activityDetails.referenceId,
        //   mode: activity.activityDetails.mode,
        //   game: activity.game,
        //   completed: activity.values?.completed?.basic?.value,
        //   period: activity.period
        // });

        const type = this.manifest.getActivityType(
          activity.activityDetails.referenceId,
          activity.activityDetails.mode
        );

        // console.log('[DEBUG] getFirstCompletions: Activity type:', {
        //   referenceId: activity.activityDetails.referenceId,
        //   type,
        //   game: activity.game
        // });

        if (type !== 'raid' && type !== 'dungeon') continue;

        let familyName = '';
        if (activity.game !== 'D1') {
          // Only include if in the canonical map
          const mapped = ActivityDbService.ACTIVITY_FAMILY_MAP[activity.activityDetails.referenceId];
          if (!mapped) continue; // SKIP Pantheon and any non-canonical
          familyName = mapped;
        } else {
          // D1: use the D1 map or manifest
          familyName = D1_FAMILY_MAP[activity.activityDetails.referenceId]
            || this.manifest.getActivityName(activity.activityDetails.referenceId, true)
            || 'Unknown Activity';
          if (!familyName || familyName === 'Unknown Activity') continue;
        }

        // console.log('[DEBUG] getFirstCompletions: Family name:', {
        //   referenceId: activity.activityDetails.referenceId,
        //   familyName,
        //   game: activity.game
        // });

        const key = `${type}-${activity.game === 'D1' ? 'D1' : 'D2'}-${familyName}`;
        const existing = firstCompletions.get(key);
        if (!existing || new Date(activity.period) < new Date(existing.period)) {
          firstCompletions.set(key, {
            type,
            name: familyName,
            game: activity.game === 'D1' ? 'D1' : 'D2',
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
      // console.log('[DEBUG] getFirstCompletions: Final first completions:', {
      //   total: filteredFirsts.length,
      //   firsts: filteredFirsts
      // });

      return {
        membershipId,
        characterId,
        displayName: '',
        platform: '',
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
      // console.log('[DEBUG] Activity membershipId/characterId:', activity.membershipId, activity.characterId);
    }
    // console.log(`[DEBUG] Validated ${updated} activities out of ${all.length}`);
  }

  private async getLastActivityDate(characterId: string): Promise<Date | null> {
    try {
      const activities = await this.activities
        .where('characterId')
        .equals(characterId)
        .sortBy('period');
      
      if (activities.length === 0) {
        return null;
      }
      
      return new Date(activities[activities.length - 1].period);
    } catch (error) {
      console.error('[DEBUG] Error getting last activity date:', error);
      return null;
    }
  }

  private async storeActivities(activities: any[], characterId: string): Promise<void> {
    try {
      const activitiesToStore = activities.map(activity => ({
        ...activity,
        characterId,
        validated: false,
        validatedAt: null
      }));

      await this.addActivities(activitiesToStore);
    } catch (error) {
      console.error('[DEBUG] Error storing activities:', error);
      throw error;
    }
  }

  async fetchAndStoreActivities(
    membershipType: BungieMembershipType,
    membershipId: string,
    characterId: string,
    isD1: boolean = false
  ): Promise<void> {
    try {
      // console.log('[DEBUG] Starting activity fetch:', {
      //   membershipType,
      //   membershipId,
      //   characterId,
      //   isD1
      // });

      // Get the last stored activity date for this character
      const lastActivity = await this.getLastActivityDate(characterId);
      // console.log('[DEBUG] Last stored activity:', lastActivity);

      let activities: any[] = [];
      if (isD1) {
        // Use the new method for D1 activities
        const response = await firstValueFrom(
          this.bungieService.getAllD1Activities(membershipType, membershipId, characterId)
        );
        activities = (response as any).data.activities || [];
      } else {
        // Existing D2 activity fetching logic
        const response = await firstValueFrom(
          this.bungieService.getActivityHistory(membershipType, membershipId, characterId)
        );
        activities = (response as any).data.activities || [];
      }

      // console.log('[DEBUG] Fetched activities:', {
      //   count: activities.length,
      //   firstActivity: activities[0],
      //   lastActivity: activities[activities.length - 1]
      // });

      // Filter out activities we already have
      const newActivities = activities.filter(activity => {
        const activityDate = new Date(activity.period);
        return !lastActivity || activityDate > lastActivity;
      });

      // console.log('[DEBUG] New activities to store:', {
      //   total: activities.length,
      //   new: newActivities.length,
      //   skipped: activities.length - newActivities.length
      // });

      if (newActivities.length > 0) {
        // Store new activities
        await this.storeActivities(newActivities, characterId);
        // console.log('[DEBUG] Successfully stored new activities');
      } else {
        // console.log('[DEBUG] No new activities to store');
      }
    } catch (error) {
      console.error('[DEBUG] Error in fetchAndStoreActivities:', error);
      throw error;
    }
  }

  async addFavorite(account: FavoriteAccount) {
    await this.favorites.put(account);
  }

  async removeFavorite(membershipId: string, game: 'D1' | 'D2') {
    await this.favorites.where({ membershipId, game }).delete();
  }

  async getFavorites(): Promise<FavoriteAccount[]> {
    return this.favorites.toArray();
  }
} 