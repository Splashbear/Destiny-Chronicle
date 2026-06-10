import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { ActivityHistory } from '../models/activity-history.model';
import { RAID_NAMES, GuardianFirsts, ActivityFirstCompletion } from '../models/guardian-firsts.model';
import {
  STORY_RELEASE_ANCHORS,
  buildStoryHashToAnchorMap,
  buildStoryLabelToAnchorMap,
  type StoryReleaseAnchor,
} from '../config/story-first-missions';
import { DestinyManifestService } from './destiny-manifest.service';
import { BungieApiService } from './bungie-api.service';
import { firstValueFrom } from 'rxjs';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Activity } from '../models/activity.model';
import { PGCRCacheService } from './pgcr-cache.service';
import { DungeonSoloFirst } from '../models/dungeon-solo-first.model';
import { environment } from '../../environments/environment';

// Phase 3: Memory Management & Caching Optimization
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
}

// Enhanced caching interface with TTL support
interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface LRUCache<T> {
  maxSize: number;
  data: Map<string, CacheEntry<T>>;
}

// Minimal PGCR shape used by PGCR processing logic. This allows future backends
// (for example, a preprocessed PGCR database) to supply a compatible structure.
interface PgcrLiteEntry {
  player?: {
    destinyUserInfo?: {
      membershipId?: string;
      membershipType?: number;
    };
    characterClass?: string;
  };
  characterId?: string;
  values?: {
    deaths?: {
      basic?: {
        value?: number;
      };
    };
  };
}

interface PgcrLitePlayer {
  id?: string;
  deaths?: number;
  charId?: string;
}

interface PgcrLite {
  activityDetails?: {
    period?: string;
  };
  entries?: PgcrLiteEntry[];
  players?: PgcrLitePlayer[];
}

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

  // Phase 3: Memory Management & Caching Optimization
  private readonly MAX_CACHE_SIZE = 1000; // Maximum number of cached items
  private readonly CACHE_TTL = {
    activities: 24 * 60 * 60 * 1000, // 24 hours for activities
    manifest: 7 * 24 * 60 * 60 * 1000, // 7 days for manifest
    playerData: 6 * 60 * 60 * 1000, // 6 hours for player data
    guardianFirsts: 12 * 60 * 60 * 1000, // 12 hours for guardian firsts
    dungeonFirsts: 12 * 60 * 60 * 1000 // 12 hours for dungeon firsts
  };
  private readonly MEMORY_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes cleanup interval
  
  // Enhanced LRU caches with TTL support
  private activitiesCache: LRUCache<StoredActivity[]> = { maxSize: 200, data: new Map() };
  private filteredActivitiesCache: LRUCache<StoredActivity[]> = { maxSize: 100, data: new Map() };
  private firstEverActivities: LRUCache<ActivityFirstCompletion> = { maxSize: 50, data: new Map() };
  private wastedTimes: LRUCache<any[]> = { maxSize: 50, data: new Map() };
  private wastedSeals: LRUCache<any[]> = { maxSize: 50, data: new Map() };
  private guardianFirstsCache: LRUCache<ActivityFirstCompletion[]> = { maxSize: 100, data: new Map() };
  private dungeonFirstsCache: LRUCache<DungeonSoloFirst[]> = { maxSize: 100, data: new Map() };
  
  private lastCleanup = Date.now();
  private cleanupTimer?: any;

  /** Exposed so the UI can show progress while D1 PGCR prefetch runs in the background. */
  public readonly pgcrPrefetchProgress$ = new BehaviorSubject<{ inProgress: boolean; current: number; total: number }>({ inProgress: false, current: 0, total: 0 });
  private pgcrPrefetchRunCount = 0;

  // Canonical mapping for all D2 and D1 raids/dungeons (2024, expand as needed)
  private static readonly ACTIVITY_FAMILY_MAP: Record<string, string> = {
    // --- Destiny 2 Raids ---
    // Leviathan - Multiple versions
    '89727599': 'Leviathan: Normal',
    '287649202': 'Leviathan: Normal',
    '417231112': 'Leviathan: Normal',
    '508802457': 'Leviathan: Normal',
    '757116822': 'Leviathan: Normal',
    '771164842': 'Leviathan: Normal',
    '1685065161': 'Leviathan: Normal',
    '1699948563': 'Leviathan: Normal',
    '1800508819': 'Leviathan: Normal',
    '1875726950': 'Leviathan: Normal',
    '2693136600': 'Leviathan: Normal',
    '2693136601': 'Leviathan: Normal',
    '2693136602': 'Leviathan: Normal',
    '2693136603': 'Leviathan: Normal',
    '2693136604': 'Leviathan: Normal',
    '2693136605': 'Leviathan: Normal',
    '3916343513': 'Leviathan: Normal',
    '4039317196': 'Leviathan: Normal',
    '2449714930': 'Leviathan: Normal',
    '3857338478': 'Leviathan: Normal',
    '3446541099': 'Leviathan: Normal',
    // Leviathan, Eater of Worlds - Multiple versions
    '2164432138': 'Leviathan, Eater of Worlds: Normal',
    '809170886': 'Leviathan, Eater of Worlds: Prestige',
    '3089205900': 'Leviathan, Eater of Worlds: Prestige',
    // Crown of Sorrow - Multiple versions
    '3333172150': 'Crown of Sorrow: Normal',
    '960175301': 'Crown of Sorrow: Normal',
    // Leviathan, Spire of Stars - Multiple versions
    '119944200': 'Leviathan, Spire of Stars: Normal',
    '3004605630': 'Leviathan, Spire of Stars: Normal',
    '3213556450': 'Leviathan, Spire of Stars: Prestige',
    // Garden of Salvation - Multiple versions
    '1042180643': 'Garden of Salvation: Normal',
    '2497200493': 'Garden of Salvation: Normal',
    '3458480158': 'Garden of Salvation: Normal',
    '3845997235': 'Garden of Salvation: Normal',
    '2659723068': 'Garden of Salvation: Normal',
    // Deep Stone Crypt - Multiple versions
    '910380154': 'Deep Stone Crypt: Normal',
    '3976949817': 'Deep Stone Crypt: Normal',
    // Scourge of the Past - Multiple versions
    '548750096': 'Scourge of the Past: Normal',
    '2812525063': 'Scourge of the Past: Normal',
    // Root of Nightmares - Multiple versions
    '2381413764': 'Root of Nightmares: Normal',
    '2918919505': 'Root of Nightmares: Master',
    // Vow of the Disciple - Multiple versions
    '1441982566': 'Vow of the Disciple: Standard',
    '4156879541': 'Vow of the Disciple: Legend',
    '3889634515': 'Vow of the Disciple: Master',
    // Last Wish - Multiple versions
    '2122313384': 'Last Wish: Standard',
    '1661734046': 'Last Wish: Normal',
    // Vault of Glass - Multiple versions
    '3711931140': 'Vault of Glass: Normal',
    '1485585878': 'Vault of Glass: Normal',
    '1681562271': 'Vault of Glass: Master',
    '3022541210': 'Vault of Glass: Normal',
    '3881495763': 'Vault of Glass: Standard',
    // King's Fall - Multiple versions
    '1374392663': "King's Fall: Standard",
    '2897223272': "King's Fall: Normal",
    '3257594522': "King's Fall: Master",
    '2964135793': "King's Fall: Master",
    '1063970578': "King's Fall: Expert",
    // Crota's End - Multiple versions
    '107319834': "Crota's End: Standard",
    '4179289725': "Crota's End: Normal",
    '1507509200': "Crota's End: Master",
    '1566480315': "Crota's End: Standard",
    '156253568': "Crota's End: Legend",
    // Salvation's Edge - Multiple versions
    '1541433876': "Salvation's Edge: Standard",
    '940375169': "Salvation's Edge: Standard",
    '4129614942': "Salvation's Edge: Master",
    // --- Legacy Pantheon (2024) ---
    '4169648176': 'The Pantheon: Oryx Exalted',
    '4169648177': 'The Pantheon: Rhulk Indomitable',
    '4169648179': 'The Pantheon: Atraks Sovereign',
    '4169648182': 'The Pantheon: Nezarec Sublime',
    // --- Monument of Triumph Pantheon 2.0 (2026+) ---
    '2530656885': 'Pantheon: Morgeth Surpassing',
    '1516551982': 'Pantheon: Calus Resplendent',
    // --- Destiny 2 Dungeons ---
    // The Shattered Throne - Single version
    '2032534090': 'The Shattered Throne: Standard',
    '1347078175': 'The Shattered Throne: Standard',
    // Pit of Heresy - Multiple versions
    '1375089621': 'Pit of Heresy: Normal',
    '785700673': 'Pit of Heresy: Master',
    '785700678': 'Pit of Heresy: Expert',
    '2559374368': 'Pit of Heresy: Legend',
    '2559374374': 'Pit of Heresy: Master',
    '2559374375': 'Pit of Heresy: Master',
    '2582501063': 'Pit of Heresy: Standard',
    // Grasp of Avarice - Multiple versions
    '1112917203': 'Grasp of Avarice: Standard',
    '4078656646': 'Grasp of Avarice: Master',
    // Prophecy - Multiple versions
    '1077850348': 'Prophecy: Normal',
    '3637651331': 'Prophecy: Explorer', // Updated hash
    '2961030534': 'Prophecy: Eternity',
    '3193152350': 'Prophecy: Ultimatum',
    '4148187374': 'Prophecy: Master',
    // Duality - Multiple versions
    '2823159265': 'Duality: Standard',
    '3012587626': 'Duality: Master',
    // Spire of the Watcher - Multiple versions
    '1262462921': 'Spire of the Watcher: Standard',
    '1225969316': 'Spire of the Watcher: Explorer',
    '4046934917': 'Spire of the Watcher: Eternity',
    '3339002067': 'Spire of the Watcher: Ultimatum',
    '2296818662': 'Spire of the Watcher: Master',
    '1801496203': 'Spire of the Watcher: Master',
    // Ghosts of the Deep - Multiple versions
    '313828469': 'Ghosts of the Deep: Normal',
    '1094262727': 'Ghosts of the Deep: Explorer',
    '32961030534': 'Ghosts of the Deep: Eternity',
    '124340010': 'Ghosts of the Deep: Ultimatum',
    '2716998124': 'Ghosts of the Deep: Master',
    // Warlord's Ruin - Multiple versions
    '2004855007': "Warlord's Ruin: Standard",
    '2534833093': "Warlord's Ruin: Master",
    // Vesper's Host - Multiple versions
      '300092127': "Vesper's Host: Normal", 
      '4293676253': "Vesper's Host: Master",
    // Sundered Doctrine - Multiple versions
    '3834447244': "Sundered Doctrine: Normal",
    '3521648250': "Sundered Doctrine: Master",
    // Equilibrium - Multiple versions
    '1754635208': "Equilibrium: Contest", // Contest mode hash
    // TODO: Add Equilibrium Normal and Master hashes when discovered
    // --- Destiny 2 Raids (continued) ---
    // Desert Perpetual - Multiple versions
    '1044919065': "The Desert Perpetual: Standard", // Standard mode
    '3896382790': "The Desert Perpetual: Contest", // Standard contest mode hash
    '3817322389': "The Desert Perpetual: Epic", // Epic mode
    '2586252122': "The Desert Perpetual (Epic): Contest", // Epic contest mode hash
    // --- Destiny 1 Raids ---
    '3801607287': 'Vault of Glass',
    '708693006': 'Vault of Glass',
    '898834093': "Crota's End",
    '1733556769': "King's Fall",
    '421023204': "King's Fall",
    '2578867903': 'Wrath of the Machine',
    '4007500989': 'Wrath of the Machine',
  };

  /**
   * Coerce D1 activity hash strings to unsigned 32-bit form so map lookups match config/manifest keys
   * (some pipelines store signed ints, e.g. -123456 → different string than "4284511840").
   */
  private static normalizeD1ActivityHashKey(ref: string): string {
    const t = ref.trim();
    if (!t) return t;
    const n = Number(t);
    if (!Number.isFinite(n)) return t;
    return (n >>> 0).toString();
  }

  /**
   * Same reference resolution for story milestones and first-completions loops:
   * Bungie may expose `referenceId`, `activityHash`, or only one nested under `activityDetails`.
   */
  static normalizeHistoryReferenceKeyForStory(activity: any, game: 'D1' | 'D2'): string {
    const raw =
      activity?.activityDetails?.referenceId ??
      activity?.activityDetails?.directorActivityHash ??
      activity?.activityDetails?.activityHash ??
      activity?.activityDetails?.activityId ??
      activity?.referenceId ??
      activity?.activityHash ??
      activity?.directorActivityHash ??
      activity?.activityId ??
      activity?.definition?.activityHash ??
      '';
    if (raw == null || raw === '') return '';
    const s = String(raw).trim();
    if (!s || s === 'undefined') return '';
    return game === 'D1' ? ActivityDbService.normalizeD1ActivityHashKey(s) : s;
  }

  /**
   * Bungie activity history uses `values.completed.basic.value === 1`, but D1 (and some stored rows)
   * may use a bare number/boolean or `completed.value` without `basic`. Read all common shapes.
   */
  static readHistoryCompletedRaw(activity: any): unknown {
    const c = activity?.values?.completed;
    if (c === undefined || c === null) return undefined;
    if (typeof c === 'boolean' || typeof c === 'number') return c;
    if (typeof c === 'string') return c;
    if (typeof c === 'object') {
      const basic = (c as any).basic;
      if (basic && typeof basic === 'object' && 'value' in basic) return basic.value;
      if ('value' in (c as any)) return (c as any).value;
    }
    return undefined;
  }

  /** True when history row represents a finished activity (clear). */
  static isHistoryActivityClear(activity: any): boolean {
    const raw = ActivityDbService.readHistoryCompletedRaw(activity);
    return raw === true || Number(raw) === 1 || String(raw) === '1';
  }

  /**
   * Story “firsts” for D1: Bungie often omits `values.completed` on Activity History rows even when the row
   * has a real PGCR `instanceId` (a finished play). Treat missing completion + present instance as cleared.
   * D2 keeps strict `values.completed` checks.
   */
  private static isHistoryRowClearForStoryMilestone(activity: any, game: 'D1' | 'D2'): boolean {
    if (ActivityDbService.isHistoryActivityClear(activity)) {
      return true;
    }
    if (game !== 'D1') {
      return false;
    }
    const raw = ActivityDbService.readHistoryCompletedRaw(activity);
    if (raw !== undefined && raw !== null) {
      return false;
    }
    const inst = ActivityDbService.resolveStoredActivityInstanceId(activity);
    return !!inst && inst !== '0';
  }

  /** Bungie history rows sometimes keep instance id only on the root `StoredActivity` field. */
  static resolveStoredActivityInstanceId(activity: StoredActivity): string {
    const fromDetails = activity.activityDetails?.instanceId;
    if (fromDetails != null) {
      const t = String(fromDetails).trim();
      if (t !== '' && t !== '0') return t;
    }
    const root = (activity as any).instanceId;
    if (root != null) {
      const t = String(root).trim();
      if (t !== '' && t !== '0') return t;
    }
    const aid = (activity as any).activityId;
    if (aid != null) {
      const t = String(aid).trim();
      if (t !== '' && t !== '0') return t;
    }
    return '';
  }

  /**
   * When hash isn't in STORY_RELEASE_ANCHORS, match manifest display name to anchor label
   * (handles "Mission: Foo", "Foo (Heroic)", signed/unsigned hash mismatches in defs).
   */
  private matchStoryAnchorByManifestLabel(
    actName: string,
    labelMap: Map<string, StoryReleaseAnchor>
  ): StoryReleaseAnchor | undefined {
    const trimmed = actName.trim();
    if (!trimmed || trimmed === 'Unknown Activity') return undefined;
    const lower = trimmed.toLowerCase();
    const direct = labelMap.get(lower);
    if (direct) return direct;

    const entries = [...labelMap.entries()].sort((a, b) => b[0].length - a[0].length);

    // "Mission: The Coming War" / "Story: A Guardian Rises" — mission title is usually AFTER the first colon.
    if (lower.includes(': ')) {
      const afterColon = lower.split(': ').slice(1).join(': ').trim();
      if (afterColon) {
        const afterDirect = labelMap.get(afterColon);
        if (afterDirect) return afterDirect;
        for (const [lbl, anchor] of entries) {
          if (
            afterColon === lbl ||
            afterColon.startsWith(lbl + ' ') ||
            afterColon.startsWith(lbl + '(')
          ) {
            return anchor;
          }
        }
      }
    }

    const base = lower.includes(': ') ? lower.split(': ')[0].trim() : lower;
    const baseDirect = labelMap.get(base);
    if (baseDirect) return baseDirect;
    for (const [lbl, anchor] of entries) {
      if (base === lbl || base.startsWith(lbl + ' ') || base.startsWith(lbl + '(')) {
        return anchor;
      }
    }
    return undefined;
  }

  // Add D1 family map
  private static readonly D1_FAMILY_MAP: Record<string, string> = {
    // Vault of Glass (all variants map to base name)
    '3801607287': 'Vault of Glass',
    '708693006': 'Vault of Glass',
    '2659248071': 'Vault of Glass',
    '2659248068': 'Vault of Glass',
    '2659248069': 'Vault of Glass',
    '856898338': 'Vault of Glass',
    '4038697181': 'Vault of Glass',

    // Crota's End (all variants map to base name)
    '898834093': "Crota's End",
    '112157962': "Crota's End",
    '1836893116': "Crota's End",
    '1836893119': "Crota's End",
    '2324706853': "Crota's End",
    '4000873610': "Crota's End",

    // King's Fall (all variants map to base name)
    '1733556769': "King's Fall",
    '3534581229': "King's Fall",
    '1016659723': "King's Fall",
    '3978884648': "King's Fall",

    // Wrath of the Machine (all variants map to base name)
    '2578867903': 'Wrath of the Machine',
    '4007500989': 'Wrath of the Machine',
    '1099433614': 'Wrath of the Machine',
    '1342567280': 'Wrath of the Machine',
    '260765522': 'Wrath of the Machine',
    '1387993552': 'Wrath of the Machine', // Hard (380) by PGCR verification
    '430160982': 'Wrath of the Machine',
    '3356249023': 'Wrath of the Machine',
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

  /**
   * Get all activities for a membership across ALL characters for a given month/day (and optional year)
   * This avoids relying on UI character state when exporting.
   */
  async getActivitiesByDateForMembership(
    membershipId: string,
    month: number,
    day: number,
    year?: number
  ): Promise<StoredActivity[]> {
    await this.initPromise;
    try {
      if (!membershipId || !month || !day) {
        console.error('[Dexie] Invalid key for getActivitiesByDateForMembership:', { membershipId, month, day });
        return [];
      }
      // Query by membershipId, then filter by date
      const activities = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .toArray();

      return activities.filter(activity => {
        if (!activity.period) return false;
        const d = new Date(activity.period);
        const m = d.getUTCMonth() + 1;
        const dy = d.getUTCDate();
        const y = d.getUTCFullYear();
        if (year) {
          return m === month && dy === day && y === year;
        }
        return m === month && dy === day;
      });
    } catch (error) {
      console.error('[Dexie] Error in getActivitiesByDateForMembership:', error);
      return [];
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

  /**
   * Clear all activities for a specific membership (all characters)
   * This is useful when switching between different users
   */
  async clearActivitiesForMembership(membershipId: string) {
    await this.initPromise;
    try {
      if (environment.debug) {
        console.log(`[CLEAR] Clearing all activities for membership ${membershipId}`);
      }

      // First, count how many activities exist for this membership
      const beforeCount = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .count();

      // Delete all activities for this membership
      const deletedCount = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .delete();

      // Verify the deletion worked
      const afterCount = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .count();

      if (environment.debug) {
        console.log(
          `[CLEAR] membership ${membershipId}: before=${beforeCount} deleted=${deletedCount} after=${afterCount}`
        );
      }
      
      if (afterCount > 0) {
        console.warn(`[CLEAR] WARNING: ${afterCount} activities still exist for membership ${membershipId} after clearing!`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('[CLEAR] Error clearing activities for membership:', error);
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

  /**
   * Check if a player has any stored activities in the database
   * This is used to suggest favoriting accounts that have data
   */
  async hasStoredActivities(membershipId: string): Promise<boolean> {
    await this.initPromise;
    try {
      const count = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .count();
      return count > 0;
    } catch (error) {
      console.error('[Dexie] Error checking for stored activities:', error);
      return false;
    }
  }

  /**
   * Get all activities for a membership across all characters
   * This is used for smart data prioritization to show cached data immediately
   */
  async getAllActivitiesForMembership(membershipId: string): Promise<StoredActivity[]> {
    await this.initPromise;
    try {
      const activities = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .toArray();
      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting all activities for membership:', error);
      return [];
    }
  }

  /**
   * Check if data for a membership needs updating based on freshness
   * This helps determine if we should show cached data or fetch fresh data
   */
  async needsDataUpdate(membershipId: string, maxAgeHours: number = 24): Promise<boolean> {
    await this.initPromise;
    try {
      // Check memory cache first for faster response
      const cacheKey = `${membershipId}_freshness`;
      const cached = this.getFromCache(this.activitiesCache, cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        const mostRecent = cached[0];
        const lastActivityDate = new Date(mostRecent.period);
        const cutoffDate = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
        return lastActivityDate < cutoffDate;
      }

      // Fallback to database query
      const activities = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .reverse() // Most recent first
        .limit(1) // Only need the most recent
        .toArray();
      
      if (activities.length === 0) {
        return true; // No data, needs update
      }
      
      const mostRecent = activities[0];
      
      // Check if the most recent activity is older than maxAgeHours
      const lastActivityDate = new Date(mostRecent.period);
      const cutoffDate = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
      
      return lastActivityDate < cutoffDate;
    } catch (error) {
      console.error('[Dexie] Error checking data freshness:', error);
      return true; // Assume needs update on error
    }
  }

  /**
   * Optimized method to get activities with instant memory cache fallback
   */
  async getAllActivitiesForMembershipOptimized(membershipId: string): Promise<StoredActivity[]> {
    await this.initPromise;
    
    // Check memory cache first for instant response
    const cacheKey = `${membershipId}_all`;
    const cached = this.getFromCache(this.activitiesCache, cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      if (environment.debug) {
        console.log(`Cache hit for ${membershipId}: ${cached.length} activities`);
      }
      return cached;
    }

    try {
      // Query database if not in memory cache
      const activities = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .toArray();
      
      // Sort by period (most recent first) for consistent ordering
      const sortedActivities = activities.sort((a, b) => 
        new Date(b.period).getTime() - new Date(a.period).getTime()
      );

      // Cache in memory for next access
      this.setInCache(this.activitiesCache, cacheKey, sortedActivities);

      if (environment.debug) {
        console.log(`Database query for ${membershipId}: ${sortedActivities.length} activities`);
      }
      return sortedActivities;
      
    } catch (error) {
      console.error('[Dexie] Error retrieving activities for membership:', error);
      return [];
    }
  }

  /**
   * Preload favorite accounts' data into memory cache for instant access
   */
  async preloadFavoritesCache(): Promise<void> {
    try {
      const favorites = await this.getFavorites();
      if (environment.debug) {
        console.log(`Preloading cache for ${favorites.length} favorite accounts...`);
      }

      const preloadPromises = favorites.map(async (favorite) => {
        // Preload activities into memory cache
        await this.getAllActivitiesForMembershipOptimized(favorite.membershipId);
        
        // Preload freshness check
        await this.needsDataUpdate(favorite.membershipId, 6); // 6 hour threshold for favorites
      });
      
      await Promise.allSettled(preloadPromises);
      if (environment.debug) {
        console.log('Favorites cache preloading completed');
      }
    } catch (error) {
      console.error('Error preloading favorites cache:', error);
    }
  }

  /**
   * Get the timestamp of the most recent activity for a membership
   * This helps determine data freshness for smart loading decisions
   */
  async getLastActivityTimestamp(membershipId: string): Promise<Date | null> {
    await this.initPromise;
    try {
      const activities = await this.activities
        .where('membershipId')
        .equals(membershipId)
        .toArray();
      
      if (activities.length === 0) {
        return null;
      }
      
      // Sort by period (most recent first) and get the first one
      const sortedActivities = activities.sort((a, b) => 
        new Date(b.period).getTime() - new Date(a.period).getTime()
      );
      const mostRecent = sortedActivities[0];
      
      return new Date(mostRecent.period);
    } catch (error) {
      console.error('[Dexie] Error getting last activity timestamp:', error);
      return null;
    }
  }

  async clearAllActivities() {
    await this.initPromise;
    try {
      const beforeCount = await this.activities.count();

      await this.activities.clear();

      const afterCount = await this.activities.count();

      if (environment.debug) {
        console.log(`[CLEAR] All activities: before=${beforeCount} after=${afterCount}`);
      }

      if (afterCount > 0) {
        console.warn(`[CLEAR] WARNING: ${afterCount} activities still exist after clearing all!`);
      }
    } catch (error) {
      console.error('[CLEAR] Error clearing all activities:', error);
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

  /**
   * All stored rows whose `activityDetails.activityTypeHashOverride` matches (string compare).
   * Note: D1 “Story” **type** is often `1686739444` for many missions — this is not the same as `referenceId`
   * (activity definition hash).
   */
  async findActivitiesByActivityTypeHashOverride(hash: string | number): Promise<StoredActivity[]> {
    await this.initPromise;
    const want = String(hash);
    return this.activities
      .filter(
        (a) =>
          String((a as any).activityDetails?.activityTypeHashOverride ?? '') === want
      )
      .toArray();
  }

  /** Dexie auto-increment primary keys (stable row identity in IndexedDB). */
  async getActivitiesByPrimaryKeys(ids: number[]): Promise<StoredActivity[]> {
    await this.initPromise;
    const out: StoredActivity[] = [];
    for (const id of ids) {
      if (!Number.isFinite(id)) continue;
      const row = await this.activities.get(id);
      if (row) {
        out.push(row);
      }
    }
    return out;
  }

  /**
   * Resolve by indexed `instanceId` and by `activityDetails.instanceId` / root copy (deduped by Dexie `id`).
   */
  async findActivitiesByInstanceIds(instanceIds: string[]): Promise<StoredActivity[]> {
    await this.initPromise;
    const set = new Set(instanceIds.map((s) => String(s)));
    const byPk = new Map<number, StoredActivity>();
    for (const id of set) {
      const row = await this.getActivityByInstanceId(id);
      if (row != null && (row as any).id != null) {
        byPk.set((row as any).id as number, row);
      }
    }
    const detailMatches = await this.activities
      .filter((a) => {
        const resolved = ActivityDbService.resolveStoredActivityInstanceId(a);
        return !!resolved && set.has(resolved);
      })
      .toArray();
    for (const a of detailMatches) {
      const pk = (a as any).id as number | undefined;
      if (pk != null) {
        byPk.set(pk, a);
      }
    }
    return [...byPk.values()];
  }

  /**
   * One-shot inspection payload (no logging). Call from any code path that has `ActivityDbService` injected,
   * e.g. a temporary button handler: `await this.activityDb.inspectActivitiesSnapshot({ ... })`.
   */
  async inspectActivitiesSnapshot(params: {
    activityTypeHashOverride?: string | number;
    highlightInstanceIds?: string[];
    highlightPrimaryKeys?: number[];
  }): Promise<{
    matchingActivityTypeHashOverride: StoredActivity[];
    highlights: {
      byInstanceId: Record<string, StoredActivity | undefined>;
      byPrimaryKey: Record<number, StoredActivity | undefined>;
    };
  }> {
    const { activityTypeHashOverride, highlightInstanceIds = [], highlightPrimaryKeys = [] } = params;
    const matchingActivityTypeHashOverride =
      activityTypeHashOverride != null
        ? await this.findActivitiesByActivityTypeHashOverride(activityTypeHashOverride)
        : [];
    const byInstanceId: Record<string, StoredActivity | undefined> = {};
    if (highlightInstanceIds.length > 0) {
      const rows = await this.findActivitiesByInstanceIds(highlightInstanceIds.map(String));
      for (const row of rows) {
        const iid = ActivityDbService.resolveStoredActivityInstanceId(row);
        if (iid) {
          byInstanceId[iid] = row;
        }
      }
    }
    const byPrimaryKey: Record<number, StoredActivity | undefined> = {};
    for (const pk of highlightPrimaryKeys) {
      if (!Number.isFinite(pk)) continue;
      byPrimaryKey[pk] = await this.activities.get(pk);
    }
    return { matchingActivityTypeHashOverride, highlights: { byInstanceId, byPrimaryKey } };
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

  /**
   * Collapse duplicate IndexedDB rows when the same D1 completion was stored from multiple mode-scoped fetches.
   * Same stable key as `dedupeD1FetchedActivities` so story “earliest” matches raid-style firsts.
   */
  private dedupeStoredActivitiesByStableKey(
    activities: StoredActivity[],
    game: 'D1' | 'D2',
    characterId: string
  ): StoredActivity[] {
    const byKey = new Map<string, StoredActivity>();
    for (const a of activities) {
      const ref = ActivityDbService.normalizeHistoryReferenceKeyForStory(a, game);
      const period = String(a.period ?? '');
      const inst = ActivityDbService.resolveStoredActivityInstanceId(a);
      const instStr = inst ? String(inst).trim() : '';
      const key =
        instStr !== '' && instStr !== '0'
          ? `inst:${instStr}`
          : `nop:${characterId}|${period}|${ref}`;
      if (!byKey.has(key)) {
        byKey.set(key, a);
      }
    }
    return Array.from(byKey.values());
  }

  /**
   * Collapse duplicate rows returned when the same D1 completion appears under multiple mode queries.
   */
  private dedupeD1FetchedActivities(activities: any[], characterId: string): any[] {
    const byKey = new Map<string, any>();
    for (const a of activities) {
      const ref = String(
        a?.activityDetails?.referenceId ?? a?.referenceId ?? a?.activityHash ?? ''
      ).trim();
      const period = String(a?.period ?? '');
      const inst = a?.activityDetails?.instanceId;
      const instStr = inst != null ? String(inst).trim() : '';
      const key =
        instStr !== '' && instStr !== '0'
          ? `inst:${instStr}`
          : `nop:${characterId}|${period}|${ref}`;
      if (!byKey.has(key)) byKey.set(key, a);
    }
    return Array.from(byKey.values());
  }

  /**
   * Match one stored row to a configured story “first mission” anchor (hash from `STORY_RELEASE_ANCHORS`,
   * then manifest display name, then D1 inline `activityName` from the API).
   */
  private resolveStoryReleaseAnchorForRow(
    activity: StoredActivity,
    game: 'D1' | 'D2',
    hashMap: Map<string, StoryReleaseAnchor>,
    labelMap: Map<string, StoryReleaseAnchor>
  ): StoryReleaseAnchor | undefined {
    const ref = ActivityDbService.normalizeHistoryReferenceKeyForStory(activity, game);
    // D1: history rows often omit referenceId in storage/API but still carry activityName — match story anchors by name.
    if (!ref && game === 'D1') {
      const inlineOnly =
        (activity as any).activityName ??
        (activity as any).activityDetails?.activityName ??
        (activity as any).definition?.activityName;
      if (inlineOnly != null && String(inlineOnly).trim() !== '') {
        return this.matchStoryAnchorByManifestLabel(String(inlineOnly), labelMap);
      }
      return undefined;
    }
    if (!ref) {
      return undefined;
    }
    let anchor = hashMap.get(ref);
    if (!anchor) {
      const actName = this.manifest.getActivityName(ref, game === 'D1');
      anchor = this.matchStoryAnchorByManifestLabel(actName, labelMap);
    }
    if (!anchor && game === 'D1') {
      const inline =
        (activity as any).activityName ??
        (activity as any).activityDetails?.activityName ??
        (activity as any).definition?.activityName;
      if (inline != null && String(inline).trim() !== '') {
        anchor = this.matchStoryAnchorByManifestLabel(String(inline), labelMap);
      }
    }
    return anchor;
  }

  /**
   * Earliest qualifying row per story release: walk stored history (oldest-first), match anchor hash/name
   * against manifest + config (same pattern as D2 story firsts), require instance id for PGCR link.
   */
  private computeStoryMilestoneFirstCompletions(
    activities: StoredActivity[],
    membershipId: string,
    characterId: string,
    game: 'D1' | 'D2'
  ): ActivityFirstCompletion[] {
    const hashMap = buildStoryHashToAnchorMap(game);
    const labelMap = buildStoryLabelToAnchorMap(game);
    if (hashMap.size === 0 && labelMap.size === 0) return [];

    // D1: merge every bundled manifest hash whose activityName matches an anchor label (fills gaps in referenceIds).
    if (game === 'D1') {
      for (const anchor of STORY_RELEASE_ANCHORS) {
        if (anchor.game !== 'D1') continue;
        const fromManifest = this.manifest.findD1ActivityHashesByExactName(anchor.label);
        for (const h of fromManifest) {
          if (!hashMap.has(h)) hashMap.set(h, anchor);
        }
      }
    }

    const byRelease = new Map<string, ActivityFirstCompletion>();
    const chronological = [...activities].sort(
      (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()
    );

    const trace = environment.traceGuardianFirsts;
    const storyStats = trace
      ? {
          noAnchor: 0,
          notClear: 0,
          noInstance: 0,
          dupRelease: 0,
          samples: [] as Array<Record<string, unknown>>,
          samplesNoAnchor: [] as Array<Record<string, unknown>>,
        }
      : null;
    const pushStorySample = (kind: string, row: Record<string, unknown>) => {
      if (!storyStats || storyStats.samples.length >= 14) {
        return;
      }
      storyStats.samples.push({ kind, ...row });
    };
    const pushNoAnchorSample = (row: Record<string, unknown>) => {
      if (!storyStats || storyStats.samplesNoAnchor.length >= 12) {
        return;
      }
      storyStats.samplesNoAnchor.push(row);
    };

    for (const activity of chronological) {
      const anchor = this.resolveStoryReleaseAnchorForRow(activity, game, hashMap, labelMap);
      if (!anchor) {
        if (storyStats) {
          storyStats.noAnchor++;
          const normRef = ActivityDbService.normalizeHistoryReferenceKeyForStory(activity, game);
          const det = activity.activityDetails as any;
          pushNoAnchorSample({
            normalizedRef: normRef || '(empty)',
            detailsReferenceId: det?.referenceId ?? null,
            detailsDirectorHash: det?.directorActivityHash ?? null,
            detailsActivityHash: det?.activityHash ?? null,
            detailsActivityId: det?.activityId ?? null,
            rootReferenceId: (activity as any).referenceId ?? null,
            rootActivityHash: (activity as any).activityHash ?? null,
            inlineName:
              (activity as any).activityName ??
              (activity as any).activityDetails?.activityName ??
              (activity as any).definition?.activityName ??
              '(none)',
            manifestName: normRef
              ? this.manifest.getActivityName(normRef, game === 'D1')
              : '(no ref — cannot resolve manifest name)',
            mode: activity.activityDetails?.mode ?? (activity as any).mode,
            period: activity.period,
            instanceId: ActivityDbService.resolveStoredActivityInstanceId(activity) || null,
            gameTag: (activity as any).game ?? null,
          });
        }
        continue;
      }

      let ref = ActivityDbService.normalizeHistoryReferenceKeyForStory(activity, game);
      if (!ref && game === 'D1') {
        const byLabel = this.manifest.findD1ActivityHashesByExactName(anchor.label);
        const pick = byLabel[0] ?? anchor.referenceIds[0];
        ref = pick ? ActivityDbService.normalizeD1ActivityHashKey(String(pick)) : '';
      }
      if (!ref) {
        continue;
      }

      if (!ActivityDbService.isHistoryRowClearForStoryMilestone(activity, game)) {
        if (storyStats) {
          storyStats.notClear++;
          pushStorySample('notClear', {
            releaseId: anchor.releaseId,
            ref,
            period: activity.period,
            completedRaw: ActivityDbService.readHistoryCompletedRaw(activity),
            instanceId: ActivityDbService.resolveStoredActivityInstanceId(activity) || null,
          });
        }
        continue;
      }

      const rawInstance = ActivityDbService.resolveStoredActivityInstanceId(activity);
      if (!rawInstance || rawInstance === '0') {
        if (storyStats) {
          storyStats.noInstance++;
          pushStorySample('noInstance', {
            releaseId: anchor.releaseId,
            ref,
            period: activity.period,
          });
        }
        continue;
      }
      const instanceId = rawInstance;

      if (byRelease.has(anchor.releaseId)) {
        if (storyStats) {
          storyStats.dupRelease++;
        }
        continue;
      }

      const displayName = this.manifest.getActivityName(ref, game === 'D1') || anchor.label;

      byRelease.set(anchor.releaseId, {
        type: 'story',
        name: displayName,
        game,
        period: activity.period,
        completionDate: activity.period,
        instanceId,
        referenceId: ref,
        mode: activity.activityDetails?.mode ?? (activity as any).mode ?? 0,
        characterId,
        membershipId,
        membershipType: (activity as any).membershipType,
        characterClass: (activity as any).characterClass,
        completed: 1,
        storyReleaseId: anchor.releaseId,
        storySubtitle: anchor.subtitle,
      });
    }

    const storyResult = Array.from(byRelease.values());
    if (trace && storyStats) {
      this.firstsTrace('step:story_milestones', {
        game,
        membershipIdTail: membershipId.slice(-8),
        characterIdTail: characterId.slice(-8),
        rowsScanned: chronological.length,
        hashMapSize: hashMap.size,
        labelMapSize: labelMap.size,
        skipCounts: {
          noAnchorMatch: storyStats.noAnchor,
          notClear: storyStats.notClear,
          noInstanceId: storyStats.noInstance,
          duplicateRelease: storyStats.dupRelease,
        },
        /** Rows that never matched a story anchor — inspect refs/names vs STORY_RELEASE_ANCHORS */
        samplesNoAnchorMatch: storyStats.samplesNoAnchor,
        samplesSkipped: storyStats.samples,
        accepted: storyResult.map((x) => ({
          storyReleaseId: x.storyReleaseId,
          name: x.name,
          referenceId: x.referenceId,
          instanceId: x.instanceId,
          period: x.completionDate,
        })),
      });
    }

    return storyResult;
  }

  /** Opt-in console pipeline for Guardian Firsts (`environment.traceGuardianFirsts`). Filter DevTools on `[Firsts·trace]`. */
  private firstsTrace(phase: string, payload: Record<string, unknown>): void {
    if (!environment.traceGuardianFirsts) {
      return;
    }
    console.log('[Firsts·trace]', phase, payload);
  }

  /**
   * Lists every row in the slice that matches a D1 story anchor (same resolver as milestones) and
   * reports whether known PGCR instance ids (The Coming War, etc.) appear — proof we “see” story rows in this query.
   */
  private traceD1StoryAnchorHitsInActivities(
    phase: string,
    activities: StoredActivity[],
    membershipId: string,
    characterId: string
  ): void {
    if (!environment.traceGuardianFirsts) {
      return;
    }
    const hashMap = buildStoryHashToAnchorMap('D1');
    const labelMap = buildStoryLabelToAnchorMap('D1');
    for (const anchor of STORY_RELEASE_ANCHORS) {
      if (anchor.game !== 'D1') continue;
      const fromManifest = this.manifest.findD1ActivityHashesByExactName(anchor.label);
      for (const h of fromManifest) {
        if (!hashMap.has(h)) hashMap.set(h, anchor);
      }
    }

    const knownPgcrInstanceIds = ['3492096595', '5475092160'];
    const knownSet = new Set(knownPgcrInstanceIds);
    const pgcrFound: Record<string, Record<string, unknown>> = {};
    const storyMissionsFound: Array<Record<string, unknown>> = [];

    for (const a of activities) {
      const inst = ActivityDbService.resolveStoredActivityInstanceId(a);
      if (inst && knownSet.has(inst)) {
        const ag = this.resolveStoryReleaseAnchorForRow(a, 'D1', hashMap, labelMap);
        pgcrFound[inst] = {
          inThisSlice: true,
          storyAnchorMatched: !!ag,
          storyReleaseId: ag?.releaseId ?? null,
          anchorLabel: ag?.label ?? null,
          normalizedRef: ActivityDbService.normalizeHistoryReferenceKeyForStory(a, 'D1') || '(empty)',
          detailsReferenceId: (a.activityDetails as any)?.referenceId ?? null,
          period: a.period,
          passesStoryClearRule: ActivityDbService.isHistoryRowClearForStoryMilestone(a, 'D1'),
          mode: a.activityDetails?.mode ?? (a as any).mode,
        };
      }

      const anchor = this.resolveStoryReleaseAnchorForRow(a, 'D1', hashMap, labelMap);
      if (!anchor) {
        continue;
      }
      let ref = ActivityDbService.normalizeHistoryReferenceKeyForStory(a, 'D1');
      if (!ref) {
        const hashes = this.manifest.findD1ActivityHashesByExactName(anchor.label);
        const pick = hashes[0] ?? anchor.referenceIds[0];
        ref = pick ? ActivityDbService.normalizeD1ActivityHashKey(String(pick)) : '';
      }
      storyMissionsFound.push({
        storyReleaseId: anchor.releaseId,
        anchorLabel: anchor.label,
        normalizedRef: ref || '(name-only match)',
        instanceId: inst || null,
        period: a.period,
        passesStoryClearRule: ActivityDbService.isHistoryRowClearForStoryMilestone(a, 'D1'),
        mode: a.activityDetails?.mode ?? (a as any).mode,
      });
    }

    const missingKnown = knownPgcrInstanceIds.filter((id) => !pgcrFound[id]);

    this.firstsTrace(phase, {
      membershipIdTail: membershipId.slice(-8),
      characterIdTail: characterId.slice(-8),
      rowsInSlice: activities.length,
      storyAnchorRowCount: storyMissionsFound.length,
      storyMissionsFound,
      knownPgcrInstanceIds,
      knownPgcrDetailsByInstanceId: pgcrFound,
      knownPgcrMissingFromThisCharacterSlice:
        missingKnown.length > 0 ? missingKnown : 'none — every listed id appears in this slice',
      explain:
        'storyMissionsFound = rows matching STORY_RELEASE_ANCHORS (hash/name). knownPgcrMissingFromThisCharacterSlice lists ids not in THIS character’s rows — normal on alts (mission ran on another character).',
    });
  }

  /**
   * When `game` is missing or invalid, infer from stored `activity.game` so we never run D1 rows through
   * the D2 story-anchor map (that produced 0 milestones + empty storyModeSample for valid D1 history).
   */
  private resolveFirstCompletionsGameParam(
    game: 'D1' | 'D2' | undefined,
    activities: StoredActivity[]
  ): 'D1' | 'D2' {
    if (game === 'D1' || game === 'D2') {
      return game;
    }
    const tagged = activities.find(
      (a) => (a as any).game === 'D1' || (a as any).game === 'D2'
    );
    const g = tagged ? (tagged as any).game : undefined;
    if (g === 'D1' || g === 'D2') {
      return g;
    }
    return 'D2';
  }

  async getFirstCompletions(
    membershipId: string,
    characterId: string,
    game: 'D1' | 'D2' | undefined
  ): Promise<GuardianFirsts> {
    await this.initPromise;
    const traceFirsts = environment.traceGuardianFirsts;
    // Same query as getAllActivitiesForCharacter — compound [membershipId,characterId] index is not declared;
    // object form uses membershipId + characterId indexes (Dexie 4).
    const activities = await this.activities.where({ membershipId, characterId }).toArray();
    const gameResolved = this.resolveFirstCompletionsGameParam(game, activities);
    // Align with getActivitiesByGame / UI: ignore stray rows tagged with the other game.
    const activitiesScoped = activities.filter(
      (a) => !(a as any).game || (a as any).game === gameResolved
    );
    const storyGame: 'D1' | 'D2' = gameResolved;

    // Proof logs outside nested groups so they always show without expanding (D1 story diagnosis).
    if (traceFirsts && gameResolved === 'D1') {
      this.traceD1StoryAnchorHitsInActivities(
        'step:01b_story_missions_in_scoped_slice',
        activitiesScoped,
        membershipId,
        characterId
      );
    }

    if (traceFirsts) {
      // D1: expanded group so step:03b / story_milestones aren’t hidden behind a collapsed row.
      const groupFn = gameResolved === 'D1' ? console.group.bind(console) : console.groupCollapsed.bind(console);
      groupFn(
        `[Firsts·trace] getFirstCompletions …${membershipId.slice(-6)}/${characterId.slice(-6)} (${game ?? '?'})`
      );
      this.firstsTrace('step:01_indexeddb', {
        gameArg: game,
        gameResolved,
        dexieRowCount: activities.length,
        scopedRowCount: activitiesScoped.length,
        droppedWrongGameTag: activities.length - activitiesScoped.length,
      });
    }

    try {
    // Group by raid/dungeon family and find the first activity for each
    const firstsByFamily: { [family: string]: ActivityFirstCompletion } = {};

    for (const activity of activitiesScoped) {
      const activityHash = ActivityDbService.normalizeHistoryReferenceKeyForStory(activity, gameResolved);
      if (!activityHash) {
        continue;
      }

      // Determine activity type
      let type = this.manifest.getActivityType(
        activityHash,
        activity.activityDetails?.mode,
        gameResolved === 'D1'
      );
      const allowedTypes = ['raid', 'dungeon', 'strike', 'nightfall', 'crucible', 'gambit', 'other'];
      if (!allowedTypes.includes(type)) {
        type = 'other';
      }

      // Activity type detection (debug info available if needed)

      // --- Game-specific filters ---
      if (gameResolved === 'D1') {
        // Treat any activity whose referenceId exists in the D1_FAMILY_MAP as a raid
        const isD1Raid = ActivityDbService.D1_FAMILY_MAP[activityHash];
        if (!isD1Raid) {
          // Not a D1 raid, skip
          continue;
        }
        type = 'raid';
      } else {
        // D2: only raids & dungeons
        // Check if this might be a contest mode raid or dungeon that wasn't identified
        if (type !== 'raid' && type !== 'dungeon') {
          // Check if the manifest name suggests this is a raid or dungeon (e.g., contains "Contest" or known names)
          const manifestName = this.manifest.getActivityName(activityHash, false);
          if (manifestName && manifestName !== 'Unknown Activity') {
            const nameLower = manifestName.toLowerCase();
            // Check if it's a contest mode activity
            const isContestMode = nameLower.includes('contest') || nameLower.includes('day one');
            
            // Known raid base names (used to identify raids even if not in the map)
            const knownRaidNames = [
              'leviathan', 'last wish', 'garden of salvation', 'deep stone crypt',
              'vault of glass', "king's fall", "crota's end", 'vow of the disciple',
              'root of nightmares', "salvation's edge", 'scourge of the past',
              'crown of sorrow', 'eater of worlds', 'spire of stars', 'pantheon',
              'desert perpetual'
            ];
            
            // Known dungeon base names
            const knownDungeonNames = [
              'shattered throne', 'pit of heresy', 'prophecy', 'grasp of avarice',
              'duality', 'spire of the watcher', 'ghosts of the deep', "warlord's ruin",
              "vesper's host", 'sundered doctrine', 'equilibrium'
            ];
            
            const isKnownRaid = knownRaidNames.some(raidName => nameLower.includes(raidName));
            const isKnownDungeon = knownDungeonNames.some(dungeonName => nameLower.includes(dungeonName));
            
            // Check if mode is raid mode (4) or dungeon mode (82)
            const isRaidMode = activity.activityDetails.mode === 4;
            const isDungeonMode = activity.activityDetails.mode === 82;
            
            // If it's contest mode with a known raid/dungeon name, or known name with matching mode, treat accordingly
            if ((isContestMode && isKnownRaid) || (isKnownRaid && isRaidMode)) {
              type = 'raid';
            } else if ((isContestMode && isKnownDungeon) || (isKnownDungeon && isDungeonMode)) {
              type = 'dungeon';
            } else {
              continue;
            }
          } else {
            continue;
          }
        }
      }

      let family = gameResolved === 'D2'
        ? ActivityDbService.ACTIVITY_FAMILY_MAP[activityHash]
        : ActivityDbService.D1_FAMILY_MAP[activityHash];
      if (!family) {
        // Fallback to manifest name when mapping is missing so dungeons/raids still render
        const name = this.manifest.getActivityName(activityHash, gameResolved === 'D1');
        if (!name || name === 'Unknown Activity') {
          continue;
        }
        family = name;
        
        // For contest mode activities, try to extract the base raid/dungeon name
        // e.g., "Last Wish: Contest" -> "Last Wish: Normal" (or just "Last Wish")
        // e.g., "Equilibrium: Contest" -> "Equilibrium: Contest" (keep as is since it's in the map)
        if (family.includes(': Contest') || family.includes(': Day One')) {
          // Extract base name and normalize to match family mapping format
          const baseName = family.split(':')[0].trim();
          // Try to find a matching family entry for this base name
          const matchingFamily = Object.values(ActivityDbService.ACTIVITY_FAMILY_MAP)
            .find(f => f.startsWith(baseName));
          if (matchingFamily) {
            // Use the base family name but keep the contest variant in the name
            // This ensures contest mode activities are grouped with their base activity
            const baseFamilyName = matchingFamily.split(':')[0];
            family = baseFamilyName + ': Contest';
          }
          // If no matching family found but it's in the map (like Equilibrium: Contest), keep it as is
        }
      }
      const cleared = ActivityDbService.isHistoryActivityClear(activity);
      if (!cleared) {
        continue;
      }
      const completed = 1;

      // Check for solo and flawless status
      let isSolo = false;
      let isSoloFlawless = false;

      // Store activity for batch PGCR processing
      if ((gameResolved === 'D2' && (type === 'dungeon' || type === 'raid')) ||
          (gameResolved === 'D1' && type === 'raid')) {
        // We'll process PGCR data in batch after the loop to reduce individual API calls
        (activity as any).needsPgcrProcessing = true;
      }

      // For D1 raids and D2 raids/dungeons, preserve variants by keying firsts by family + referenceId
      // This ensures different difficulty variants (Normal, Master, etc.) are tracked separately
      const firstsKey = ((gameResolved === 'D1' && type === 'raid') || (gameResolved === 'D2' && (type === 'raid' || type === 'dungeon')))
        ? `${family}|${activityHash}`
        : family;

      // Note: We use Activity History period for initial comparison, but for raids/dungeons,
      // we will fetch PGCR and use PGCR period (the authoritative timestamp) in processPGCRData.
      // This initial comparison is just to narrow down candidates - final period comes from PGCR.
      if (!firstsByFamily[firstsKey] || new Date(activity.period) < new Date(firstsByFamily[firstsKey].period)) {
        const resolvedInst = ActivityDbService.resolveStoredActivityInstanceId(activity as StoredActivity);
        firstsByFamily[firstsKey] = {
          name: this.manifest.getActivityName(activityHash, gameResolved === 'D1') || 'Unknown Activity',
          type: type as ActivityFirstCompletion['type'],
          game: gameResolved,
          completionDate: activity.period, // Will be updated from PGCR period in processPGCRData
          referenceId: activityHash,
          period: activity.period, // Will be updated from PGCR period in processPGCRData
          instanceId: (resolvedInst || activity.activityDetails?.instanceId) as string | undefined,
          mode: activity.activityDetails?.mode ?? (activity as any).mode,
          characterId,
          membershipId,
          membershipType: (activity as any).membershipType,
          characterClass: (activity as any).characterClass,
          completed,
          isSolo,
          isSoloFlawless
        } as ActivityFirstCompletion & { needsPgcrProcessing?: boolean };
        
        // Copy the needsPgcrProcessing flag from activity (internal processing flag, not part of interface)
        (firstsByFamily[firstsKey] as any).needsPgcrProcessing = (activity as any).needsPgcrProcessing || false;
      }
    }

    if (environment.traceGuardianFirsts) {
      this.firstsTrace('step:02_raid_dungeon_candidates', {
        distinctFamilyKeys: Object.keys(firstsByFamily).length,
        needsPgcrProcessing: Object.values(firstsByFamily).filter((f) => (f as any).needsPgcrProcessing).length,
        snapshot: Object.values(firstsByFamily).map((f) => ({
          name: f.name,
          type: f.type,
          referenceId: f.referenceId,
          instanceId: f.instanceId,
          period: f.period,
          needsPgcr: !!(f as any).needsPgcrProcessing,
        })),
      });
    }

    // Batch process PGCR data for all activities that need it
    const pgcrAvailable = await this.batchProcessPGCRData(firstsByFamily, membershipId, gameResolved);

    // For raids and dungeons, we REQUIRE PGCR data (solo/flawless + PGCR link).
    const allFirsts = Object.values(firstsByFamily);
    const raidFilterRejected: Array<{
      name: string;
      type: string;
      reason: string;
      instanceId?: string;
    }> = [];
    const filteredFirsts = allFirsts.filter((first) => {
        // All first clears need an instanceId to link to the PGCR
        if (!first.instanceId) {
          raidFilterRejected.push({ name: first.name, type: first.type, reason: 'no_instanceId' });
          if (environment.debug) {
            console.warn(`[Firsts] Skipping ${first.name} - no instanceId`);
          }
          return false;
        }

        // For raids and dungeons, require PGCR data (instanceId = PGCR identifier, so we should be able to get it)
        // Ensure instanceId is a string for consistent lookup (matches how we stored it in pgcrAvailable)
        const instanceIdStr = first.instanceId ? String(first.instanceId) : null;
        const hasPgcr = instanceIdStr ? pgcrAvailable.has(instanceIdStr) : false;
        if ((first as any).needsPgcrProcessing) {
          if (!hasPgcr) {
            raidFilterRejected.push({
              name: first.name,
              type: first.type,
              reason: 'pgcr_cache_or_api_miss',
              instanceId: instanceIdStr ?? undefined,
            });
            if (environment.debug) {
              console.warn(
                `[Firsts] ${first.name}: PGCR required but unavailable (instance ${instanceIdStr})`
              );
            }
            return false;
          }
        }

        // For other activity types (strikes, crucible, etc.), PGCR is optional
        // They don't need solo/flawless detection, so we can show them without PGCR

        return true;
      });

    if (environment.traceGuardianFirsts) {
      this.firstsTrace('step:02b_after_pgcr_filter', {
        pgcrResolvedInstanceIdCount: pgcrAvailable.size,
        keptRaidDungeon: filteredFirsts.length,
        rejectedRaidDungeon: raidFilterRejected,
      });
    }

    // D1: same completion can be stored from multiple mode-scoped history pages — dedupe before story firsts
    // so “earliest” matches one physical PGCR (mirrors fetch-time dedupe for raids).
    const activitiesForStory =
      gameResolved === 'D1'
        ? this.dedupeStoredActivitiesByStableKey(activitiesScoped, 'D1', characterId)
        : activitiesScoped;
    if (environment.traceGuardianFirsts) {
      this.firstsTrace('step:03_story_input_rows', {
        rowsForStoryPass: activitiesForStory.length,
        d1DedupApplied: gameResolved === 'D1' && activitiesForStory.length !== activitiesScoped.length,
      });
    }
    if (traceFirsts && gameResolved === 'D1') {
      this.traceD1StoryAnchorHitsInActivities(
        'step:03b_story_missions_in_story_pass_slice',
        activitiesForStory,
        membershipId,
        characterId
      );
    }
    const storyFirsts = this.computeStoryMilestoneFirstCompletions(
      activitiesForStory,
      membershipId,
      characterId,
      storyGame
    );
    const firstCompletions: ActivityFirstCompletion[] = [...filteredFirsts, ...storyFirsts];

    if (traceFirsts) {
      this.firstsTrace('step:04_merge_return', {
        keptRaidDungeon: filteredFirsts.length,
        storyMilestones: storyFirsts.length,
        totalFirstCompletions: firstCompletions.length,
      });
    }

    return {
      firstCompletions,
      membershipId,
      characterId,
      displayName: '', // This will be set by the component
      platform: '' // This will be set by the component
    };
    } finally {
      if (traceFirsts) {
        console.groupEnd();
      }
    }
  }

  /**
   * Membership-scoped story milestones (used to align story firsts with account-wide firsts behavior).
   * This intentionally does not alter raid/dungeon logic.
   */
  async getStoryMilestoneFirstCompletionsForMembership(
    membershipId: string,
    game: 'D1' | 'D2'
  ): Promise<ActivityFirstCompletion[]> {
    await this.initPromise;
    const allForMember = await this.activities.where('membershipId').equals(membershipId).toArray();
    const scoped = allForMember.filter((a) => !(a as any).game || (a as any).game === game);
    const storyInput =
      game === 'D1'
        ? (() => {
            const byKey = new Map<string, StoredActivity>();
            for (const a of scoped) {
              const ref = ActivityDbService.normalizeHistoryReferenceKeyForStory(a, 'D1');
              const period = String(a.period ?? '');
              const inst = ActivityDbService.resolveStoredActivityInstanceId(a);
              const characterId = String((a as any).characterId ?? '');
              const key =
                inst && inst !== '0'
                  ? `inst:${inst}`
                  : `nop:${characterId}|${period}|${ref}`;
              if (!byKey.has(key)) {
                byKey.set(key, a);
              }
            }
            return [...byKey.values()];
          })()
        : scoped;

    if (environment.traceGuardianFirsts) {
      this.firstsTrace('ui:membership_story_pass_input', {
        game,
        membershipIdTail: membershipId.slice(-8),
        rowsTotalForMembership: allForMember.length,
        rowsGameScoped: scoped.length,
        rowsForStoryPass: storyInput.length,
      });
    }

    return this.computeStoryMilestoneFirstCompletions(
      storyInput,
      membershipId,
      'membership-scope',
      game
    );
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
      console.error('[ActivityDb] Error getting last activity date:', error);
      return null;
    }
  }

  // Store a batch of activities and explicitly tag them with the correct game
  private async storeActivities(activities: any[], membershipId: string, membershipType: number, characterId: string, game: 'D1' | 'D2'): Promise<void> {
    await this.initPromise;
    try {
      // Guard: avoid polluting this account with teammate rows derived from PGCRs
      // Some callers (e.g. PGCR‐processing helpers) may pass raw PGCR entries that still
      // carry a membershipId property belonging to a teammate.  If that occurs, skip it so
      // we never persist activities under the wrong owner.
      const activitiesForOwner = activities.filter(a => {
        // If the incoming object has its own membershipId field AND it differs from the owner,
        // treat it as a teammate row and drop it.
        return !(a as any).membershipId || (a as any).membershipId === membershipId;
      });

      const activitiesToStore = activitiesForOwner.map(activity => ({
        ...activity,
        membershipId,
        membershipType,
        characterId,
        validated: false,
        validatedAt: null,
        game
      }));

      if (activitiesToStore.length > 0) {
      await this.addActivities(activitiesToStore);
      }
    } catch (error) {
      console.error('[DEBUG] Error storing activities:', error);
      throw error;
    }
  }

  async fetchAndStoreActivities(
    membershipType: BungieMembershipType,
    membershipId: string,
    characterId: string,
    isD1: boolean = false,
    forceFull: boolean = false
  ): Promise<void> {
    await this.initPromise;
    try {
      // Enhanced incremental sync - get last stored activity date for this character
      const lastActivity = await this.getLastActivityDate(characterId);
      const lastActivityDate = lastActivity ? new Date((lastActivity as any).period) : null;
      
      // For incremental sync, only fetch recent activities if we have existing data
      const isIncrementalSync = !forceFull && lastActivityDate !== null;
      // Full back-fill must cover the entire Destiny 1 lifetime (~11 yrs)
      // so that early-2014 activities like "A Guardian Rises" are fetched.
      // 4000 days ≈ 11 years.
      const daysToFetch = isIncrementalSync ? 7 : 4000;
      
      if (environment.debug) {
        console.log(`[SYNC] ${isIncrementalSync ? 'Incremental' : 'Full'} sync for ${characterId}, fetching last ${daysToFetch} days`);
      }

      let activities: any[] = [];
      if (isD1) {
        // ---------------- Parallel D1 pagination ----------------
        const D1_MODES = [
          0,1,2,3,4,5,6,10,12,15,16,17,18,19,22,24,25,31,32,37,38,39,40,41,42,43,44,45,46,48,49,50,51,52,53
        ];
        const pageSize = 250;
        
        // Process all modes in parallel with concurrency control
        const concurrencyLimit = 5; // Reduced from 8 to 5 to stay under rate limits
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

            // Merge activity definitions from D1 API so names resolve (definitions=true and inlined names)
            if (resp?.definitions) {
              this.manifest.injectD1DefinitionsFromActivityHistoryResponse(resp.definitions);
            }
            if (resp?.activityDefinitionsFromNames && Object.keys(resp.activityDefinitionsFromNames).length > 0) {
              this.manifest.injectD1DefinitionsFromActivityHistoryResponse(resp.activityDefinitionsFromNames);
            }

            const pageActs = resp?.data?.activities || [];
            
            // For incremental sync, stop if we've reached activities older than our cutoff
            if (isIncrementalSync && pageActs.length > 0) {
              const oldestActivityDate = new Date(pageActs[pageActs.length - 1].period);
              const cutoffDate = new Date(Date.now() - (daysToFetch * 24 * 60 * 60 * 1000));
              
              if (oldestActivityDate < cutoffDate) {
                // Filter out activities older than cutoff and stop
                const recentActivities = pageActs.filter((act: any) => new Date(act.period) >= cutoffDate);
                modeActivities.push(...recentActivities);
                break;
              }
            }
            
            // Stop when the API returns an empty page; otherwise accumulate and continue
            if (pageActs.length === 0) {
              hasMore = false;
              break;
            }
            modeActivities.push(...pageActs);
            page++;
          }
            
            return modeActivities;
          });
          
          // Wait for current chunk to complete before starting next chunk
          const chunkResults = await Promise.all(modePromises);
          activities.push(...chunkResults.flat());
        }

        activities = this.dedupeD1FetchedActivities(activities, characterId);
      } else {
        // D2 activity fetching - fetch with multiple modes to ensure we get all raids and dungeons
        // Mode undefined = all activities, mode 4 = raids, mode 82 = dungeons
        const D2_MODES: (number | undefined)[] = [undefined, 4, 82];

        if (environment.debug) {
          console.log(`[D2 Fetch] Starting fetch for character ${characterId} with modes: ${D2_MODES.join(', ')}`);
        }

        const allModeActivities: any[] = [];
        
        for (const mode of D2_MODES) {
          let page = 0;
          let hasMore = true;
          const modeActivities: any[] = [];
          
          while (hasMore) {
            try {
              const response = await firstValueFrom(
                this.bungieService.getActivityHistory(membershipType, membershipId, characterId, mode, page)
              );
              const pageActivities = (response as any).data?.activities || [];
              
              // For incremental sync, stop if we've reached activities older than our cutoff
              if (isIncrementalSync && pageActivities.length > 0) {
                const oldestActivityDate = new Date(pageActivities[pageActivities.length - 1].period);
                const cutoffDate = new Date(Date.now() - (daysToFetch * 24 * 60 * 60 * 1000));
                
                if (oldestActivityDate < cutoffDate) {
                  // Filter out activities older than cutoff and stop
                  const recentActivities = pageActivities.filter((act: any) => new Date(act.period) >= cutoffDate);
                  modeActivities.push(...recentActivities);
                  break;
                }
              }
              
              // Stop when the API returns an empty page; otherwise accumulate and continue
              if (pageActivities.length === 0) {
                hasMore = false;
                break;
              }
              
              modeActivities.push(...pageActivities);
              page++;
            } catch (err) {
              console.warn(`[D2] fetch failed for mode ${mode} page ${page}`, err);
              break; // stop this mode on error to avoid infinite loop
            }
          }

          if (environment.debug) {
            console.log(`[D2 Fetch] Mode ${mode}: fetched ${modeActivities.length} activities`);
          }
          allModeActivities.push(...modeActivities);
        }

        if (environment.debug) {
          console.log(`[D2 Fetch] Total activities fetched across all modes: ${allModeActivities.length}`);
        }
        
        // Deduplicate activities across modes by instanceId
        const seenInstanceIds = new Set<string>();
        const uniqueActivities = allModeActivities.filter(activity => {
          const instanceId = activity?.activityDetails?.instanceId;
          if (!instanceId) return false;
          if (seenInstanceIds.has(instanceId)) return false;
          seenInstanceIds.add(instanceId);
          return true;
        });

        if (environment.debug) {
          console.log(`[D2 Fetch] After deduplication: ${uniqueActivities.length} unique activities`);
        }
        activities = uniqueActivities;
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
        // Prefetch D1 PGCRs in background (throttled) so breakdown tab has duration without bursting the API
        if (isD1) {
          const instanceIds = newActivities
            .map((a: any) => a?.activityDetails?.instanceId)
            .filter((id: any) => id != null && String(id).trim() !== '' && String(id) !== '0')
            .map((id: any) => String(id));
          if (instanceIds.length > 0) {
            this.prefetchD1PgcrsInBackground([...new Set(instanceIds)]);
          }
        }
      }
    } catch (error) {
      console.error('[DEBUG] Error in fetchAndStoreActivities:', error);
      throw error;
    }
  }

  /**
   * Prefetch D1 PGCRs in the background with throttling to avoid Bungie rate limits.
   * Called after storing new D1 activities so the breakdown tab can show times from cache.
   */
  private prefetchD1PgcrsInBackground(instanceIds: string[]): void {
    if (instanceIds.length === 0) return;
    // getD1PGCRBatch(ids, c) chunks into size c and forkJoins each chunk — so c is
    // parallel HTTP calls, NOT one batched endpoint. Use c=1 so each PGCR is
    // sequential and we stay under PerEndpointRequestThrottleExceeded.
    const batchSize = 6; // ids processed per await (each id fetched one-after-another inside batch)
    const delayMs = 1800; // pause between batches so other app requests can run
    const chunks: string[][] = [];
    for (let i = 0; i < instanceIds.length; i += batchSize) {
      chunks.push(instanceIds.slice(i, i + batchSize));
    }
    const total = chunks.length;
    this.pgcrPrefetchRunCount++;
    this.pgcrPrefetchProgress$.next({ inProgress: true, current: 0, total });
    (async () => {
      try {
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          try {
            const results = await firstValueFrom(this.bungieService.getD1PGCRBatch(chunk, 1));
            const list = Array.isArray(results) ? results : [];
            for (const raw of list) {
              if (raw?.activityDetails?.instanceId != null) {
                await this.pgcrCacheService.cacheD1PGCR(String(raw.activityDetails.instanceId), raw);
              }
            }
          } catch (err: any) {
            const msg = String(err?.message ?? err ?? '');
            const throttled = /Throttle|429|Too many/i.test(msg);
            console.warn('[D1 PGCR prefetch] Batch failed:', err);
            if (throttled && i < chunks.length - 1) {
              await new Promise((r) => setTimeout(r, 10_000));
            }
          }
          this.pgcrPrefetchProgress$.next({ inProgress: true, current: i + 1, total });
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      } finally {
        this.pgcrPrefetchRunCount = Math.max(0, this.pgcrPrefetchRunCount - 1);
        this.pgcrPrefetchProgress$.next(this.pgcrPrefetchRunCount > 0 ? { inProgress: true, current: total, total } : { inProgress: false, current: total, total });
      }
    })();
  }

  // Helper method to chunk array for concurrency control
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get activity duration in seconds. Supports D2 shape and D1 alternate keys
   * so D1 time displays correctly in stats and breakdown.
   */
  private getActivityDurationSeconds(a: any): number {
    const v = a?.values;
    if (v?.timePlayedSeconds?.basic?.value != null) return Number(v.timePlayedSeconds.basic.value);
    if (v?.secondsPlayed?.basic?.value != null) return Number(v.secondsPlayed.basic.value);
    if (typeof v?.secondsPlayed === 'number') return v.secondsPlayed;
    if (typeof a?.secondsPlayed === 'number') return a.secondsPlayed;
    if (typeof a?.timePlayedSeconds === 'number') return a.timePlayedSeconds;
    return 0;
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
    return ActivityDbService.isHistoryActivityClear(activity);
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
   * Returns a set of instanceIds that successfully got PGCRs (for filtering).
   */
  private async batchProcessPGCRData(
    firstsByFamily: { [family: string]: ActivityFirstCompletion }, 
    membershipId: string, 
    game: 'D1' | 'D2'
  ): Promise<Set<string>> {
    const activitiesNeedingPgcr = Object.values(firstsByFamily).filter(f => (f as any).needsPgcrProcessing);
    const pgcrAvailable = new Set<string>();

    if (activitiesNeedingPgcr.length === 0) {
      if (environment.traceGuardianFirsts) {
        this.firstsTrace('step:02_pgcr_batch_skip', { reason: 'no_raid_or_dungeon_needs_pgcr' });
      }
      return pgcrAvailable;
    }

    // Get all instance IDs that need PGCR processing
    const instanceIds = activitiesNeedingPgcr.map(f => {
      const id = f.instanceId;
      // Ensure instanceId is a string for consistent lookup
      return id ? String(id) : null;
    }).filter((id): id is string => !!id);

    if (instanceIds.length === 0) return pgcrAvailable;

    if (environment.traceGuardianFirsts) {
      this.firstsTrace('step:02_pgcr_batch_start', {
        game,
        instanceIdsRequested: [...instanceIds],
        candidates: activitiesNeedingPgcr.map((f) => ({
          name: f.name,
          type: f.type,
          instanceId: f.instanceId != null ? String(f.instanceId) : null,
        })),
      });
    }

    try {
      // First, try to get all PGCRs from cache in batch
      const cachedPgcrMap = await this.pgcrCacheService.getBatch(instanceIds);

      // Process cached PGCRs
      for (const first of activitiesNeedingPgcr) {
        if (!first.instanceId) continue;

        // Ensure instanceId is a string for consistent lookup (matches how we stored it)
        const instanceIdStr = String(first.instanceId);
        const pgcr = cachedPgcrMap.get(instanceIdStr);
        if (pgcr) {
          this.processPGCRData(first, pgcr, game, membershipId);
          pgcrAvailable.add(instanceIdStr);
        }
      }

      // Check which PGCRs are missing from cache
      const missingIds = await this.pgcrCacheService.getMissingPGCRs(instanceIds);

      if (missingIds.length > 0) {
        // Fetch missing PGCRs from API in batch
        const missingPgcrData = await this.fetchMissingPGCRs(missingIds, game);

        // Process the newly fetched PGCRs
        for (const first of activitiesNeedingPgcr) {
          if (!first.instanceId) continue;

          // Ensure instanceId is a string for consistent lookup
          const instanceIdStr = String(first.instanceId);
          if (!missingPgcrData.has(instanceIdStr)) continue;

          const pgcr = missingPgcrData.get(instanceIdStr);
          if (pgcr) {
            this.processPGCRData(first, pgcr, game, membershipId);
            pgcrAvailable.add(instanceIdStr);
          }
        }
      }

      const withoutPgcr = activitiesNeedingPgcr.filter(f => !pgcrAvailable.has(String(f.instanceId || '')));
      if (withoutPgcr.length > 0 && environment.debug) {
        console.warn(
          `[PGCR] ${withoutPgcr.length} first-clear(s) still missing PGCR after batch (e.g. ${withoutPgcr[0]?.name})`
        );
      }

      if (environment.traceGuardianFirsts) {
        this.firstsTrace('step:02_pgcr_batch_done', {
          resolvedCount: pgcrAvailable.size,
          resolvedInstanceIds: [...pgcrAvailable],
          stillMissing: withoutPgcr.map((f) => ({
            name: f.name,
            instanceId: f.instanceId != null ? String(f.instanceId) : null,
          })),
        });
      }
    } catch (error) {
      console.warn('[PGCR] Batch processing failed, falling back to individual processing:', error);
      // Fallback to individual processing if batch fails
      const individualPgcrAvailable = await this.fallbackToIndividualPGCRProcessing(activitiesNeedingPgcr, game, membershipId);
      individualPgcrAvailable.forEach(id => pgcrAvailable.add(id));
      if (environment.traceGuardianFirsts) {
        this.firstsTrace('step:02_pgcr_batch_fallback', {
          message: String(error),
          resolvedCountAfterFallback: pgcrAvailable.size,
          resolvedInstanceIds: [...pgcrAvailable],
        });
      }
    }

    return pgcrAvailable;
  }

  /**
   * Fetches missing PGCRs from the Bungie API in batch.
   * Uses individual fetches with Promise.allSettled to handle partial failures gracefully.
   */
  private async fetchMissingPGCRs(instanceIds: string[], game: 'D1' | 'D2'): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    const pgcrData: Array<{ id: string; data: any; requestedMemberId?: string }> = [];
    
    // Fetch PGCRs individually with concurrency limit to handle errors gracefully
    // Add delay between chunks to avoid rate limits
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(instanceIds, concurrencyLimit);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const promises = chunk.map(async (instanceId) => {
        try {
          const pgcr = await firstValueFrom(this.bungieService.getPGCR(instanceId, game === 'D1'));
          if (pgcr) {
            result.set(instanceId, pgcr);
            pgcrData.push({ id: instanceId, data: pgcr });
            return { instanceId, success: true, pgcr };
          }
          return { instanceId, success: false, error: 'Empty PGCR response' };
        } catch (error: any) {
          const errorStatus = error?.status || error?.error?.status;
          const errorMessage = error?.message || error?.error?.message || 'Unknown error';
          if (environment.debug) {
            console.warn(`[PGCR] Failed to fetch PGCR ${instanceId}:`, {
              status: errorStatus,
              message: errorMessage,
              error: error
            });
          }
          return { instanceId, success: false, error: errorMessage, status: errorStatus };
        }
      });
      
      await Promise.allSettled(promises);
      
      // Add delay between chunks to avoid rate limits (except for last chunk)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between chunks
      }
    }
    
    // Cache the successfully fetched PGCRs
    if (pgcrData.length > 0) {
      try {
        await this.pgcrCacheService.setBatch(pgcrData);
      } catch (cacheError) {
        console.warn('[PGCR] Failed to cache PGCRs:', cacheError);
      }
    }
    
    if (result.size < instanceIds.length && environment.debug) {
      const missing = instanceIds.filter(id => !result.has(id));
      console.warn(`[PGCR] Fetched ${result.size}/${instanceIds.length}; missing sample:`, missing.slice(0, 5));
    }

    return result;
  }

  /**
   * Processes PGCR data for a single activity.
   * Uses progressive fallback strategy: PGCR entries -> PGCR players -> activity values
   */
  private processPGCRData(first: ActivityFirstCompletion, pgcr: PgcrLite | any, game: 'D1' | 'D2', membershipId: string): void {
    // Update completion date from PGCR period (most accurate timestamp)
    // PGCR period is the authoritative source for when the activity completed
    if (pgcr?.activityDetails?.period) {
      first.completionDate = pgcr.activityDetails.period;
      first.period = pgcr.activityDetails.period;
    }
    
    // Method 1: Use PGCR entries (most accurate) - Primary detection method
    if (pgcr && pgcr.entries && Array.isArray(pgcr.entries) && pgcr.entries.length > 0) {
      // Extract unique players from entries
      const uniquePlayers = new Set(
        pgcr.entries
          .map((e: any) => e.player?.destinyUserInfo?.membershipId)
          .filter(Boolean)
      );
      const playerCount = uniquePlayers.size;
      
      // For dungeons, check solo and flawless status
      if (first.type === 'dungeon') {
        (first as any).isSolo = playerCount === 1;
        
        if ((first as any).isSolo) {
          // Check if all entries have 0 deaths for solo flawless
          const allDeaths = pgcr.entries.map((e: any) => e.values?.deaths?.basic?.value ?? 0);
          const totalDeaths = allDeaths.reduce((sum: number, d: number) => sum + d, 0);
          (first as any).isSoloFlawless = totalDeaths === 0;
        }
      }
      
      // For raids, check flawless status (all players with 0 deaths)
      if (first.type === 'raid') {
        const allDeaths = pgcr.entries.map((e: any) => e.values?.deaths?.basic?.value ?? 0);
        const totalDeaths = allDeaths.reduce((sum: number, d: number) => sum + d, 0);
        (first as any).isFlawless = totalDeaths === 0;
        (first as any).fireteamSize = playerCount;
      }
      
      // Attach class and membershipType for per-character view (membershipId match is sufficient)
      const me = pgcr.entries.find((e: any) => e.player?.destinyUserInfo?.membershipId === membershipId);
      if (me) {
        (first as any).characterClass = me.player?.characterClass;
        (first as any).membershipType = me.player?.destinyUserInfo?.membershipType;
      }
    }
    // Method 2: Fallback to PGCR players array (alternative format)
    else if (pgcr && pgcr.players && Array.isArray(pgcr.players) && pgcr.players.length > 0) {
      const uniquePlayers = new Set(
        pgcr.players.map((p: any) => p.id).filter(Boolean)
      );
      const playerCount = uniquePlayers.size;
      
      // For dungeons, check solo and flawless status
      if (first.type === 'dungeon') {
        (first as any).isSolo = playerCount === 1;
        
        if ((first as any).isSolo) {
          const totalDeaths = pgcr.players.reduce((sum: number, p: any) => sum + (p.deaths ?? 0), 0);
          (first as any).isSoloFlawless = totalDeaths === 0;
        }
      }
      
      // For raids, check flawless status
      if (first.type === 'raid') {
        const totalDeaths = pgcr.players.reduce((sum: number, p: any) => sum + (p.deaths ?? 0), 0);
        (first as any).isFlawless = totalDeaths === 0;
        (first as any).fireteamSize = playerCount;
      }
      
      // Try to find player info from players array
      const me = pgcr.players.find((p: any) => p.id === membershipId);
      if (me && pgcr.entries && Array.isArray(pgcr.entries)) {
        const meEntry = pgcr.entries.find((e: any) => 
          e.player?.destinyUserInfo?.membershipId === membershipId || 
          e.characterId === me.charId
        );
        if (meEntry) {
          (first as any).characterClass = meEntry.player?.characterClass;
          (first as any).membershipType = meEntry.player?.destinyUserInfo?.membershipType;
        }
      }
    }
    // Method 3: Fallback to activity values (least reliable but always available)
    // Note: This fallback is only used if PGCR structure is incomplete.
    // If we have a PGCR object but it doesn't have entries/players, we can't determine solo status from it.
    // In this case, we leave isSolo/isSoloFlawless as false (initialized values).
    // The activity history values are only used in getDungeonSoloFirsts when we can't fetch the PGCR at all.
  }

  /**
   * Fallback method for individual PGCR processing if batch processing fails.
   * Returns a set of instanceIds that successfully got PGCRs.
   */
  private async fallbackToIndividualPGCRProcessing(
    activitiesNeedingPgcr: ActivityFirstCompletion[], 
    game: 'D1' | 'D2', 
    membershipId: string
  ): Promise<Set<string>> {
    const pgcrAvailable = new Set<string>();
    const concurrencyLimit = 3; // Reduced from 5 to 3 to stay under rate limits
    const chunks = this.chunkArray(activitiesNeedingPgcr, concurrencyLimit);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (first) => {
        try {
          if (!first.instanceId) return;
          
          // Try cache first
          let pgcr: any = game === 'D2' 
            ? await this.pgcrCacheService.getD2PGCR(first.instanceId)
            : await this.pgcrCacheService.getD1PGCR(first.instanceId);
          
          // If not in cache, fetch from API
          if (!pgcr) {
            try {
              const fetched = await firstValueFrom(this.bungieService.getPGCR(first.instanceId, game === 'D1'));
              if (fetched) {
                // Cache it
                if (game === 'D1') {
                  await this.pgcrCacheService.cacheD1PGCR(first.instanceId, fetched);
                } else {
                  await this.pgcrCacheService.cacheD2PGCR(first.instanceId, fetched);
                }
                pgcr = fetched;
              }
            } catch (fetchError) {
              if (environment.debug) {
                console.warn(`[PGCR] Failed to fetch PGCR for ${first.instanceId}:`, fetchError);
              }
              return;
            }
          }
            
          if (pgcr) {
            this.processPGCRData(first, pgcr, game, membershipId);
            pgcrAvailable.add(first.instanceId);
          }
        } catch (error) {
          if (environment.debug) {
            console.warn(`[PGCR] Failed to process PGCR for ${first.name}:`, error);
          }
        }
      });
      
      await Promise.allSettled(promises);
    }
    
    return pgcrAvailable;
  }

  /**
   * Returns the first solo and solo-flawless dungeon completions per dungeon version
   * for the specified Destiny 2 account (all characters).
   *
   * This method performs an in-memory scan—no extra API calls.
   */
  /**
   * Detects solo and solo flawless status from PGCR data using progressive fallback strategy.
   * Returns { isSolo: boolean, isSoloFlawless: boolean } with fallback to activity values.
   */
  private async detectSoloFromPGCR(activity: StoredActivity, membershipId: string): Promise<{ isSolo: boolean; isSoloFlawless: boolean }> {
    const instanceId = activity.activityDetails?.instanceId;
    if (!instanceId) {
      // Fallback to activity values if no instanceId
      return {
        isSolo: this.isSolo(activity),
        isSoloFlawless: this.isSoloFlawless(activity)
      };
    }

    try {
      // Try to get PGCR from cache
      const pgcr = await this.pgcrCacheService.getD2PGCR(instanceId);
      
      if (!pgcr) {
        // Fallback to activity values if PGCR not available
        return {
          isSolo: this.isSolo(activity),
          isSoloFlawless: this.isSoloFlawless(activity)
        };
      }

      // Method 1: Use PGCR entries (most accurate) - Primary detection method
      if (pgcr.entries && Array.isArray(pgcr.entries) && pgcr.entries.length > 0) {
        const uniquePlayers = new Set(
          pgcr.entries
            .map((e: any) => e.player?.destinyUserInfo?.membershipId)
            .filter(Boolean)
        );
        const isSolo = uniquePlayers.size === 1;
        
        if (isSolo) {
          // Check if all entries have 0 deaths for solo flawless
          const allDeaths = pgcr.entries.map((e: any) => e.values?.deaths?.basic?.value ?? 0);
          const totalDeaths = allDeaths.reduce((sum: number, d: number) => sum + d, 0);
          return {
            isSolo: true,
            isSoloFlawless: totalDeaths === 0
          };
        }
        
        return { isSolo: false, isSoloFlawless: false };
      }
      
      // Method 2: Fallback to PGCR players array (alternative format)
      if (pgcr.players && Array.isArray(pgcr.players) && pgcr.players.length > 0) {
        const uniquePlayers = new Set(
          pgcr.players.map((p: any) => p.id).filter(Boolean)
        );
        const isSolo = uniquePlayers.size === 1;
        
        if (isSolo) {
          const totalDeaths = pgcr.players.reduce((sum: number, p: any) => sum + (p.deaths ?? 0), 0);
          return {
            isSolo: true,
            isSoloFlawless: totalDeaths === 0
          };
        }
        
        return { isSolo: false, isSoloFlawless: false };
      }
    } catch (error) {
      console.warn(`[DungeonSoloFirsts] Failed to fetch PGCR for ${instanceId}, using fallback:`, error);
    }

    // Method 3: Fallback to activity values (least reliable but always available)
    return {
      isSolo: this.isSolo(activity),
      isSoloFlawless: this.isSoloFlawless(activity)
    };
  }

  async getDungeonSoloFirsts(membershipId: string): Promise<DungeonSoloFirst[]> {
    await this.initPromise;
    // Gather all stored activities for this player (all characters) limited to Destiny 2.
    const activities = await this.activities
      .where('membershipId')
      .equals(membershipId)
      .filter(activity => activity.game === 'D2') // Ensure we only process D2 activities
      .toArray();

    // Check for Shattered Throne activities for debugging if needed
    // const shatteredThroneActivities = activities.filter(activity => {
    //   const { referenceId } = activity.activityDetails;
    //   return String(referenceId) === '2032534090' || String(referenceId) === '1347078175';
    // });

    // Sort by period ascending so the earliest completions are encountered first.
    activities.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());

    const firstsMap = new Map<string, { firstSolo?: StoredActivity; firstFlawless?: StoredActivity }>();

    // Ensure we only consider activities that belong to the requested account
    const ownerActivities = activities.filter(a => a.membershipId === membershipId);

    // Collect all dungeon activities that need PGCR processing
    const dungeonActivities = ownerActivities.filter(activity => {
      if (!this.isCompletion(activity)) return false;
      const { referenceId, mode } = activity.activityDetails;
      if (!this.isDungeon(referenceId, mode)) return false;
      const family = ActivityDbService.ACTIVITY_FAMILY_MAP[String(referenceId)];
      // Allow activities in map OR activities that can be identified via manifest (like Equilibrium Normal/Master)
      if (family) return true;
      const manifestName = this.manifest.getActivityName(referenceId, false);
      return manifestName && manifestName.toLowerCase().includes('equilibrium');
    });

    // Batch fetch PGCRs for all dungeon activities to improve performance
    const instanceIds = dungeonActivities
      .map(a => a.activityDetails?.instanceId)
      .filter((id): id is string => !!id);
    
    let pgcrMap = new Map<string, any>();
    if (instanceIds.length > 0) {
      try {
        // Try to get all PGCRs from cache in batch
        const cachedPgcrMap = await this.pgcrCacheService.getBatch(instanceIds);
        pgcrMap = cachedPgcrMap;
        
        // Check which PGCRs are missing from cache
        const missingIds = await this.pgcrCacheService.getMissingPGCRs(instanceIds);
        
        if (missingIds.length > 0) {
          // Fetch missing PGCRs from API in batch (with concurrency limit)
          const concurrencyLimit = 3;
          const chunks = this.chunkArray(missingIds, concurrencyLimit);
          
          for (const chunk of chunks) {
            const promises = chunk.map(async (instanceId) => {
              try {
                const pgcr = await firstValueFrom(this.bungieService.getPGCR(instanceId, false));
                await this.pgcrCacheService.cacheD2PGCR(instanceId, pgcr);
                return { instanceId, pgcr };
              } catch (error) {
                console.warn(`[DungeonSoloFirsts] Failed to fetch PGCR ${instanceId}:`, error);
                return null;
              }
            });
            
            const results = await Promise.allSettled(promises);
            results.forEach((result) => {
              if (result.status === 'fulfilled' && result.value) {
                pgcrMap.set(result.value.instanceId, result.value.pgcr);
              }
            });
          }
        }
      } catch (error) {
        console.warn('[DungeonSoloFirsts] Batch PGCR fetch failed, will use individual lookups:', error);
      }
    }

    // Process each dungeon activity with PGCR data
    for (const activity of dungeonActivities) {
      const { referenceId, mode } = activity.activityDetails;
      let family = ActivityDbService.ACTIVITY_FAMILY_MAP[String(referenceId)];
      
      // Fallback: Use manifest name if not in map (for new dungeons like Equilibrium Normal/Master)
      if (!family) {
        const manifestName = this.manifest.getActivityName(referenceId, false);
        if (manifestName && manifestName.toLowerCase().includes('equilibrium')) {
          // Determine variant from manifest name (check for Master, Epic, Contest, etc.)
          const nameLower = manifestName.toLowerCase();
          if (nameLower.includes('master')) {
            family = 'Equilibrium: Master';
          } else if (nameLower.includes('contest')) {
            family = 'Equilibrium: Contest';
          } else if (nameLower.includes('epic')) {
            family = 'Equilibrium: Epic';
          } else {
            // Default to Standard for normal dungeon mode
            family = 'Equilibrium: Standard';
          }
        } else {
          console.warn(`[DungeonSoloFirsts] UNMAPPED dungeon hash found:`, {
            referenceId,
            mode,
            period: activity.period,
            playerCount: activity.values?.playerCount?.basic?.value,
            completed: activity.values?.completed?.basic?.value,
            manifestName: manifestName || 'unknown'
          });
          continue; // Unknown / unmapped dungeon hash.
        }
      }

      // Use the full versioned name as the key for version-specific tracking
      const versionKey = family;

      let entry = firstsMap.get(versionKey);
      if (!entry) {
        entry = {};
        firstsMap.set(versionKey, entry);
      }

      // Determine solo / flawless status using PGCR data with fallback
      const instanceId = activity.activityDetails?.instanceId;
      let solo = false;
      let flawless = false;

      if (instanceId && pgcrMap.has(instanceId)) {
        // Use cached/fetched PGCR data
        const pgcr = pgcrMap.get(instanceId);
        const result = await this.detectSoloFromPGCRWithData(activity, pgcr, membershipId);
        solo = result.isSolo;
        flawless = result.isSoloFlawless;
      } else {
        // Fallback to async PGCR lookup or activity values
        const result = await this.detectSoloFromPGCR(activity, membershipId);
        solo = result.isSolo;
        flawless = result.isSoloFlawless;
      }

      // Early exit optimisation: if we already have both firsts and this activity is not earlier, skip.
      // But we still need to process if this activity could update one of them to an earlier date.
      const activityDate = new Date(activity.period).getTime();
      const hasEarlierSolo = entry.firstSolo && new Date(entry.firstSolo.period).getTime() <= activityDate;
      const hasEarlierFlawless = entry.firstFlawless && new Date(entry.firstFlawless.period).getTime() <= activityDate;
      
      // If we have both and this activity can't improve either, skip it
      if (entry.firstSolo && entry.firstFlawless && hasEarlierSolo && hasEarlierFlawless) {
        continue;
      }

      // Enrich activity with characterClass from PGCR if available
      let pgcr: any = null;
      if (instanceId && pgcrMap.has(instanceId)) {
        pgcr = pgcrMap.get(instanceId);
      } else if (instanceId) {
        // Try to get PGCR from cache or fetch it for characterClass enrichment
        try {
          pgcr = await this.pgcrCacheService.getD2PGCR(instanceId);
          if (!pgcr) {
            const fetched = await firstValueFrom(this.bungieService.getPGCR(instanceId, false));
            if (fetched) {
              await this.pgcrCacheService.cacheD2PGCR(instanceId, fetched);
              pgcr = fetched;
            }
          }
        } catch (error) {
          // Non-fatal: if PGCR fetch fails, we simply skip class icon enrichment
        }
      }
      
      if (pgcr && !(activity as any).characterClass) {
        // Extract characterClass from PGCR
        const me = pgcr.entries?.find((e: any) => e.player?.destinyUserInfo?.membershipId === membershipId);
        if (me?.player?.characterClass) {
          (activity as any).characterClass = me.player.characterClass;
        } else if (pgcr.players && Array.isArray(pgcr.players)) {
          // Fallback: try players array
          const mePlayer = pgcr.players.find((p: any) => p.id === membershipId);
          if (mePlayer && pgcr.entries) {
            const meEntry = pgcr.entries.find((e: any) => 
              e.player?.destinyUserInfo?.membershipId === membershipId || 
              e.characterId === mePlayer.charId
            );
            if (meEntry?.player?.characterClass) {
              (activity as any).characterClass = meEntry.player.characterClass;
            }
          }
        }
      }

      // Set firstSolo if this is solo and either we don't have one yet, or this one is earlier
      if (solo) {
        if (!entry.firstSolo || activityDate < new Date(entry.firstSolo.period).getTime()) {
          entry.firstSolo = activity;
        }
      }
      
      // Set firstFlawless if this is flawless and either we don't have one yet, or this one is earlier
      // IMPORTANT: If an activity is both solo and flawless, it should set BOTH firstSolo and firstFlawless
      if (flawless) {
        if (!entry.firstFlawless || activityDate < new Date(entry.firstFlawless.period).getTime()) {
          entry.firstFlawless = activity;
        }
      }
    }

    // Convert to the public model.
    const result: DungeonSoloFirst[] = [];
    firstsMap.forEach((value, key) => {
      // Extract base dungeon name for the family field
      const baseDungeonName = this.getBaseDungeonName(key);
      const entry = { 
        family: baseDungeonName, 
        fullName: key,
        firstSolo: value.firstSolo, 
        firstFlawless: value.firstFlawless 
      };
      result.push(entry);
    });

    // Debug dungeon solo firsts results if needed
    // const debugResults = result.filter(r => r.fullName.includes('Shattered Throne'));
    // console.log(`[DungeonSoloFirsts] Results: ${debugResults.length} entries`);
    return result;
  }

  /**
   * Detects solo and solo flawless status from provided PGCR data.
   * Used when PGCR data is already available (from batch fetch).
   */
  private detectSoloFromPGCRWithData(activity: StoredActivity, pgcr: any, membershipId: string): { isSolo: boolean; isSoloFlawless: boolean } {
    // Method 1: Use PGCR entries (most accurate) - Primary detection method
    if (pgcr && pgcr.entries && Array.isArray(pgcr.entries) && pgcr.entries.length > 0) {
      const uniquePlayers = new Set(
        pgcr.entries
          .map((e: any) => e.player?.destinyUserInfo?.membershipId)
          .filter(Boolean)
      );
      const isSolo = uniquePlayers.size === 1;
      
      if (isSolo) {
        // Check if all entries have 0 deaths for solo flawless
        const allDeaths = pgcr.entries.map((e: any) => e.values?.deaths?.basic?.value ?? 0);
        const totalDeaths = allDeaths.reduce((sum: number, d: number) => sum + d, 0);
        return {
          isSolo: true,
          isSoloFlawless: totalDeaths === 0
        };
      }
      
      return { isSolo: false, isSoloFlawless: false };
    }
    
    // Method 2: Fallback to PGCR players array (alternative format)
    if (pgcr && pgcr.players && Array.isArray(pgcr.players) && pgcr.players.length > 0) {
      const uniquePlayers = new Set(
        pgcr.players.map((p: any) => p.id).filter(Boolean)
      );
      const isSolo = uniquePlayers.size === 1;
      
      if (isSolo) {
        const totalDeaths = pgcr.players.reduce((sum: number, p: any) => sum + (p.deaths ?? 0), 0);
        return {
          isSolo: true,
          isSoloFlawless: totalDeaths === 0
        };
      }
      
      return { isSolo: false, isSoloFlawless: false };
    }

    // Method 3: Fallback to activity values (least reliable but always available)
    return {
      isSolo: this.isSolo(activity),
      isSoloFlawless: this.isSoloFlawless(activity)
    };
  }

  /**
   * Extracts the base dungeon name from a versioned dungeon name.
   * e.g., "Vesper's Host: Master" -> "Vesper's Host"
   */
  private getBaseDungeonName(versionedName: string): string {
    // Remove version suffix (everything after ": ")
    const colonIndex = versionedName.indexOf(': ');
    if (colonIndex === -1) {
      return versionedName; // No version suffix
    }
    return versionedName.substring(0, colonIndex);
  }

  /**
   * Debug method to help discover unmapped dungeon activities and their manifest names
   */
  async debugDungeonActivities(membershipId: string): Promise<void> {
    await this.initPromise;
    if (!environment.debug) {
      return;
    }
    const activities = await this.activities
      .where('membershipId')
      .equals(membershipId)
      .and(activity => activity.game === 'D2')
      .toArray();

    console.log(`[DEBUG] Analyzing ${activities.length} D2 activities for dungeon detection`);

    const dungeonActivities = activities.filter(activity => {
      const { referenceId, mode } = activity.activityDetails;
      return this.isDungeon(referenceId, mode);
    });

    console.log(`[DEBUG] Found ${dungeonActivities.length} dungeon activities`);

    const hashCounts = new Map<string, { count: number; manifestName?: string; family?: string; periods: string[] }>();

    for (const activity of dungeonActivities) {
      const { referenceId, mode } = activity.activityDetails;
      const hashStr = String(referenceId);
      const family = ActivityDbService.ACTIVITY_FAMILY_MAP[hashStr];
      const manifestName = this.manifest.getActivityName(referenceId, false);
      
      if (!hashCounts.has(hashStr)) {
        hashCounts.set(hashStr, { count: 0, manifestName, family, periods: [] });
      }
      
      const entry = hashCounts.get(hashStr)!;
      entry.count++;
      entry.periods.push(activity.period);
    }

    console.log(`[DEBUG] Dungeon activity hash analysis:`);
    for (const [hash, data] of hashCounts) {
      console.log(`Hash: ${hash}`, {
        count: data.count,
        manifestName: data.manifestName,
        mappedFamily: data.family,
        isMapped: !!data.family,
        latestPeriod: data.periods.sort().pop()
      });
    }
  }

  /** Returns how many activities we have stored for the given list of membershipIds */
  async countActivitiesForMemberships(membershipIds: string[]): Promise<number> {
    await this.initPromise;
    if (!membershipIds?.length) return 0;
    return this.activities.where('membershipId').anyOf(membershipIds).count();
  }

  /**
   * Returns how many activities we have stored for a specific membershipId and game.
   * Used by Account Summary so Destiny 1 and Destiny 2 profiles on the same platform
   * don't share the same activity count.
   */
  async countActivitiesForMembershipAndGame(membershipId: string, game: 'D1' | 'D2'): Promise<number> {
    await this.initPromise;
    if (!membershipId) return 0;
    return this.activities
      .where('membershipId')
      .equals(membershipId)
      .and(a => a.game === game)
      .count();
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

  /**
   * Returns a lightweight account summary for the specified membershipId.
   * - totalTime: sum of timePlayedSeconds across all stored activities
   * - totalActivities: number of stored activities
   * - totalSeals: placeholder (0). Kept for compatibility with exporters
   * - totalFirsts: count of unique raid/dungeon families with at least one completion
   */
  async getAccountSummary(membershipId: string): Promise<{
    totalTime: number;
    totalActivities: number;
    totalSeals: number;
    totalFirsts: number;
  }> {
    await this.initPromise;
    const acts = await this.activities
      .where('membershipId')
      .equals(membershipId)
      .toArray();

    const totalActivities = acts.length;
    const totalTime = acts.reduce((sum, a) => sum + this.getActivityDurationSeconds(a), 0);

    // Unique families with at least one valid completion
    const completedFamilies = new Set<string>();
    for (const a of acts) {
      if (!this.isCompletion(a)) continue;
      const referenceId = (a as any)?.activityDetails?.referenceId;
      const mode = (a as any)?.activityDetails?.mode;
      if (!referenceId) continue;

      let family: string | undefined;
      const type = this.manifest.getActivityType(referenceId, mode);
      const game = (a as any).game as 'D1' | 'D2' | undefined;

      if (game === 'D1') {
        family = ActivityDbService.D1_FAMILY_MAP[String(referenceId)];
      } else if (type === 'raid' || type === 'dungeon') {
        family = ActivityDbService.ACTIVITY_FAMILY_MAP[String(referenceId)];
      }
      if (!family) continue;
      completedFamilies.add(family);
    }

    return {
      totalTime,
      totalActivities,
      totalSeals: 0,
      totalFirsts: completedFamilies.size,
    };
  }

  // Phase 3: Memory Management & Caching Optimization Methods

  /**
   * Get all favorite accounts
   */
  async getFavoriteAccounts(): Promise<FavoriteAccount[]> {
    await this.initPromise;
    return this.favorites.toArray();
  }

  /**
   * Update last sync time for a favorite account
   */
  async updateFavoriteLastSync(membershipId: string): Promise<void> {
    await this.initPromise;
    const favorite = await this.favorites.where('membershipId').equals(membershipId).first();
    if (favorite) {
      favorite.lastUpdated = new Date().toISOString();
      await this.favorites.put(favorite);
    }
  }

  /**
   * Debug method to check what activities are stored for a specific player
   */
  async debugPlayerActivities(membershipId: string): Promise<void> {
    await this.initPromise;
    if (!environment.debug) {
      return;
    }

    console.log(`[DEBUG] Checking activities for player ${membershipId}`);
    
    // Get all activities for this player
    const allActivities = await this.activities
      .where('membershipId')
      .equals(membershipId)
      .toArray();
    
    console.log(`[DEBUG] Total activities for player: ${allActivities.length}`);
    
    // Check for Shattered Throne specifically
    const shatteredThroneActivities = allActivities.filter(activity => {
      const referenceId = activity.activityDetails?.referenceId;
      return String(referenceId) === '2032534090' || String(referenceId) === '1347078175';
    });
    
    console.log(`[DEBUG] Shattered Throne activities found: ${shatteredThroneActivities.length}`);
    
    if (shatteredThroneActivities.length > 0) {
      console.log(`[DEBUG] Shattered Throne activities:`, shatteredThroneActivities.map(a => ({
        referenceId: a.activityDetails.referenceId,
        mode: a.activityDetails.mode,
        period: a.period,
        playerCount: a.values?.playerCount?.basic?.value,
        completed: a.values?.completed?.basic?.value,
        deaths: a.values?.deaths?.basic?.value,
        isDungeon: this.isDungeon(a.activityDetails.referenceId, a.activityDetails.mode),
        isCompletion: this.isCompletion(a),
        isSolo: this.isSolo(a),
        isSoloFlawless: this.isSoloFlawless(a)
      })));
    }
    
    // Check for any dungeon activities
    const dungeonActivities = allActivities.filter(activity => {
      const { referenceId, mode } = activity.activityDetails;
      return this.isDungeon(referenceId, mode);
    });
    
    console.log(`[DEBUG] Total dungeon activities: ${dungeonActivities.length}`);
    
    if (dungeonActivities.length > 0) {
      console.log(`[DEBUG] Dungeon activities:`, dungeonActivities.map(a => ({
        referenceId: a.activityDetails.referenceId,
        mode: a.activityDetails.mode,
        period: a.period,
        playerCount: a.values?.playerCount?.basic?.value,
        completed: a.values?.completed?.basic?.value,
        isDungeon: this.isDungeon(a.activityDetails.referenceId, a.activityDetails.mode)
      })));
    }
  }

  /**
   * Gets data from LRU cache with automatic cleanup
   */
  private getFromCache<T>(cache: LRUCache<T>, key: string): T | undefined {
    const entry = cache.data.get(key);
    if (!entry) return undefined;

    // Check TTL (use activities TTL as default)
    if (Date.now() - entry.timestamp > this.CACHE_TTL.activities) {
      cache.data.delete(key);
      return undefined;
    }

    // Update access count and timestamp for LRU
    entry.accessCount++;
    entry.timestamp = Date.now();
    
    // Move to end (most recently used)
    cache.data.delete(key);
    cache.data.set(key, entry);
    
    return entry.data;
  }



  /**
   * Sets data in LRU cache with automatic size management
   */
  private setInCache<T>(cache: LRUCache<T>, key: string, data: T): void {
    // Remove oldest entries if cache is full
    if (cache.data.size >= cache.maxSize) {
      const oldestKey = cache.data.keys().next().value;
      if (oldestKey !== undefined) {
        cache.data.delete(oldestKey);
      }
    }

    cache.data.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1
    });

    // Schedule cleanup if needed
    this.scheduleCleanup();
  }

  /**
   * Clears expired cache entries and performs memory cleanup
   */
  private performCacheCleanup(): void {
    const now = Date.now();
    
    // Clean up expired entries from all caches
    [this.activitiesCache, this.filteredActivitiesCache, this.firstEverActivities, this.wastedTimes, this.wastedSeals]
      .forEach(cache => {
        for (const [key, entry] of cache.data.entries()) {
          if (now - entry.timestamp > this.CACHE_TTL.activities) {
            cache.data.delete(key);
          }
        }
      });

    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }

    this.lastCleanup = now;
  }

  /**
   * Schedules periodic cache cleanup
   */
  private scheduleCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }

    this.cleanupTimer = setTimeout(() => {
      this.performCacheCleanup();
      this.scheduleCleanup(); // Schedule next cleanup
    }, this.MEMORY_CLEANUP_INTERVAL);
  }

  /**
   * Manually clears all caches (useful for testing or memory pressure)
   */
  clearAllCaches(): void {
    if (environment.debug) {
      console.log('[CLEAR] Clearing all ActivityDbService caches');
    }

    // Clear all LRU caches
    this.activitiesCache.data.clear();
    this.filteredActivitiesCache.data.clear();
    this.firstEverActivities.data.clear();
    this.wastedTimes.data.clear();
    this.wastedSeals.data.clear();
    this.guardianFirstsCache.data.clear();
    this.dungeonFirstsCache.data.clear();
    
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    // Reset cleanup tracking
    this.lastCleanup = Date.now();

    if (environment.debug) {
      console.log('[CLEAR] All ActivityDbService caches cleared');
    }
  }

  /**
   * Gets cache statistics for monitoring
   */
  getCacheStats(): any {
    return {
      activitiesCache: {
        size: this.activitiesCache.data.size,
        maxSize: this.activitiesCache.maxSize
      },
      filteredActivitiesCache: {
        size: this.filteredActivitiesCache.data.size,
        maxSize: this.filteredActivitiesCache.maxSize
      },
      firstEverActivities: {
        size: this.firstEverActivities.data.size,
        maxSize: this.firstEverActivities.maxSize
      },
      wastedTimes: {
        size: this.wastedTimes.data.size,
        maxSize: this.wastedTimes.maxSize
      },
      wastedSeals: {
        size: this.wastedSeals.data.size,
        maxSize: this.wastedSeals.maxSize
      },
      lastCleanup: this.lastCleanup,
      memoryUsage: (performance as any).memory ? {
        usedJSHeapSize: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
        totalJSHeapSize: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024),
        jsHeapSizeLimit: Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024)
      } : 'Not available'
    };
  }

  /**
   * Optimized method to get activities by date using cache
   */
  async getActivitiesByDateCached(date: string, year?: number): Promise<StoredActivity[]> {
    await this.initPromise;
    
    const cacheKey = `date_${date}_${year || 'all'}`;
    const cached = this.getFromCache(this.activitiesCache, cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let activities: StoredActivity[];
      
      if (year) {
        // Query specific year
        const startDate = new Date(year, 0, 1).toISOString();
        const endDate = new Date(year, 11, 31, 23, 59, 59).toISOString();
        activities = await this.activities
          .where('period')
          .between(startDate, endDate, true, true)
          .toArray();
      } else {
        // Query all years
        activities = await this.activities.toArray();
      }

      // Filter by date if specified
      if (date !== 'all') {
        const targetDate = new Date(date);
        const targetDateStr = targetDate.toISOString().split('T')[0];
        activities = activities.filter(activity => {
          const activityDate = new Date(activity.period);
          const activityDateStr = activityDate.toISOString().split('T')[0];
          return activityDateStr === targetDateStr;
        });
      }

      // Cache the result
      this.setInCache(this.activitiesCache, cacheKey, activities);
      
      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting activities by date:', error);
      return [];
    }
  }

  /**
   * Optimized method to get filtered activities using cache
   */
  async getFilteredActivities(
    membershipId: string,
    game: 'D1' | 'D2',
    filters: any = {}
  ): Promise<StoredActivity[]> {
    await this.initPromise;
    
    const cacheKey = `filtered_${membershipId}_${game}_${JSON.stringify(filters)}`;
    const cached = this.getFromCache(this.filteredActivitiesCache, cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let query = this.activities
        .where('membershipId')
        .equals(membershipId)
        .filter(activity => activity.game === game);

      // Apply additional filters
      if (filters.characterId) {
        query = query.filter(activity => activity.characterId === filters.characterId);
      }
      if (filters.mode !== undefined) {
        query = query.filter(activity => activity.activityDetails?.mode === filters.mode);
      }
      if (filters.startDate && filters.endDate) {
        query = query.filter(activity => {
          const period = new Date(activity.period);
          return period >= filters.startDate && period <= filters.endDate;
        });
      }

      const activities = await query.toArray();
      
      // Cache the result
      this.setInCache(this.filteredActivitiesCache, cacheKey, activities);
      
      return activities;
    } catch (error) {
      console.error('[Dexie] Error getting filtered activities:', error);
      return [];
    }
  }
} 