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
    '89727599': 'Leviathan',
    '287649202': 'Leviathan',
    '417231112': 'Leviathan',
    '508802457': 'Leviathan',
    '757116822': 'Leviathan',
    '771164842': 'Leviathan',
    '1685065161': 'Leviathan',
    '1699948563': 'Leviathan',
    '1800508819': 'Leviathan',
    '1875726950': 'Leviathan',
    '2693136600': 'Leviathan',
    '2693136601': 'Leviathan',
    '2693136602': 'Leviathan',
    '2693136603': 'Leviathan',
    '2693136604': 'Leviathan',
    '2693136605': 'Leviathan',
    '3916343513': 'Leviathan',
    '4039317196': 'Leviathan',
    '2449714930': 'Leviathan',
    '3857338478': 'Leviathan',
    '3446541099': 'Leviathan',
    '2164432138': 'Leviathan, Eater of Worlds',
    '809170886': 'Leviathan, Eater of Worlds',
    '3089205900': 'Leviathan, Eater of Worlds',
    '3333172150': 'Crown of Sorrow',
    '960175301': 'Crown of Sorrow',
    '119944200': 'Leviathan, Spire of Stars',
    '3004605630': 'Leviathan, Spire of Stars',
    '3213556450': 'Leviathan, Spire of Stars',
    '1042180643': 'Garden of Salvation',
    '2497200493': 'Garden of Salvation',
    '3458480158': 'Garden of Salvation',
    '3845997235': 'Garden of Salvation',
    '2659723068': 'Garden of Salvation',
    '910380154': 'Deep Stone Crypt',
    '3976949817': 'Deep Stone Crypt',
    '548750096': 'Scourge of the Past',
    '2812525063': 'Scourge of the Past',
    '2381413764': 'Root of Nightmares',
    '2918919505': 'Root of Nightmares',
    '1441982566': 'Vow of the Disciple',
    '2906950631': 'Vow of the Disciple',
    '4156879541': 'Vow of the Disciple',
    '3889634515': 'Vow of the Disciple',
    '4217492330': 'Vow of the Disciple',
    '2122313384': 'Last Wish',
    '1661734046': 'Last Wish',
    '2214608156': 'Last Wish',
    '2214608157': 'Last Wish',
    '3711931140': 'Vault of Glass',
    '1485585878': 'Vault of Glass',
    '1681562271': 'Vault of Glass',
    '3022541210': 'Vault of Glass',
    '3881495763': 'Vault of Glass',
    '1374392663': "King's Fall",
    '2897223272': "King's Fall",
    '3257594522': "King's Fall",
    '2964135793': "King's Fall",
    '1063970578': "King's Fall",
    '107319834': "Crota's End",
    '156253568': "Crota's End",
    '1507509200': "Crota's End",
    '1566480315': "Crota's End",
    '4179289725': "Crota's End",
    '1541433876': "Salvation's Edge",
    '940375169': "Salvation's Edge",
    '2192826039': "Salvation's Edge",
    '4129614942': "Salvation's Edge",
    // --- Destiny 2 Dungeons ---
    '2032534090': 'The Shattered Throne',
    '1375089621': 'Pit of Heresy',
    '785700673': 'Pit of Heresy',
    '785700678': 'Pit of Heresy',
    '2559374368': 'Pit of Heresy',
    '2559374374': 'Pit of Heresy',
    '2559374375': 'Pit of Heresy',
    '2582501063': 'Pit of Heresy',
    '1112917203': 'Grasp of Avarice',
    '4078656646': 'Grasp of Avarice',
    '1077850348': 'Prophecy',
    '4148187374': 'Prophecy',
    '2823159265': 'Duality',
    '3012587626': 'Duality',
    '1262462921': 'Spire of the Watcher',
    '2296818662': 'Spire of the Watcher',
    '313828469': 'Ghosts of the Deep',
    '2716998124': 'Ghosts of the Deep',
    '2004855007': "Warlord's Ruin",
    '2534833093': "Warlord's Ruin",
    '300092127': "Vesper's Host",
    '3834447244': "Sundered Doctrine",
    // --- Destiny 1 Raids ---
    '3801607287': 'Vault of Glass',
    '708693006': 'Vault of Glass',
    '898834093': "Crota's End",
    '1733556769': "King's Fall",
    '421023204': "King's Fall",
    '2578867903': 'Wrath of the Machine',
    '4007500989': 'Wrath of the Machine',
  };

  // Add D1 family map
  private static readonly D1_FAMILY_MAP: Record<string, string> = {
    // Vault of Glass (Normal & Hard)
    '3801607287': 'Vault of Glass', // Normal
    '708693006': 'Vault of Glass',  // Hard
    '2659248071': 'Vault of Glass', // Challenge
    '2043403989': 'Vault of Glass', // Variant

    // Crota's End (Normal & Hard)
    '898834093': "Crota's End",    // Normal
    '112157962': "Crota's End",    // Hard
    '3879860662': "Crota's End",   // Variant
    '1836893116': "Crota's End",   // New from logs

    // King's Fall (Normal & Hard)
    '1733556769': "King's Fall",   // Normal
    '421023204': "King's Fall",    // Hard
    '1661734046': "King's Fall",   // Variant
    '2964135793': "King's Fall",   // Variant

    // Wrath of the Machine (Normal & Hard)
    '2578867903': 'Wrath of the Machine', // Normal
    '4007500989': 'Wrath of the Machine', // Hard
    '1099433614': 'Wrath of the Machine', // Variant
    '1342567280': 'Wrath of the Machine', // Variant
    '260765522': 'Wrath of the Machine',  // New from logs
  };

  constructor(
    private manifest: DestinyManifestService,
    private bungieService: BungieApiService
  ) {
    super('DestinyChronicleDb');
    try {
      this.version(1).stores({
        activities: '++id, membershipId, characterId, period, instanceId, mode, validated, validatedAt, [membershipId+characterId+instanceId], [membershipId+characterId+mode], [period+membershipId+characterId]',
        favorites: 'membershipId, game'
      });

      this.version(2).stores({
        activities: '++id, membershipId, characterId, period, instanceId, mode, validated, validatedAt, [membershipId+characterId+instanceId], [membershipId+characterId+mode], [period+membershipId+characterId]',
        favorites: 'membershipId, game'
      }).upgrade(tx => {
        console.log('[Dexie] Upgrading to version 2');
      });

      this.version(3).stores({
        activities: '++id, membershipId, characterId, period, instanceId, mode, validated, validatedAt, game, ' +
                   '[membershipId+characterId+instanceId], ' + // For deduplication
                   '[membershipId+characterId+mode], ' + // For activity type filtering
                   '[period+membershipId+characterId], ' + // For date-based queries
                   '[game+membershipId+characterId], ' + // For game-specific queries
                   '[mode+period+membershipId], ' + // For activity type + date queries
                   '[validated+membershipId+characterId]', // For validation status
        favorites: 'membershipId, game'
      }).upgrade(tx => {
        console.log('[Dexie] Upgrading to version 3');
        // Add game field to existing activities
        return tx.activities.toCollection().modify(activity => {
          activity.game = activity.activityDetails?.mode >= 4 ? 'D2' : 'D1';
        });
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

  async getFirstCompletions(membershipId: string, characterId: string, game: 'D1' | 'D2'): Promise<GuardianFirsts> {
    // Print all D1 raid activities for this user
    const activities = await this.activities
      .where(['membershipId', 'characterId'])
      .equals([membershipId, characterId])
      .toArray();
    if (game === 'D1') {
      const d1RaidHashes = Object.keys(ActivityDbService.D1_FAMILY_MAP);
      const allD1Raids = activities.filter(a => d1RaidHashes.includes(String(a.activityDetails.referenceId)));
      console.log('[GuardianFirsts][DEBUG] All D1 raid activities for user:', allD1Raids.map(a => ({
        period: a.period,
        referenceId: a.activityDetails.referenceId,
        family: ActivityDbService.D1_FAMILY_MAP[a.activityDetails.referenceId],
        completed: a.values?.completed?.basic?.value,
        instanceId: a.activityDetails.instanceId
      })));
    }
    // Group by raid/dungeon family and find the first activity for each
    const firstsByFamily: { [family: string]: ActivityFirstCompletion } = {};
    for (const activity of activities) {
      const type = this.manifest.getActivityType(activity.activityDetails.referenceId, activity.activityDetails.mode);
      const allowedTypes = ['raid', 'dungeon', 'strike', 'nightfall', 'crucible', 'gambit', 'other'];
      const safeType = allowedTypes.includes(type) ? type : 'other';
      if (game === 'D1') {
        // Removed: console.log('[GuardianFirsts][DEBUG][TypeCheck]', {
        //   referenceId: activity.activityDetails.referenceId,
        //   type,
        //   mode: activity.activityDetails.mode,
        //   period: activity.period,
        //   name: this.manifest.getActivityName(activity.activityDetails.referenceId, true)
        // });
      }
      // Only consider dungeons for D2
      if ((game === 'D1' && type !== 'raid') || (game === 'D2' && type !== 'raid' && type !== 'dungeon')) continue;
      const activityHash = activity.activityDetails.referenceId;
      const family = game === 'D2'
        ? ActivityDbService.ACTIVITY_FAMILY_MAP[activityHash]
        : ActivityDbService.D1_FAMILY_MAP[activityHash];
      if (!family) continue;
      const completed = activity.values?.completed?.basic?.value ?? 0;
      if (completed !== 1) {
        console.log('[DEBUG][Firsts][Skip] Not a completion:', {
          name: this.manifest.getActivityName(activityHash, game === 'D1'),
          completed,
          period: activity.period,
          referenceId: activityHash
        });
        continue;
      }
      console.log('[DEBUG][Firsts][Candidate]', {
        name: this.manifest.getActivityName(activityHash, game === 'D1'),
        completed,
        period: activity.period,
        referenceId: activityHash
      });
      if (!firstsByFamily[family] || new Date(activity.period) < new Date(firstsByFamily[family].period)) {
        firstsByFamily[family] = {
          name: this.manifest.getActivityName(activityHash, game === 'D1') || 'Unknown Activity',
          type: safeType as ActivityFirstCompletion['type'],
          game,
          completionDate: activity.period,
          referenceId: activityHash,
          period: activity.period,
          instanceId: activity.activityDetails.instanceId,
          mode: activity.activityDetails.mode,
          characterId,
          membershipId,
          completed
        };
        console.log('[DEBUG][Firsts][Pick]', {
          family,
          name: this.manifest.getActivityName(activityHash, game === 'D1'),
          completed,
          period: activity.period,
          referenceId: activityHash
        });
      }
    }
    const firstCompletions: ActivityFirstCompletion[] = Object.values(firstsByFamily);
    console.log('[GuardianFirsts][DEBUG][FirstsByFamily]', firstsByFamily);
    return {
      firstCompletions,
      membershipId,
      characterId,
      displayName: '', // This will be set by the component
      platform: '' // This will be set by the component
    };
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

  async getActivitiesByGame(membershipId: string, characterId: string, game: 'D1' | 'D2'): Promise<StoredActivity[]> {
    try {
      return await this.activities
        .where('[game+membershipId+characterId]')
        .equals([game, membershipId, characterId])
        .toArray();
    } catch (error) {
      console.error('[Dexie] Error getting activities by game:', error);
      throw error;
    }
  }

  async getActivitiesByModeAndDate(membershipId: string, mode: number, startDate: Date, endDate: Date): Promise<StoredActivity[]> {
    try {
      return await this.activities
        .where('[mode+period+membershipId]')
        .between(
          [mode, startDate.toISOString(), membershipId],
          [mode, endDate.toISOString(), membershipId]
        )
        .toArray();
    } catch (error) {
      console.error('[Dexie] Error getting activities by mode and date:', error);
      throw error;
    }
  }

  async getUnvalidatedActivitiesByCharacter(membershipId: string, characterId: string): Promise<StoredActivity[]> {
    try {
      return await this.activities
        .where('[validated+membershipId+characterId]')
        .equals([false, membershipId, characterId])
        .toArray();
    } catch (error) {
      console.error('[Dexie] Error getting unvalidated activities:', error);
      throw error;
    }
  }
} 