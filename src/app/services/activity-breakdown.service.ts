import { Injectable } from '@angular/core';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { PGCRCacheService } from './pgcr-cache.service';

export interface ActivityCountRow {
  referenceId: string;
  game: 'D1' | 'D2';
  /** Family/base activity name, e.g. \"Lake of Shadows\" or \"Hellas Fortitude, Mars\" */
  baseName: string;
  /** Variant or role, e.g. \"Nightfall Grandmaster\", \"Nightfall\", \"Smuggle\", \"Bounty Hunt\" */
  variantName: string;
  /** Bungie API DestinyActivityModeType (activityDetails.mode). Used for grouping sections. */
  mode: number;
  /** Total runs (activity history rows) for this combo */
  runs: number;
  /** Runs where completed == 1 */
  clears: number;
  /** runs - clears */
  fails: number;
  /** Total time played across all runs, in seconds */
  timeSeconds: number;
}

/**
 * DestinyActivityModeType enum from Bungie API (bungie-api-ts/destiny2/interfaces).
 * Maps mode number to display name for breakdown section headers.
 */
const DESTINY_ACTIVITY_MODE_NAMES: Record<number, string> = {
  0: 'None',
  2: 'Story',
  3: 'Strike',
  4: 'Raid',
  5: 'AllPvP',
  6: 'Patrol',
  7: 'AllPvE',
  9: 'Reserved9',
  10: 'Control',
  11: 'Reserved11',
  12: 'Clash',
  13: 'Reserved13',
  15: 'CrimsonDoubles',
  16: 'Nightfall',
  17: 'HeroicNightfall',
  18: 'AllStrikes',
  19: 'IronBanner',
  20: 'Reserved20',
  21: 'Reserved21',
  22: 'Reserved22',
  24: 'Reserved24',
  25: 'AllMayhem',
  26: 'Reserved26',
  27: 'Reserved27',
  28: 'Reserved28',
  29: 'Reserved29',
  30: 'Reserved30',
  31: 'Supremacy',
  32: 'PrivateMatchesAll',
  37: 'Survival',
  38: 'Countdown',
  39: 'TrialsOfTheNine',
  40: 'Social',
  41: 'TrialsCountdown',
  42: 'TrialsSurvival',
  43: 'IronBannerControl',
  44: 'IronBannerClash',
  45: 'IronBannerSupremacy',
  46: 'ScoredNightfall',
  47: 'ScoredHeroicNightfall',
  48: 'Rumble',
  49: 'AllDoubles',
  50: 'Doubles',
  51: 'PrivateMatchesClash',
  52: 'PrivateMatchesControl',
  53: 'PrivateMatchesSupremacy',
  54: 'PrivateMatchesCountdown',
  55: 'PrivateMatchesSurvival',
  56: 'PrivateMatchesMayhem',
  57: 'PrivateMatchesRumble',
  58: 'HeroicAdventure',
  59: 'Showdown',
  60: 'Lockdown',
  61: 'Scorched',
  62: 'ScorchedTeam',
  63: 'Gambit',
  64: 'AllPvECompetitive',
  65: 'Breakthrough',
  66: 'BlackArmoryRun',
  67: 'Salvage',
  68: 'IronBannerSalvage',
  69: 'PvPCompetitive',
  70: 'PvPQuickplay',
  71: 'ClashQuickplay',
  72: 'ClashCompetitive',
  73: 'ControlQuickplay',
  74: 'ControlCompetitive',
  75: 'GambitPrime',
  76: 'Reckoning',
  77: 'Menagerie',
  78: 'VexOffensive',
  79: 'NightmareHunt',
  80: 'Elimination',
  81: 'Momentum',
  82: 'Dungeon',
  83: 'Sundial',
  84: 'TrialsOfOsiris',
  85: 'Dares',
  86: 'Offensive',
  87: 'LostSector',
  88: 'Rift',
  89: 'ZoneControl',
  90: 'IronBannerRift',
  91: 'IronBannerZoneControl',
  92: 'Relic'
};

/** Display order for activity modes in the breakdown view. Lower = earlier. Unknown modes use 999. */
const MODE_ORDER: Record<number, number> = {
  4: 0,   // Raid
  82: 1,  // Dungeon
  16: 2, 17: 2, 46: 2, 47: 2,  // Nightfall variants
  3: 3, 18: 3,  // Strike, AllStrikes
  2: 4,   // Story
  87: 5,  // LostSector
  92: 6, 85: 6, 83: 6, 77: 6, 78: 6, 86: 6,  // Relic, Dares, Sundial, Menagerie, VexOffensive, Offensive
  63: 7, 75: 7, 76: 7, 67: 7,  // Gambit
  5: 8, 10: 8, 12: 8, 19: 8, 84: 8, 37: 8, 38: 8, 48: 8, 50: 8, 31: 8, 59: 8, 60: 8, 65: 8, 88: 8, 89: 8,  // PvP modes
  43: 8, 44: 8, 45: 8, 68: 8, 90: 8, 91: 8,  // Iron Banner PvP
  69: 8, 70: 8, 71: 8, 72: 8, 73: 8, 74: 8,  // Competitive/Quickplay
  79: 9, 80: 9, 81: 9, 58: 9, 64: 9, 66: 9,  // NightmareHunt, Elimination, Momentum, HeroicAdventure, AllPvECompetitive, BlackArmoryRun
  6: 10, 7: 10, 40: 10,  // Patrol, AllPvE, Social
  0: 11,  // None
  // Reserved and other: 999
};
const MODE_ORDER_DEFAULT = 999;

/**
 * Story missions by campaign/expansion for consistent ordering when APIs/manifest
 * don't provide season. Sourced from community/wiki (e.g. d2.destinygamewiki.com).
 * Key: lowercase activity base name; value: season label and release order.
 */
const STORY_CAMPAIGN_BY_BASE_NAME: Record<string, { season: string; order: number }> = (() => {
  const entries: [string, { season: string; order: number }][] = [];
  const add = (order: number, season: string, ...names: string[]) => {
    for (const n of names) {
      const key = n.toLowerCase().trim();
      if (key) entries.push([key, { season, order }]);
    }
  };
  // Red War (vaulted) - order 0
  add(0, 'Red War',
    'Homecoming', 'Adieu', 'Spark', 'Combustion', 'Hope', 'Riptide', 'Utopia',
    'Looped', 'Six', 'Sacrilege', 'Fury', 'Payback', 'Unbroken', 'Larceny', '1AU', 'Chosen');
  // Curse of Osiris (vaulted) - order 1
  add(1, 'Curse of Osiris',
    'The Gateway', 'A Deadly Trial', 'Beyond Infinity', 'Deep Storage',
    'Tree of Probabilities', 'Hijacked', 'A Garden World', 'Omega');
  // Warmind (vaulted) - order 2
  add(2, 'Warmind',
    'Ice and Shadow', 'Pilgrimage', 'Off-World Recovery', 'Strange Terrain',
    'Will of the Thousands', 'Nodus');
  // Forsaken - order 3 (Dreaming City + vaulted Tangled Shore)
  add(3, 'Forsaken',
    'Awakening', 'Broken Courier', 'The Oracle Engine', 'Dark Monastery',
    'Last Call', 'The Rider', 'The Trickster', 'Hollowed Lair', 'The Machinist',
    'Nothing Left to Say', 'High Plains Blues', 'Riding the Storm', 'The Rifleman',
    'The Hangman', 'The Mad Bomber');
  // Shadowkeep - order 4
  add(4, 'Shadowkeep',
    'A Mysterious Disturbance', 'In Search of Answers', 'Ghosts of Our Past',
    'The Scarlet Keep', 'In the Deep', 'The Nightmare Cometh', 'Beyond');
  // Beyond Light - order 5
  add(5, 'Beyond Light',
    "Darkness's Doorstep", 'The New Kell', 'Rising Resistance', 'A Link to the Future',
    'Eventide Ruins', 'Asterion Abyss', 'The Warrior', 'Bray Exoscience', 'Praksis',
    'The Technocrat', 'The Divide', 'Riis-Reborn Approach', 'Fallen Skiff', 'The Kell of Darkness');
  // The Witch Queen - order 6
  add(6, 'The Witch Queen',
    'The Arrival', 'The Investigation', 'The Ghosts', 'The Communion', 'The Mirror',
    'Memories of Ruin', 'The Cunning', 'The Last Chance', 'Memories of Loss', 'The Ritual');
  // Lightfall - order 7
  add(7, 'Lightfall',
    'First Contact', 'Under Siege', 'Downfall', 'Breakneck', 'On The Verge',
    'No Time Left', 'Headlong', 'Desperate Measures');
  // The Final Shape - order 8
  add(8, 'The Final Shape',
    'Transmigration', 'Temptation', 'Exegesis', 'Requiem', 'Ascent', 'Dissent', 'Iconoclasm', 'Excision');
  return Object.fromEntries(entries);
})();

const STORY_UNKNOWN_ORDER = 999;
const STORY_UNKNOWN_SEASON = 'Other';

/**
 * Exotic missions by release order for consistent ordering in the breakdown.
 * Key: lowercase activity base name; value: display order (0 = oldest).
 * Sourced from wiki/community (e.g. Exotic Mission Rotator, Destructoid).
 */
const EXOTIC_MISSION_ORDER: Record<string, number> = (() => {
  const entries: [string, number][] = [];
  const add = (order: number, ...names: string[]) => {
    for (const n of names) {
      const key = n.toLowerCase().trim();
      if (key) entries.push([key, order]);
    }
  };
  add(0, "the whisper");
  add(1, "zero hour");
  add(2, "the other side");
  add(3, "harbinger");
  add(4, "presage");
  add(5, "a hollow coronation");
  add(6, "vox obscura");
  add(7, "operation: seraph's shield", "seraph's shield", "operation: seraphs shield", "seraphs shield");
  add(8, "node.ovrd.avalon", "avalon", "node ovrd avalon");
  add(9, "starcrossed");
  return Object.fromEntries(entries);
})();

const EXOTIC_MISSION_UNKNOWN_ORDER = 999;

/** Raid release order (same as Guardian Firsts view). Index = display order. */
const RAID_RELEASE_ORDER_D1 = ['vault of glass', "crota's end", "king's fall", 'wrath of the machine'];
const RAID_RELEASE_ORDER_D2 = [
  'leviathan', "leviathan, eater of worlds", 'leviathan, spire of stars', 'last wish', 'scourge of the past',
  'crown of sorrow', 'garden of salvation', 'deep stone crypt', 'vault of glass', "king's fall",
  'vow of the disciple', 'root of nightmares', "crota's end", "salvation's edge"
];
/** Dungeon release order (D2 only; same as Firsts view). */
const DUNGEON_RELEASE_ORDER = [
  'the shattered throne', 'pit of heresy', 'prophecy', 'grasp of avarice', 'duality',
  'spire of the watcher', 'ghosts of the deep', "warlord's ruin", "vesper's host", 'sundered doctrine', 'equilibrium'
];
const RELEASE_ORDER_UNKNOWN = 999;

/**
 * Dungeon/raid encounter names that should not appear as standalone rows in the breakdown.
 * These are sub-activities (e.g. encounter nodes) that belong to a parent activity;
 * showing them separately would mis-categorize them (e.g. under Patrol).
 */
const EXCLUDE_FROM_BREAKDOWN = new Set<string>([
  'locus of wailing grief', // Warlord's Ruin encounter
  // Add more encounter names as needed, e.g. other dungeon/raid encounter nodes
]);

/**
 * Name-based section overrides. Activities matching these rules are grouped into
 * dedicated sections regardless of DestinyActivityModeType. Order of checks:
 * Battlegrounds → Story Strikes → Exotic Story Missions → Seasonal Arena.
 * See docs/activity-breakdown-curated-lists.md for full lists.
 */
type SectionOverrideKey = 'battlegrounds' | 'story-strikes' | 'exotic-story-missions' | 'seasonal-arena';

const BATTLEGROUNDS_MODES = new Set([2, 3, 18, 46, 47, 86]);
const STORY_STRIKES_MODES = new Set([2]);

const STORY_STRIKES_BASE_NAMES = new Set([
  'shattered realm', 'override', 'operation', 'the verdant forest', 'verdant forest',
  'haunted forest', 'the haunted forest', 'firewalled verdant forest', 'firewalled haunted forest'
]);
const EXOTIC_STORY_MODES = new Set([2]);
const SEASONAL_ARENA_MODES = new Set([2, 16, 86]);

const SEASONAL_ARENA_BASE_NAMES = new Set([
  'the coil', 'contest of elders', 'guardian games', 'deep dives', 'enigma protocol',
  'european aerial zone', 'tomb of elders', 'haunted altars of sorrow', 'salvage',
  'the wellspring', 'ketchcrash', "savathûn's spire", 'savathuns spire', 'the nether'
]);

const EXOTIC_STORY_BASE_NAMES = new Set([
  'encore', "kell's fall", 'kells fall', 'exotic mission "derealize"', 'derealize',
  '//node.ovrd.avalon//', 'avalon', 'node.ovrd.avalon', 'a hollow coronation',
  'harbinger', 'presage', 'starcrossed', 'the whisper', 'zero hour', 'vox obscura',
  "operation: seraph's shield", "seraph's shield", "operation: seraphs shield",
  'seraphs shield'
]);

/** Display order for override sections. Lower = earlier. */
const SECTION_OVERRIDE_ORDER: Record<SectionOverrideKey, number> = {
  battlegrounds: 35,         // After Strike (3), before Story (4)
  'story-strikes': 41,       // After Story (4)
  'exotic-story-missions': 42,
  'seasonal-arena': 6        // With rotators (Dares, Menagerie, Offensive, etc.)
};

const SECTION_OVERRIDE_LABELS: Record<SectionOverrideKey, string> = {
  battlegrounds: 'Battlegrounds',
  'story-strikes': 'Story Strikes',
  'exotic-story-missions': 'Exotic Story Missions',
  'seasonal-arena': 'Seasonal Arena'
};

/** Seasonal Arena sort order by release; unknown sort last. */
const SEASONAL_ARENA_ORDER: Record<string, number> = (() => {
  const list = [
    'the coil', 'contest of elders', 'guardian games', 'deep dives', 'enigma protocol',
    'european aerial zone', 'tomb of elders', 'haunted altars of sorrow', 'salvage',
    'the wellspring', 'ketchcrash', "savathûn's spire", 'savathuns spire', 'the nether'
  ];
  const m = new Map<string, number>();
  list.forEach((n, i) => m.set(n, i));
  return Object.fromEntries(m);
})();
const SEASONAL_ARENA_UNKNOWN = 999;

/**
 * Social spaces and patrol destinations for reference (optional future grouping).
 * D1: The Tower (Original), Vestian Outpost, The Lighthouse, Iron Temple.
 * D2: The Tower (Current), The Farm, H.E.L.M., The Enclave, Eliksni Quarter.
 * Patrol: EDZ, Cosmodrome, Nessus, The Moon, Dreaming City, Europa, Throne World, Neomuna, Pale Heart; vaulted: Titan, Io, Mercury, Mars, Tangled Shore, Derelict Leviathan; D1: Cosmodrome, The Moon, Venus, Mars, Dreadnaught, Plaguelands.
 */
export const SOCIAL_SPACE_AND_PATROL_REF = {
  socialD1: ['The Tower (Original)', 'Vestian Outpost', 'The Lighthouse', 'Iron Temple'],
  socialD2: ['The Tower (Current)', 'The Farm', 'H.E.L.M.', 'The Enclave', 'Eliksni Quarter'],
  patrolD2: ['European Dead Zone (EDZ)', 'Cosmodrome', 'Nessus', 'The Moon', 'Dreaming City', 'Europa', "Savathûn's Throne World", 'Neomuna', 'The Pale Heart'],
  patrolD2Vaulted: ['Titan', 'Io', 'Mercury', 'Mars', 'Tangled Shore', 'Derelict Leviathan'],
  patrolD1: ['Cosmodrome', 'The Moon', 'Venus', 'Mars', 'Dreadnaught', 'Plaguelands']
};

@Injectable({
  providedIn: 'root'
})
export class ActivityBreakdownService {

  constructor(
    private activityDb: ActivityDbService,
    private manifest: DestinyManifestService,
    private pgcrCache: PGCRCacheService
  ) {}

  /**
   * Get activity duration in seconds. Same logic for D1 and D2: read from stored activity.
   * Supports D2 shape (timePlayedSeconds) and D1 alternate keys (secondsPlayed, activityDurationSeconds, or top-level).
   */
  private getActivityDurationSeconds(a: StoredActivity): number {
    const v = (a as any).values;
    if (v?.timePlayedSeconds?.basic?.value != null) return Number(v.timePlayedSeconds.basic.value);
    if (v?.secondsPlayed?.basic?.value != null) return Number(v.secondsPlayed.basic.value);
    if (v?.activityDurationSeconds?.basic?.value != null) return Number(v.activityDurationSeconds.basic.value);
    if (typeof v?.secondsPlayed === 'number') return v.secondsPlayed;
    if (typeof v?.timePlayedSeconds === 'number') return v.timePlayedSeconds;
    if (typeof v?.activityDurationSeconds === 'number') return v.activityDurationSeconds;
    const raw = a as any;
    if (typeof raw.secondsPlayed === 'number') return raw.secondsPlayed;
    if (typeof raw.timePlayedSeconds === 'number') return raw.timePlayedSeconds;
    if (raw?.values?.timePlayedSeconds != null && typeof raw.values.timePlayedSeconds === 'number') return raw.values.timePlayedSeconds;
    return 0;
  }

  /**
   * Aggregates activity counts per (referenceId, game) across all given memberships.
   * Uses all characters under each membership. Resolves names and types from the manifest.
   */
  async getActivityCounts(membershipIds: string[]): Promise<ActivityCountRow[]> {
    if (membershipIds.length === 0) return [];

    const allActivities: StoredActivity[] = [];
    for (const membershipId of membershipIds) {
      const list = await this.activityDb.getAllActivitiesForMembershipOptimized(membershipId);
      allActivities.push(...list);
    }

    // Aggregate per (referenceId, game). For D1 we also track instanceIds so we can backfill time from PGCR when activity history has no duration.
    const aggByKey = new Map<string, { runs: number; clears: number; timeSeconds: number; mode?: number }>();
    const instanceIdsByKey = new Map<string, string[]>();

    for (const a of allActivities) {
      const refId = a.activityDetails?.referenceId;
      if (refId == null || refId === '') continue;
      const game: 'D1' | 'D2' = a.game || 'D2';
      const key = `${refId}|${game}`;
      const existing = aggByKey.get(key) || { runs: 0, clears: 0, timeSeconds: 0, mode: undefined };
      existing.runs += 1;
      const completed = a.values?.completed?.basic?.value === 1;
      if (completed) {
        existing.clears += 1;
      }
      const seconds = this.getActivityDurationSeconds(a);
      existing.timeSeconds += seconds;
      if (existing.mode === undefined && a.activityDetails?.mode !== undefined) {
        existing.mode = a.activityDetails.mode;
      }
      aggByKey.set(key, existing);
      const instanceId = a.activityDetails?.instanceId != null ? String(a.activityDetails.instanceId) : undefined;
      if (instanceId) {
        const list = instanceIdsByKey.get(key) || [];
        list.push(instanceId);
        instanceIdsByKey.set(key, list);
      }
    }

    const rows: ActivityCountRow[] = [];
    for (const [key, agg] of aggByKey) {
      const [referenceId, game] = key.split('|');
      const isD1 = game === 'D1';
      const name = this.manifest.getActivityName(referenceId, isD1);
      const mode = agg.mode ?? 0;
      const parts = this.manifest.getActivityBreakdownParts(referenceId, isD1);
      const baseName = parts.baseName || name || `Unknown (${referenceId})`;
      const baseNameLower = baseName.toLowerCase().trim();

      // Exclude dungeon/raid encounter nodes so they don't appear as standalone activities
      if (EXCLUDE_FROM_BREAKDOWN.has(baseNameLower)) continue;

      const variantName = parts.variantName || '';
      const runs = agg.runs;
      const clears = agg.clears;
      const fails = Math.max(0, runs - clears);
      rows.push({
        referenceId,
        game: game as 'D1' | 'D2',
        baseName,
        variantName,
        mode,
        runs,
        clears,
        fails,
        timeSeconds: agg.timeSeconds
      });
    }

    // When the stored activity has no duration (common for D1 — the D1 list API often omits it), use PGCR cache.
    // D2 list API includes duration per activity so we rarely need this; same read path for both (getActivityDurationSeconds).
    const d1ZeroTimeInstanceIds: string[] = [];
    const keyToInstanceIdsForBackfill = new Map<string, string[]>();
    for (const [key, agg] of aggByKey) {
      const [, game] = key.split('|');
      if (game !== 'D1' || agg.timeSeconds !== 0) continue;
      const ids = instanceIdsByKey.get(key);
      if (!ids?.length) continue;
      d1ZeroTimeInstanceIds.push(...ids);
      keyToInstanceIdsForBackfill.set(key, ids);
    }
    if (d1ZeroTimeInstanceIds.length > 0) {
      // D1 PGCRs are prefetched (throttled) when activity history is synced; we only read from cache here
      const pgcrBatch = await this.pgcrCache.getBatch(d1ZeroTimeInstanceIds);
      for (const row of rows) {
        if (row.game !== 'D1' || row.timeSeconds !== 0) continue;
        const key = `${row.referenceId}|${row.game}`;
        const ids = keyToInstanceIdsForBackfill.get(key);
        if (!ids?.length) continue;
        let sum = 0;
        for (const id of ids) {
          const pgcr = pgcrBatch.get(id);
          if (pgcr?.duration != null) sum += pgcr.duration;
        }
        if (sum > 0) row.timeSeconds = sum;
      }
    }

    // Optional deduplication step: merge different variants of the same activity
    // (e.g. normal vs. Nightfall versions of the same strike) into a single row
    // using the manifest's activity family name.
    const familyMap = new Map<string, ActivityCountRow>();
    for (const row of rows) {
      // Group by base activity + variant + game + type so that distinct
      // variants (e.g. Nightfall vs Grandmaster) stay separate, but exact
      // duplicates merge.
      const key = `${row.baseName}|${row.variantName}|${row.game}|${row.mode}`;
      const existing = familyMap.get(key);
      if (!existing) {
        familyMap.set(key, { ...row });
      } else {
        existing.runs += row.runs;
        existing.clears += row.clears;
        existing.fails += row.fails;
        existing.timeSeconds += row.timeSeconds;
      }
    }

    const dedupedRows = Array.from(familyMap.values());

    const modeOrder = (m: number) => MODE_ORDER[m] ?? MODE_ORDER_DEFAULT;
    dedupedRows.sort((a, b) => {
      const orderA = modeOrder(a.mode);
      const orderB = modeOrder(b.mode);
      if (orderA !== orderB) return orderA - orderB;
      const runDiff = b.runs - a.runs;
      if (runDiff !== 0) return runDiff;
      // Within the same type and count, sort by base name then variant.
      const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
      if (baseCmp !== 0) return baseCmp;
      return (a.variantName || '').localeCompare(b.variantName || '');
    });

    return dedupedRows;
  }

  /**
   * Resolve story mission to campaign/season for ordering. Uses curated list when
   * manifest/API don't provide season. Unknown missions sort last.
   */
  getStorySortKey(baseName: string): { order: number; season: string } {
    const key = (baseName || '').toLowerCase().trim();
    const entry = STORY_CAMPAIGN_BY_BASE_NAME[key];
    return entry ?? { order: STORY_UNKNOWN_ORDER, season: STORY_UNKNOWN_SEASON };
  }

  /** Exotic mission sort order by release; unknown missions sort last. */
  getExoticMissionSortKey(baseName: string): number {
    const key = (baseName || '').toLowerCase().trim();
    return EXOTIC_MISSION_ORDER[key] ?? EXOTIC_MISSION_UNKNOWN_ORDER;
  }

  /** Raid sort order by release (same as Firsts view); unknown sort last. */
  getRaidSortKey(baseName: string, game: 'D1' | 'D2'): number {
    const key = (baseName || '').toLowerCase().trim();
    const order = game === 'D1' ? RAID_RELEASE_ORDER_D1 : RAID_RELEASE_ORDER_D2;
    const idx = order.indexOf(key);
    return idx >= 0 ? idx : RELEASE_ORDER_UNKNOWN;
  }

  /** Dungeon sort order by release (D2); unknown sort last. */
  getDungeonSortKey(baseName: string): number {
    const key = (baseName || '').toLowerCase().trim();
    const idx = DUNGEON_RELEASE_ORDER.indexOf(key);
    return idx >= 0 ? idx : RELEASE_ORDER_UNKNOWN;
  }

  /**
   * Determine if a row belongs to a name-based override section. Returns the override key or null.
   * Order of checks: Battlegrounds → Story Strikes → Exotic Story Missions → Seasonal Arena.
   */
  private getSectionOverride(row: ActivityCountRow): SectionOverrideKey | null {
    const base = (row.baseName || '').toLowerCase().trim();
    const mode = row.mode ?? 0;

    if (BATTLEGROUNDS_MODES.has(mode) && base.includes('battleground')) return 'battlegrounds';

    if (STORY_STRIKES_MODES.has(mode)) {
      if (base.includes('pirate hideout')) return 'story-strikes';
      if (base.startsWith('sever - ') || base === 'sever') return 'story-strikes';
      if (STORY_STRIKES_BASE_NAMES.has(base)) return 'story-strikes';
    }

    if (EXOTIC_STORY_MODES.has(mode)) {
      if (EXOTIC_STORY_BASE_NAMES.has(base)) return 'exotic-story-missions';
      if (base.includes('avalon') || base.includes('node.ovrd')) return 'exotic-story-missions';
    }

    if (SEASONAL_ARENA_MODES.has(mode) && SEASONAL_ARENA_BASE_NAMES.has(base)) return 'seasonal-arena';

    return null;
  }

  /** Resolve section order for grouping. Override sections use SECTION_OVERRIDE_ORDER; mode sections use MODE_ORDER. */
  private getSectionOrder(sectionKey: string, mode?: number): number {
    if (sectionKey in SECTION_OVERRIDE_ORDER) return SECTION_OVERRIDE_ORDER[sectionKey as SectionOverrideKey];
    if (mode != null) return MODE_ORDER[mode] ?? MODE_ORDER_DEFAULT;
    return MODE_ORDER_DEFAULT;
  }

  /** Group rows by section (override or mode), then by game (D1/D2). Override sections pull activities by name. */
  groupRowsByType(rows: ActivityCountRow[]): { type: string; label: string; game?: 'D1' | 'D2'; rows: ActivityCountRow[] }[] {
    // Group by (sectionKey, game). sectionKey is override key string or 'mode-N'
    const groupMap = new Map<string, Map<'D1' | 'D2', ActivityCountRow[]>>();

    for (const row of rows) {
      const override = this.getSectionOverride(row);
      const sectionKey = override ?? `mode-${row.mode ?? 0}`;
      const game = row.game || 'D2';

      if (!groupMap.has(sectionKey)) groupMap.set(sectionKey, new Map());
      const byGame = groupMap.get(sectionKey)!;
      if (!byGame.has(game)) byGame.set(game, []);
      byGame.get(game)!.push(row);
    }

    const modeOrder = (m: number) => MODE_ORDER[m] ?? MODE_ORDER_DEFAULT;
    const entries = Array.from(groupMap.entries()).sort((a, b) => {
      const [keyA, keyB] = [a[0], b[0]];
      const modeA = keyA.startsWith('mode-') ? parseInt(keyA.slice(5), 10) : undefined;
      const modeB = keyB.startsWith('mode-') ? parseInt(keyB.slice(5), 10) : undefined;
      const orderA = this.getSectionOrder(keyA, modeA);
      const orderB = this.getSectionOrder(keyB, modeB);
      if (orderA !== orderB) return orderA - orderB;
      return keyA.localeCompare(keyB);
    });

    const result: { type: string; label: string; game?: 'D1' | 'D2'; rows: ActivityCountRow[] }[] = [];
    for (const [sectionKey, byGame] of entries) {
      const isOverride = sectionKey in SECTION_OVERRIDE_LABELS;
      const labelBase = isOverride ? SECTION_OVERRIDE_LABELS[sectionKey as SectionOverrideKey] : this.modeToLabel(parseInt(sectionKey.replace('mode-', ''), 10) || 0);
      const mode = sectionKey.startsWith('mode-') ? parseInt(sectionKey.slice(5), 10) : undefined;

      const games = [...byGame.keys()].sort((a, b) => (a === 'D1' ? 0 : 1) - (b === 'D1' ? 0 : 1));
      for (const game of games) {
        const groupRows = byGame.get(game)!;
        result.push({
          type: sectionKey,
          label: `${labelBase} – ${game}`,
          game,
          rows: this.sortRowsForSection(sectionKey, mode, groupRows, game)
        });
      }
    }
    return result;
  }

  /** Sort rows within a section. Delegates to sortRowsForMode for mode sections; uses section-specific sort for overrides. */
  private sortRowsForSection(sectionKey: string, mode: number | undefined, list: ActivityCountRow[], game?: 'D1' | 'D2'): ActivityCountRow[] {
    if (sectionKey === 'seasonal-arena') {
      return list.sort((a, b) => {
        const ka = SEASONAL_ARENA_ORDER[(a.baseName || '').toLowerCase().trim()] ?? SEASONAL_ARENA_UNKNOWN;
        const kb = SEASONAL_ARENA_ORDER[(b.baseName || '').toLowerCase().trim()] ?? SEASONAL_ARENA_UNKNOWN;
        if (ka !== kb) return ka - kb;
        const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
        if (baseCmp !== 0) return baseCmp;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    }
    if (sectionKey === 'battlegrounds' || sectionKey === 'story-strikes') {
      return list.sort((a, b) => {
        const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
        if (baseCmp !== 0) return baseCmp;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    }
    if (sectionKey === 'exotic-story-missions') {
      return list.sort((a, b) => {
        const oa = this.getExoticMissionSortKey(a.baseName);
        const ob = this.getExoticMissionSortKey(b.baseName);
        if (oa !== ob) return oa - ob;
        const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
        if (baseCmp !== 0) return baseCmp;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    }
    return this.sortRowsForMode(mode ?? 0, list, game);
  }

  /** Sort rows within a mode: Story (2) by campaign; Raid (4)/Dungeon (82) by release; Relic/Dares/etc by exotic order; others by name. */
  private sortRowsForMode(mode: number, list: ActivityCountRow[], game?: 'D1' | 'D2'): ActivityCountRow[] {
    if (mode === 2) { // Story
      return list.sort((a, b) => {
        const ka = this.getStorySortKey(a.baseName);
        const kb = this.getStorySortKey(b.baseName);
        if (ka.order !== kb.order) return ka.order - kb.order;
        const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
        if (baseCmp !== 0) return baseCmp;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    }
    if (mode === 4 && game) { // Raid
      return list.sort((a, b) => {
        const oa = this.getRaidSortKey(a.baseName, game);
        const ob = this.getRaidSortKey(b.baseName, game);
        if (oa !== ob) return oa - ob;
        const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
        if (baseCmp !== 0) return baseCmp;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    }
    if (mode === 82) { // Dungeon
      return list.sort((a, b) => {
        const oa = this.getDungeonSortKey(a.baseName);
        const ob = this.getDungeonSortKey(b.baseName);
        if (oa !== ob) return oa - ob;
        const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
        if (baseCmp !== 0) return baseCmp;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    }
    // Relic (92), Dares (85), Sundial (83), Menagerie (77), and exotic-style activities
    if ([92, 85, 83, 77, 78, 86].includes(mode)) {
      return list.sort((a, b) => {
        const oa = this.getExoticMissionSortKey(a.baseName);
        const ob = this.getExoticMissionSortKey(b.baseName);
        if (oa !== ob) return oa - ob;
        const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
        if (baseCmp !== 0) return baseCmp;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    }
    // Default: sort by activity name (baseName then variantName)
    return list.sort((a, b) => {
      const baseCmp = (a.baseName || '').localeCompare(b.baseName || '');
      if (baseCmp !== 0) return baseCmp;
      return (a.variantName || '').localeCompare(b.variantName || '');
    });
  }

  private modeToLabel(mode: number): string {
    const name = DESTINY_ACTIVITY_MODE_NAMES[mode];
    if (name) return name;
    return `Mode ${mode}`;
  }
}
