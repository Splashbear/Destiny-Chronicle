import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { ActivityHistory } from '../models/activity-history.model';
import { RAID_NAMES, GuardianFirsts, ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { DestinyManifestService } from './destiny-manifest.service';
import { BungieApiService } from './bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Activity } from '../models/activity.model';
import { PGCRCacheService } from './pgcr-cache.service';
import { DungeonSoloFirst } from '../models/dungeon-solo-first.model';

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

@Injectable({
  providedIn: 'root'
})
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
    private bungieService: BungieApiService,
    private pgcrCacheService: PGCRCacheService,
    private http: HttpClient
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
        return tx.table('activities').toCollection().modify((activity: any) => {
          activity.game = activity.activityDetails?.mode >= 4 ? 'D2' : 'D1';
        });
      });

      // Version 4 – add membershipType index so we can query by platform quickly
      this.version(4).stores({
        activities: '++id, membershipId, membershipType, characterId, period, instanceId, mode, validated, validatedAt, game, ' +
                   '[membershipId+characterId+instanceId], [membershipId+characterId+mode], [period+membershipId+characterId], ' +
                   '[game+membershipId+characterId], membershipType',
        favorites: 'membershipId, game'
      }).upgrade(tx => {
        console.log('[Dexie] Upgrading to version 4 (membershipType index)');
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
      // Defensive check
      if (!membershipId || !characterId || !month || !day) {
        console.error('[Dexie] Invalid key for getActivitiesByDate:', { membershipId, characterId, month, day });
        return [];
      }

      // Get all activities for the character
      const activities = await this.activities
        .where({ membershipId, characterId })
        .toArray();

      // Filter activities to match the exact month and day
      return activities.filter(activity => {
        if (!activity.period) return false;
        const activityDate = new Date(activity.period);
        const activityMonth = activityDate.getUTCMonth() + 1; // Convert 0-11 to 1-12
        const activityDay = activityDate.getUTCDate();
        const activityYear = activityDate.getUTCFullYear();

        // If year is specified, also check the year
        if (year) {
          return activityMonth === month && 
                 activityDay === day && 
                 activityYear === year;
        }

        // Otherwise just check month and day
        return activityMonth === month && activityDay === day;
      });
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
    // Fetch all stored activities for this membership/character
    const activities = await this.activities
      .where(['membershipId', 'characterId'])
      .equals([membershipId, characterId])
      .toArray();

    // Helpful debug for D1
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
      const activityHash = String(activity.activityDetails.referenceId);

      // Determine activity type
      let type = this.manifest.getActivityType(activityHash, activity.activityDetails.mode);
      const allowedTypes = ['raid', 'dungeon', 'strike', 'nightfall', 'crucible', 'gambit', 'other'];
      if (!allowedTypes.includes(type)) {
        type = 'other';
      }

      // --- Game-specific filters ---
      if (game === 'D1') {
        // Treat any activity whose referenceId exists in the D1_FAMILY_MAP as a raid
        if (!ActivityDbService.D1_FAMILY_MAP[activityHash]) {
          // Not a D1 raid, skip
          continue;
        }
        type = 'raid';
      } else {
        // D2: only raids & dungeons
        if (type !== 'raid' && type !== 'dungeon') {
          continue;
        }
      }

      const family = game === 'D2'
        ? ActivityDbService.ACTIVITY_FAMILY_MAP[activityHash]
        : ActivityDbService.D1_FAMILY_MAP[activityHash];
      if (!family) continue;
      const completed = activity.values?.completed?.basic?.value ?? 0;
      if (completed !== 1) {
        // console.log('[DEBUG][Firsts][Skip] Not a completion:', {
        //   name: this.manifest.getActivityName(activityHash, game === 'D1'),
        //   completed,
        //   period: activity.period,
        //   referenceId: activityHash
        // });
        continue;
      }

      // Check for solo and flawless status
      let isSolo = false;
      let isSoloFlawless = false;
      
      if (game === 'D2' && type === 'dungeon') {
        // Fetch the pruned PGCR (if cached). We cast to <any> to keep the
        // existing "entries" access until the rest of the codebase is fully
        // migrated to the typed `PrunedPgcr` shape.
        const pgcr: any = await this.pgcrCacheService.get(activity.activityDetails.instanceId);
        if (pgcr) {
          // Check if solo (only one player)
          const uniquePlayers = new Set(pgcr.entries.map((e: any) => e.player.destinyUserInfo.membershipId));
          isSolo = uniquePlayers.size === 1;
          
          // Check if flawless (no deaths)
          if (isSolo) {
            isSoloFlawless = pgcr.entries.every((e: any) => e.values.deaths.basic.value === 0);
          }
        }
      }

      if (!firstsByFamily[family] || new Date(activity.period) < new Date(firstsByFamily[family].period)) {
        firstsByFamily[family] = {
          name: this.manifest.getActivityName(activityHash, game === 'D1') || 'Unknown Activity',
          type: type as ActivityFirstCompletion['type'],
          game,
          completionDate: activity.period,
          referenceId: activityHash,
          period: activity.period,
          instanceId: activity.activityDetails.instanceId,
          mode: activity.activityDetails.mode,
          characterId,
          membershipId,
          completed,
          isSolo,
          isSoloFlawless
        };
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

  // Store a batch of activities and explicitly tag them with the correct game
  private async storeActivities(activities: any[], characterId: string, game: 'D1' | 'D2'): Promise<void> {
    try {
      const activitiesToStore = activities.map(activity => ({
        ...activity,
        characterId,
        validated: false,
        validatedAt: null,
        game
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
        // ---------------- Full D1 pagination ----------------
        const D1_MODES = [
          0,1,2,3,4,5,6,10,12,15,16,17,18,19,22,24,25,31,32,37,38,39,40,41,42,43,44,45,46,48,49,50,51,52,53
        ];
        const pageSize = 250;
        for (const mode of D1_MODES) {
          let page = 0;
          let hasMore = true;
          while (hasMore) {
            let resp: any;
            try {
              resp = await firstValueFrom(
                this.bungieService.getD1ActivityHistory(membershipType, membershipId, characterId, mode, page)
              );
            } catch (err) {
              console.warn(`[D1] fetch failed for mode ${mode} page ${page}`, err);
              break; // stop this mode on error to avoid infinite loop
            }

            const pageActs = resp?.data?.activities || [];
            activities.push(...pageActs);

            // Continue while Bungie signals more AND we received a full page
            hasMore = resp?.hasMore === true && pageActs.length === pageSize;
            page++;
          }
        }
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
        await this.storeActivities(newActivities, characterId, isD1 ? 'D1' : 'D2');
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
        .where({ membershipId, characterId })
        .filter((activity: any) => activity.validated === false)
        .toArray();
    } catch (error) {
      console.error('[Dexie] Error getting unvalidated activities:', error);
      throw error;
    }
  }

  /**
   * Determines if an activity qualifies as a completion. Bungie's activity history sets
   * `values.completed.basic.value === 1` for a successfully finished activity.
   */
  private isCompletion(activity: StoredActivity): boolean {
    return (activity.values?.completed?.basic?.value ?? 0) === 1;
  }

  /** Returns true when the activity was completed solo (playerCount === 1). */
  private isSolo(activity: StoredActivity): boolean {
    return (activity.values?.playerCount?.basic?.value ?? 0) === 1;
  }

  /** Returns true when the activity was completed solo and flawless (no deaths). */
  private isSoloFlawless(activity: StoredActivity): boolean {
    return this.isSolo(activity) && (activity.values?.deaths?.basic?.value ?? 1) === 0;
  }

  /**
   * Checks if the provided referenceId corresponds to a Dungeon.
   * It relies on DestinyManifestService.getActivityType so that
   * it stays accurate as new dungeons are added.
   */
  private isDungeon(referenceId: string | number, mode?: number): boolean {
    const type = this.manifest.getActivityType(referenceId, mode);
    return type === 'dungeon';
  }

  /**
   * Returns the first solo and solo-flawless dungeon completions per dungeon family
   * for the specified Destiny 2 account (all characters).
   *
   * This method performs an in-memory scan—no extra API calls.
   */
  async getDungeonSoloFirsts(membershipId: string): Promise<DungeonSoloFirst[]> {
    // Gather all stored activities for this player (all characters) limited to Destiny 2.
    const activities = await this.activities
      .where('membershipId')
      .equals(membershipId)
      .toArray();

    // Sort by period ascending so the earliest completions are encountered first.
    activities.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

    const firstsMap = new Map<string, { firstSolo?: StoredActivity; firstFlawless?: StoredActivity }>();

    for (const activity of activities) {
      // We only care about completed dungeon runs.
      if (!this.isCompletion(activity)) continue;

      const { referenceId, mode } = activity.activityDetails;
      if (!this.isDungeon(referenceId, mode)) continue;

      const family = ActivityDbService.ACTIVITY_FAMILY_MAP[String(referenceId)];
      if (!family) continue; // Unknown / unmapped dungeon hash.

      let entry = firstsMap.get(family);
      if (!entry) {
        entry = {};
        firstsMap.set(family, entry);
      }

      // Determine solo / flawless status.
      const solo = this.isSolo(activity);
      const flawless = this.isSoloFlawless(activity);

      if (solo && !entry.firstSolo) {
        entry.firstSolo = activity;
      }
      if (flawless && !entry.firstFlawless) {
        entry.firstFlawless = activity;
      }

      // Early exit optimisation: if we already have both firsts we can skip further processing for this family.
      if (entry.firstSolo && entry.firstFlawless) {
        continue;
      }
    }

    // Convert to the public model.
    const result: DungeonSoloFirst[] = [];
    firstsMap.forEach((value, key) => {
      result.push({ family: key, firstSolo: value.firstSolo, firstFlawless: value.firstFlawless });
    });

    return result;
  }

  /** Returns how many activities we have stored for the given list of membershipIds */
  async countActivitiesForMemberships(membershipIds: string[]): Promise<number> {
    if (!membershipIds?.length) return 0;
    return this.activities.where('membershipId').anyOf(membershipIds).count();
  }

  /**
   * Returns all activities played on the specified platform (membershipType).
   * 1 = Xbox, 2 = PlayStation, 3 = Steam, 4 = Blizzard, 5 = Stadia, 6 = Epic
   */
  async getActivitiesByPlatform(membershipType: number): Promise<StoredActivity[]> {
    return this.activities.where('membershipType').equals(membershipType).toArray();
  }
} 