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
  id?: number; // Auto-incremented primary key
  compositeKey: string; // Synthetic key for uniqueness
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
  favorites!: Table<FavoriteAccount, number>;
  initPromise: Promise<void>;

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
    // Bump DB name to V4 so we can redefine the favorites schema with an auto-increment primary key.
    // This avoids the historical bug where `membershipId` was the primary key, which prevented
    // having multiple rows for the same membershipId (e.g., D1 vs D2) and triggered Dexie
    // ConstraintErrors.  Existing data will be recreated automatically on first use.
    super('DestinyChronicleDbV4');
    try {
      // Version 1: original schema
      this.version(1).stores({
        activities: '++id, membershipId, membershipType, characterId, period, instanceId, mode, validated, validatedAt, game, ' +
                   '[membershipId+characterId+instanceId], [membershipId+characterId+mode], [period+membershipId+characterId], ' +
                   '[game+membershipId+characterId]',
        favorites: '++id, compositeKey, membershipId, game, membershipType'
      });
      this.initPromise = this.init();
    } catch (error: any) {
      console.error('[Dexie] Error initializing ActivityDbService:', error);
      // Self-healing: if we hit a duplicate-index/ConstraintError, wipe the DB and reload
      const msg = error?.message || '';
      const isDuplicateIndex =
        error?.name === 'DatabaseClosedError' && /createIndex/i.test(msg) && /exists/i.test(msg);
      if (isDuplicateIndex) {
        console.warn('[Dexie] Duplicate index detected – deleting database and reloading');
        Dexie.delete('DestinyChronicleDbV3').catch((err) => {
          console.warn('[Dexie] Failed to delete DB via Dexie.delete:', err);
        }).finally(() => {
          // Give the deletion a tick, then reload the page.
          setTimeout(() => window.location.reload(), 100);
        });
      }
      throw error;
    }
  }

  private async init() {
    await this.open();
    this.activities = this.table('activities');
    this.favorites = this.table('favorites');
  }

  private isDuplicateActivity(a1: StoredActivity, a2: StoredActivity): boolean {
    return a1.membershipId === a2.membershipId &&
           a1.characterId === a2.characterId &&
           a1.activityDetails?.instanceId === a2.activityDetails?.instanceId;
  }

  async addActivities(activities: StoredActivity[]) {
    await this.initPromise;
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
    await this.initPromise;
    try {
      // Defensive check
      if (!membershipId || !characterId || !month || !day) {
        console.error('[Dexie] Invalid key for getActivitiesByDate:', { membershipId, characterId, month, day });
        return [];
      }

      // Use the compound index for much faster queries
      // The index [period+membershipId+characterId] allows us to do range queries efficiently
      const startOfDay = new Date((year ?? 2014), month - 1, day);
      const endOfDay = new Date((year ?? 2030), month - 1, day + 1);

      // Use Dexie's between() method which leverages the compound index
      const activities = await this.activities
        .where('[period+membershipId+characterId]')
        .between(
          [startOfDay.toISOString(), membershipId, characterId],
          [endOfDay.toISOString(), membershipId, characterId],
          true,
          false
        )
        .toArray();

      // Additional filtering to ensure exact date match (handles timezone edge cases)
      return activities.filter(activity => {
        if (!activity.period) return false;
        const activityDate = new Date(activity.period);
        const activityMonth = activityDate.getUTCMonth() + 1;
        const activityDay = activityDate.getUTCDate();
        const activityYear = activityDate.getUTCFullYear();

        if (year) {
          return activityMonth === month && activityDay === day && activityYear === year;
        }
        return activityMonth === month && activityDay === day;
      });
    } catch (error) {
      console.error('[Dexie] Error getting activities by date:', error);
      throw error;
    }
  }

  async getActivitiesByMode(membershipId: string, characterId: string, mode: number): Promise<StoredActivity[]> {
    await this.initPromise;
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
    await this.initPromise;
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
    await this.initPromise;
    try {
      // console.log(`[Dexie] Getting all activities for ${membershipId}/${characterId}`);
      const activities = await this.activities.where({ membershipId, characterId }).toArray();
      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting all activities:', error);
      throw error;
    }
  }

  /**
   * Gets activity metadata (counts, years) without loading full activity data.
   * This is more efficient when you only need summary information.
   */
  async getActivityMetadataForCharacter(membershipId: string, characterId: string): Promise<{
    totalCount: number;
    years: number[];
    yearsWithCounts: { [year: number]: number };
  }> {
    await this.initPromise;
    try {
      // Use a more efficient query that only gets the period field
      const activities = await this.activities
        .where({ membershipId, characterId })
        .toArray();
      
      const yearsWithCounts: { [year: number]: number } = {};
      let totalCount = 0;
      
      for (const activity of activities) {
        if (activity.period) {
          const year = new Date(activity.period).getUTCFullYear();
          yearsWithCounts[year] = (yearsWithCounts[year] || 0) + 1;
          totalCount++;
        }
      }
      
      const years = Object.keys(yearsWithCounts).map(Number).sort((a, b) => a - b);
      
      return {
        totalCount,
        years,
        yearsWithCounts
      };
    } catch (error) {
      console.error('[Dexie] Error getting activity metadata:', error);
      return { totalCount: 0, years: [], yearsWithCounts: {} };
    }
  }

  async clearAllActivities() {
    await this.initPromise;
    try {
      await this.activities.clear();
      // console.log('[Dexie] All activities cleared.');
    } catch (error) {
      console.error('[Dexie] Error clearing all activities:', error);
      throw error;
    }
  }

  async getActivityByInstanceId(instanceId: string): Promise<StoredActivity | undefined> {
    await this.initPromise;
    try {
      return await this.activities.where('instanceId').equals(instanceId).first();
    } catch (error) {
      console.error('[Dexie] Error getting activity by instance ID:', error);
      return undefined;
    }
  }

  async getUnvalidatedActivities(membershipId: string, characterId: string): Promise<StoredActivity[]> {
    await this.initPromise;
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
    await this.initPromise;
    // Fetch all stored activities for this membership/character
    const activities = await this.activities
      .where(['membershipId', 'characterId'])
      .equals([membershipId, characterId])
      .toArray();

    // Helpful debug for D1
    if (game === 'D1') {
      // debug removed
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

      let family = game === 'D2'
        ? ActivityDbService.ACTIVITY_FAMILY_MAP[activityHash]
        : ActivityDbService.D1_FAMILY_MAP[activityHash];
      if (!family) {
        // Fallback to manifest name when mapping is missing so dungeons/raids still render
        const name = this.manifest.getActivityName(activityHash, game === 'D1');
        if (!name) continue;
        family = name;
      }
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
    
    // Store activity for batch PGCR processing
    if ((game === 'D2' && (type === 'dungeon' || type === 'raid')) || 
        (game === 'D1' && type === 'raid')) {
      // We'll process PGCR data in batch after the loop to reduce individual API calls
      (activity as any).needsPgcrProcessing = true;
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
          membershipType: (activity as any).membershipType,
          characterClass: (activity as any).characterClass,
          completed,
          isSolo,
          isSoloFlawless
        };
      }
    }

    // Batch process PGCR data for all activities that need it
    await this.batchProcessPGCRData(firstsByFamily, membershipId, game);

    const firstCompletions: ActivityFirstCompletion[] = Object.values(firstsByFamily);
    // debug removed
    return {
      firstCompletions,
      membershipId,
      characterId,
      displayName: '', // This will be set by the component
      platform: '' // This will be set by the component
    };
  }

  async validateAllActivities() {
    await this.initPromise;
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
    await this.initPromise;
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
  private async storeActivities(activities: any[], membershipId: string, membershipType: number, characterId: string, game: 'D1' | 'D2'): Promise<void> {
    await this.initPromise;
    try {
      const activitiesToStore = activities.map(activity => ({
        ...activity,
        membershipId,
        membershipType,
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
    await this.initPromise;
    try {
      // Get the last stored activity date for this character
      const lastActivity = await this.getLastActivityDate(characterId);

      let activities: any[] = [];
      if (isD1) {
        // ---------------- Parallel D1 pagination ----------------
        const D1_MODES = [
          0,1,2,3,4,5,6,10,12,15,16,17,18,19,22,24,25,31,32,37,38,39,40,41,42,43,44,45,46,48,49,50,51,52,53
        ];
        const pageSize = 250;
        
        // Process all modes in parallel with concurrency control
        const concurrencyLimit = 5; // Limit concurrent requests to avoid rate limiting
        const modeChunks = this.chunkArray(D1_MODES, concurrencyLimit);
        
        for (const modeChunk of modeChunks) {
          const modePromises = modeChunk.map(async (mode) => {
            const modeActivities: any[] = [];
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
              modeActivities.push(...pageActs);

              // Continue while Bungie signals more (prefer Bungie's flag); fallback to page-size heuristic
              const bungieHasMore = resp?.hasMore === true;
              hasMore = bungieHasMore || pageActs.length === pageSize;
              page++;
            }
            
            return modeActivities;
          });
          
          // Wait for current chunk to complete before starting next chunk
          const chunkResults = await Promise.all(modePromises);
          activities.push(...chunkResults.flat());
        }
      } else {
        // Existing D2 activity fetching logic
        const response = await firstValueFrom(
          this.bungieService.getActivityHistory(membershipType, membershipId, characterId)
        );
        activities = (response as any).data.activities || [];
      }

      // Filter out activities we already have by instanceId (allows backfilling older pages)
      const existingForCharacter = await this.activities
        .where({ membershipId, characterId })
        .toArray();
      const existingInstanceIds = new Set(
        existingForCharacter
          .map(a => a.activityDetails?.instanceId)
          .filter((id): id is string => !!id)
      );
      const newActivities = activities.filter(activity => {
        const instanceId = activity?.activityDetails?.instanceId;
        return !!instanceId && !existingInstanceIds.has(instanceId);
      });

      if (newActivities.length > 0) {
        // Store new activities
        await this.storeActivities(newActivities, membershipId, membershipType, characterId, isD1 ? 'D1' : 'D2');
      }
    } catch (error) {
      console.error('[DEBUG] Error in fetchAndStoreActivities:', error);
      throw error;
    }
  }

  // Helper method to chunk array for concurrency control
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Helper to generate a composite key for a favorite account
  private getFavoriteKey(account: FavoriteAccount): string {
    return `${account.membershipId}|${account.game}|${account.membershipType}`;
  }

  async addFavorite(account: FavoriteAccount) {
    await this.initPromise;
    // Deduplicate in app logic using the composite key
    const allFavorites = await this.favorites.toArray();
    const exists = allFavorites.some(fav => this.getFavoriteKey(fav) === this.getFavoriteKey(account));
    if (!exists) {
      await this.favorites.add(account);
    } else {
      await this.favorites.put(account); // Update if already exists
    }
  }

  async removeFavorite(membershipId: string, game: 'D1' | 'D2', membershipType?: number) {
    await this.initPromise;
    if (membershipType !== undefined) {
      // Remove specific platform account
      await this.favorites.where({ membershipId, game, membershipType }).delete();
    } else {
      // Remove all accounts for this membershipId and game (backward compatibility)
      await this.favorites.where({ membershipId, game }).delete();
    }
  }

  async getFavorites(): Promise<FavoriteAccount[]> {
    await this.initPromise;
    return this.favorites.toArray();
  }

  async getActivitiesByGame(membershipId: string, characterId: string, game: 'D1' | 'D2'): Promise<StoredActivity[]> {
    await this.initPromise;
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
    await this.initPromise;
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
    await this.initPromise;
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
   * Batch processes PGCR data for multiple activities to reduce individual API calls.
   * This method processes all activities that need PGCR data in parallel.
   */
  private async batchProcessPGCRData(
    firstsByFamily: { [family: string]: ActivityFirstCompletion }, 
    membershipId: string, 
    game: 'D1' | 'D2'
  ): Promise<void> {
    const activitiesNeedingPgcr = Object.values(firstsByFamily).filter(f => (f as any).needsPgcrProcessing);
    
    if (activitiesNeedingPgcr.length === 0) return;

    // Get all instance IDs that need PGCR processing
    const instanceIds = activitiesNeedingPgcr.map(f => f.instanceId).filter(id => !!id);
    
    if (instanceIds.length === 0) return;

    try {
      // First, try to get all PGCRs from cache in batch
      const cachedPgcrMap = await this.pgcrCacheService.getBatch(instanceIds);
      
      // Process cached PGCRs
      for (const first of activitiesNeedingPgcr) {
        if (!first.instanceId) continue;
        
        const pgcr = cachedPgcrMap.get(first.instanceId);
        if (pgcr) {
          this.processPGCRData(first, pgcr, game, membershipId);
        }
      }
      
      // Check which PGCRs are missing from cache
      const missingIds = await this.pgcrCacheService.getMissingPGCRs(instanceIds);
      
      if (missingIds.length > 0) {
        // Fetch missing PGCRs from API in batch
        const missingPgcrData = await this.fetchMissingPGCRs(missingIds, game);
        
        // Process the newly fetched PGCRs
        for (const first of activitiesNeedingPgcr) {
          if (!first.instanceId || !missingPgcrData.has(first.instanceId)) continue;
          
          const pgcr = missingPgcrData.get(first.instanceId);
          if (pgcr) {
            this.processPGCRData(first, pgcr, game, membershipId);
          }
        }
      }
    } catch (error) {
      console.warn('[PGCR] Batch processing failed, falling back to individual processing:', error);
      // Fallback to individual processing if batch fails
      await this.fallbackToIndividualPGCRProcessing(activitiesNeedingPgcr, game, membershipId);
    }
  }

  /**
   * Fetches missing PGCRs from the Bungie API in batch.
   */
  private async fetchMissingPGCRs(instanceIds: string[], game: 'D1' | 'D2'): Promise<Map<string, any>> {
    try {
      const response = game === 'D2' 
        ? await firstValueFrom(this.bungieService.getD2PGCRBatch(instanceIds))
        : await firstValueFrom(this.bungieService.getD1PGCRBatch(instanceIds));
      
      const result = new Map<string, any>();
      for (let i = 0; i < instanceIds.length && i < response.length; i++) {
        if (response[i]) {
          result.set(instanceIds[i], response[i]);
        }
      }
      
      // Cache the newly fetched PGCRs
      const pgcrData = instanceIds.map((id, index) => ({
        id,
        data: response[index],
        requestedMemberId: undefined
      })).filter(item => item.data);
      
      if (pgcrData.length > 0) {
        await this.pgcrCacheService.setBatch(pgcrData);
      }
      
      return result;
    } catch (error) {
      console.error('[PGCR] Failed to fetch missing PGCRs:', error);
      return new Map();
    }
  }

  /**
   * Processes PGCR data for a single activity.
   */
  private processPGCRData(first: ActivityFirstCompletion, pgcr: any, game: 'D1' | 'D2', membershipId: string): void {
    // For D2 dungeons, check solo and flawless status
    if (game === 'D2' && first.type === 'dungeon') {
      const uniquePlayers = new Set(pgcr.entries.map((e: any) => e.player.destinyUserInfo.membershipId));
      (first as any).isSolo = uniquePlayers.size === 1;
      
      if ((first as any).isSolo) {
        (first as any).isSoloFlawless = pgcr.entries.every((e: any) => e.values.deaths.basic.value === 0);
      }
    }
    
    // Attach class and membershipType for per-character view
    const me = pgcr.entries.find((e: any) => e.player.destinyUserInfo.membershipId === membershipId);
    if (me) {
      (first as any).characterClass = me.player.characterClass;
      (first as any).membershipType = me.player.destinyUserInfo.membershipType;
    }
  }

  /**
   * Fallback method for individual PGCR processing if batch processing fails.
   */
  private async fallbackToIndividualPGCRProcessing(
    activitiesNeedingPgcr: ActivityFirstCompletion[], 
    game: 'D1' | 'D2', 
    membershipId: string
  ): Promise<void> {
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(activitiesNeedingPgcr, concurrencyLimit);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (first) => {
        try {
          const pgcr: any = game === 'D2' 
            ? await this.pgcrCacheService.getD2PGCR(first.instanceId)
            : await this.pgcrCacheService.getD1PGCR(first.instanceId);
            
          if (pgcr) {
            this.processPGCRData(first, pgcr, game, membershipId);
          }
        } catch (error) {
          console.warn(`[PGCR] Failed to process PGCR for ${first.name}:`, error);
        }
      });
      
      await Promise.all(promises);
    }
  }

  /**
   * Returns the first solo and solo-flawless dungeon completions per dungeon family
   * for the specified Destiny 2 account (all characters).
   *
   * This method performs an in-memory scan—no extra API calls.
   */
  async getDungeonSoloFirsts(membershipId: string): Promise<DungeonSoloFirst[]> {
    await this.initPromise;
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
    await this.initPromise;
    if (!membershipIds?.length) return 0;
    return this.activities.where('membershipId').anyOf(membershipIds).count();
  }

  /**
   * Returns all activities played on the specified platform (membershipType).
   * 1 = Xbox, 2 = PlayStation, 3 = Steam, 4 = Blizzard, 5 = Stadia, 6 = Epic
   */
  async getActivitiesByPlatform(membershipType: number): Promise<StoredActivity[]> {
    await this.initPromise;
    return this.activities.where('membershipType').equals(membershipType).toArray();
  }

  /**
   * Returns a paginated list of activities for a player (most recent first).
   */
  async getPlayerActivitiesPaginated(
    membershipId: string,
    offset: number = 0,
    limit: number = 50
  ): Promise<StoredActivity[]> {
    await this.initPromise;
    return this.activities
      .where('membershipId')
      .equals(membershipId)
      .reverse() // Most recent first
      .offset(offset)
      .limit(limit)
      .toArray();
  }

  /**
   * Gets activities for a specific character with pagination and optional filtering.
   * More efficient than loading all activities when you only need a subset.
   */
  async getCharacterActivitiesPaginated(
    membershipId: string,
    characterId: string,
    offset: number = 0,
    limit: number = 50,
    game?: 'D1' | 'D2'
  ): Promise<StoredActivity[]> {
    await this.initPromise;
    try {
      let query = this.activities
        .where({ membershipId, characterId })
        .reverse() // Most recent first
        .offset(offset)
        .limit(limit);

      // Apply game filter if specified
      if (game) {
        query = query.filter(activity => activity.game === game);
      }

      return await query.toArray();
    } catch (error) {
      console.error('[Dexie] Error getting character activities paginated:', error);
      return [];
    }
  }

  /**
   * Returns activities for a player within a date range.
   */
  async getActivitiesInDateRange(
    membershipId: string,
    startDate: Date,
    endDate: Date
  ): Promise<StoredActivity[]> {
    await this.initPromise;
    const startPeriod = startDate.toISOString();
    const endPeriod = endDate.toISOString();
    return this.activities
      .where('period')
      .between(startPeriod, endPeriod, true, true)
      .and(activity => activity.membershipId === membershipId)
      .toArray();
  }
} 