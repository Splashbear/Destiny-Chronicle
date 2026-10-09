import * as fs from 'fs/promises';
import { Database } from 'duckdb-async';
import { LeanActivity } from '../types/lean-activity.types';
import { logger } from '../utils/logger';

/**
 * Tier information for multi-tier archive lookups.
 */
export interface TierInfo {
  level: 'full' | 'partial' | 'absent';
  source: 'lite' | 'extract' | 'compact_ids' | 'gap_lean' | 'merged' | 'none' | 'pending';
  indexComplete?: boolean;
  filtersApplied?: boolean;
  notes?: string[];
}

/**
 * Result from getPlayerActivitiesMultiTier with tier metadata.
 */
export interface PlayerActivitiesResult {
  activities: LeanActivity[];
  tier: TierInfo;
  knownPlayer?: boolean;
}

/**
 * W7: gap parquet `game` is untrusted (iconPath heuristic). Always expose as D2.
 */
export function forceGapLeanGame(activity: LeanActivity): LeanActivity {
  return { ...activity, game: 'D2' };
}

/**
 * Service for reading lean activities from Parquet archives using DuckDB.
 * DuckDB can read ZSTD-compressed Parquet files written by DuckDB or other tools.
 */
export class ArchiveService {
  private leanActivitiesPath: string;
  private membershipPath: string;
  private playerActivitiesLitePath: string;
  private midLightExtractDir: string;
  private compactIndexRoot: string;
  private gapIndexRoot: string;
  /** W11: optional membership_id-sorted gap root (parquet RG pruning). Prefer when complete. */
  private gapIndexSortedRoot: string;
  private enableGapLean: boolean;
  private gapRelaxComplete: boolean;
  private archiveAvailable = false;
  private db: Database | null = null;
  private bucketHashType: 'BIGINT' | 'VARCHAR' | null = null;
  /** W11: cache DESCRIBE results so each request does not reopen parquet metadata. */
  private parquetSchemaCache = new Map<string, Set<string>>();
  /** W11: cache hash(mid)%256. */
  private bucketCache = new Map<string, number>();

  constructor(
    leanActivitiesPath: string,
    membershipPath: string,
    playerActivitiesLitePath: string,
    midLightExtractDir: string,
    compactIndexRoot: string,
    gapIndexRoot: string = '',
    enableGapLean: boolean = false,
    gapIndexSortedRoot: string = '',
    gapRelaxComplete: boolean = false
  ) {
    this.leanActivitiesPath = leanActivitiesPath;
    this.membershipPath = membershipPath;
    this.playerActivitiesLitePath = playerActivitiesLitePath;
    this.midLightExtractDir = midLightExtractDir;
    this.compactIndexRoot = compactIndexRoot;
    this.gapIndexRoot = gapIndexRoot;
    this.gapIndexSortedRoot = gapIndexSortedRoot;
    this.gapRelaxComplete = gapRelaxComplete;
    this.enableGapLean = enableGapLean && !!gapIndexRoot;
  }

  /** Brief 5 Option A: whether gap ready/ merge is active. */
  isGapLeanEnabled(): boolean {
    return this.enableGapLean;
  }

  getGapIndexRoot(): string {
    return this.gapIndexRoot;
  }

  /**
   * Initialize and verify archive paths. Sets up in-memory DuckDB.
   */
  async initialize(): Promise<void> {
    if (!this.leanActivitiesPath) {
      logger.warn('Lean activities path not configured - archive lookups disabled');
      return;
    }

    try {
      await fs.access(this.leanActivitiesPath);
      
      this.db = await Database.create(':memory:');
      // W11: gap buckets are ~2.8GB; higher threads cut full-mid scans ~2× (profiled).
      const threads = Math.max(1, parseInt(process.env.PGCR_DUCKDB_THREADS || '8', 10) || 8);
      const memLimit = process.env.PGCR_DUCKDB_MEMORY || '8GB';
      await this.db.all(`SET threads=${threads}`);
      await this.db.all(`SET memory_limit='${memLimit.replace(/'/g, '')}'`);
      logger.info('DuckDB initialized for archive reading', { threads, memLimit });
      
      // Determine bucket hash type using test vector
      await this.initializeBucketHashType();
      
      this.archiveAvailable = true;
      logger.info('Archive initialized', {
        leanActivitiesPath: this.leanActivitiesPath,
        membershipPath: this.membershipPath,
        midLightExtractDir: this.midLightExtractDir,
        compactIndexRoot: this.compactIndexRoot,
        gapIndexRoot: this.gapIndexRoot || '(none)',
        gapIndexSortedRoot: this.gapIndexSortedRoot || '(none)',
        enableGapLean: this.enableGapLean,
        bucketHashType: this.bucketHashType,
      });
    } catch (error) {
      logger.warn('Archive files not accessible or DuckDB init failed', {
        error,
        leanActivitiesPath: this.leanActivitiesPath,
      });
      this.archiveAvailable = false;
    }
  }

  /**
   * Determine the correct hash type (BIGINT vs VARCHAR) for bucket calculation.
   * Test vector: membership_id 4611686018443970323 should map to bucket 115.
   */
  private async initializeBucketHashType(): Promise<void> {
    if (!this.db) {
      return;
    }

    const testMid = '4611686018443970323';
    const expectedBucket = 115;

    try {
      // Try BIGINT first
      const bigintResult = await this.db.all(
        'SELECT (hash(CAST(? AS BIGINT)) % 256) AS bucket',
        testMid
      );
      const bigintBucket = Number(bigintResult[0]?.bucket);

      if (bigintBucket === expectedBucket) {
        this.bucketHashType = 'BIGINT';
        logger.info('Bucket hash type determined: BIGINT');
        return;
      }

      // Try VARCHAR
      const varcharResult = await this.db.all(
        'SELECT (hash(CAST(? AS VARCHAR)) % 256) AS bucket',
        testMid
      );
      const varcharBucket = Number(varcharResult[0]?.bucket);

      if (varcharBucket === expectedBucket) {
        this.bucketHashType = 'VARCHAR';
        logger.info('Bucket hash type determined: VARCHAR');
        return;
      }

      logger.warn('Could not determine bucket hash type. Test results:', {
        testMid,
        expectedBucket,
        bigintBucket,
        varcharBucket,
      });
    } catch (error) {
      logger.error('Error determining bucket hash type:', error);
    }
  }

  /**
   * Calculate the bucket number for a membership ID.
   */
  private async calculateBucket(membershipId: string): Promise<number | null> {
    if (!this.db || !this.bucketHashType) {
      return null;
    }
    const cached = this.bucketCache.get(membershipId);
    if (cached !== undefined) return cached;

    try {
      const castType = this.bucketHashType === 'BIGINT' ? 'BIGINT' : 'VARCHAR';
      const result = await this.db.all(
        `SELECT (hash(CAST(? AS ${castType})) % 256) AS bucket`,
        membershipId
      );
      const bucket = Number(result[0]?.bucket);
      if (!Number.isFinite(bucket)) return null;
      this.bucketCache.set(membershipId, bucket);
      return bucket;
    } catch (error) {
      logger.error('Error calculating bucket:', { error, membershipId });
      return null;
    }
  }

  /**
   * Check if archive is available.
   */
  isAvailable(): boolean {
    return this.archiveAvailable && this.db !== null;
  }

  /**
   * Get activities for a membership from the lean activities archive.
   * Filters by membership_id directly in the lean activities Parquet file.
   */
  async getActivitiesByMembership(membershipId: string): Promise<LeanActivity[]> {
    if (!this.isAvailable() || !this.db) {
      throw new Error('Archive not available');
    }

    try {
      logger.debug('Reading membership activities from lean archive', { membershipId });

      const sql = `
        SELECT 
          instance_id,
          period,
          activity_hash,
          director_activity_hash,
          mode,
          membership_id,
          membership_type,
          display_name,
          character_id,
          completed,
          deaths,
          kills,
          assists,
          duration_seconds,
          standing,
          starting_phase_index,
          fireteam_id,
          is_private,
          dump_id,
          game
        FROM read_parquet(?)
        WHERE membership_id = ?
        ORDER BY period DESC
      `;

      const rows = await this.db.all(sql, this.leanActivitiesPath, membershipId);
      const activities = rows.map((row: any) => this.mapRowToActivity(row));

      logger.debug('Found activities in archive', {
        membershipId,
        count: activities.length,
      });

      return activities;
    } catch (error) {
      logger.error('Failed to read membership activities from archive', {
        error,
        membershipId,
      });
      throw error;
    }
  }

  /**
   * Get ALL activities for an instance ID from the lean activities archive.
   * Returns all player entries (multiple rows per instance).
   * When `game` is given, only rows for that game are returned: D1 and D2 instance IDs
   * overlap numerically, so an unfiltered lookup could return the other game's activity.
   */
  async getActivitiesByInstanceId(instanceId: string, game?: 'D1' | 'D2'): Promise<LeanActivity[]> {
    if (!this.isAvailable() || !this.db) {
      throw new Error('Archive not available');
    }

    try {
      logger.debug('Reading all activities for instance from archive', { instanceId });

      const sql = `
        SELECT 
          instance_id,
          period,
          activity_hash,
          director_activity_hash,
          mode,
          membership_id,
          membership_type,
          display_name,
          character_id,
          completed,
          deaths,
          kills,
          assists,
          duration_seconds,
          standing,
          starting_phase_index,
          fireteam_id,
          is_private,
          dump_id,
          game
        FROM read_parquet(?)
        WHERE instance_id = ?
          AND (CAST(? AS VARCHAR) IS NULL OR lower(CAST(game AS VARCHAR)) = lower(CAST(? AS VARCHAR)))
      `;

      const gameParam = game ?? null;
      const rows = await this.db.all(sql, this.leanActivitiesPath, instanceId, gameParam, gameParam);
      const activities = rows.map((row: any) => this.mapRowToActivity(row));

      logger.debug('Found activity entries in archive', {
        instanceId,
        entryCount: activities.length,
      });

      return activities;
    } catch (error) {
      logger.error('Failed to read activities from archive', { error, instanceId });
      throw error;
    }
  }

  /**
   * Get a single activity by instance ID from the lean activities archive.
   * Returns first entry only (for backward compatibility).
   */
  async getActivityByInstanceId(instanceId: string, game?: 'D1' | 'D2'): Promise<LeanActivity | null> {
    const activities = await this.getActivitiesByInstanceId(instanceId, game);
    return activities.length > 0 ? activities[0] : null;
  }

  /**
   * Normalize a period timestamp to ISO 8601 with Z suffix.
   * Archive periods are UTC but lack zone info (e.g. "2025-03-16 21:43:05"),
   * which browsers parse as local time. Normalize to "2025-03-16T21:43:05Z".
   */
  private normalizeArchivePeriod(period: unknown): string {
    const raw = String(period ?? '').trim();
    if (!raw) {
      return '';
    }
    // Already ISO 8601 with Z? Return as-is.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(raw)) {
      return raw;
    }
    // UTC timestamp without zone: "2025-03-16 21:43:05" -> parse as UTC
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      return raw.replace(' ', 'T') + 'Z';
    }
    // ISO 8601 without Z: "2025-03-16T21:43:05" -> append Z
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
      return raw + 'Z';
    }
    // Return as-is if format not recognized (fallback)
    return raw;
  }

  /**
   * Map DuckDB row to LeanActivity type.
   * Handles lowercase 'd2'/'d1' game values and normalizes periods to ISO 8601 with Z.
   */
  private mapRowToActivity(row: any): LeanActivity {
    let game: 'D1' | 'D2' = 'D2';
    const gameStr = String(row.game || '').toLowerCase();
    if (gameStr === 'd1') {
      game = 'D1';
    } else if (gameStr === 'd2') {
      game = 'D2';
    }

    return {
      instance_id: String(row.instance_id ?? ''),
      period: this.normalizeArchivePeriod(row.period),
      activity_hash: Number(row.activity_hash ?? 0),
      director_activity_hash: Number(row.director_activity_hash ?? 0),
      mode: Number(row.mode ?? 0),
      membership_id: String(row.membership_id ?? ''),
      membership_type: Number(row.membership_type ?? 0),
      display_name: String(row.display_name ?? ''),
      character_id: String(row.character_id ?? ''),
      completed: Boolean(row.completed),
      deaths: Number(row.deaths ?? 0),
      kills: Number(row.kills ?? 0),
      assists: Number(row.assists ?? 0),
      duration_seconds: Number(row.duration_seconds ?? 0),
      standing: Number(row.standing ?? 0),
      starting_phase_index: Number(row.starting_phase_index ?? 0),
      fireteam_id: String(row.fireteam_id ?? ''),
      is_private: Boolean(row.is_private),
      dump_id: String(row.dump_id ?? ''),
      game,
    };
  }

  /**
   * Multi-tier lookup for player activities.
   * Tries: lite → per-mid extract → compact ids → absent.
   * Never falls through if a tier knows the player (even if filters leave 0 rows).
   * Tracks all tier errors in coverage.notes.
   */
  async getPlayerActivitiesMultiTier(
    membershipId: string,
    options?: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    }
  ): Promise<PlayerActivitiesResult> {
    const tierErrors: string[] = [];
    
    if (!this.isAvailable() || !this.db) {
      return {
        activities: [],
        tier: { level: 'absent', source: 'none' },
      };
    }

    // Validate membership ID
    if (!/^\d+$/.test(membershipId)) {
      logger.warn('Invalid membership ID format', { membershipId });
      return {
        activities: [],
        tier: { level: 'absent', source: 'none' },
      };
    }

    // Tier 1: Try lite parquet
    try {
      const liteResult = await this.tryLiteLookup(membershipId, options);
      if (liteResult.knownPlayer) {
        logger.debug('Lite tier knows player', {
          membershipId,
          count: liteResult.activities.length,
        });
        if (tierErrors.length > 0) {
          liteResult.tier.notes = [...(liteResult.tier.notes || []), ...tierErrors];
        }
        return this.mergeGapLeanIfEnabled(liteResult, membershipId, options, tierErrors);
      }
    } catch (error) {
      const errorMsg = `Lite tier error: ${error instanceof Error ? error.message : 'unknown'}`;
      logger.warn(errorMsg, { membershipId, error });
      tierErrors.push(errorMsg);
    }

    // Tier 2: Try per-mid light extract
    if (this.midLightExtractDir) {
      try {
        const extractResult = await this.tryExtractLookup(membershipId, options);
        if (extractResult.tier.notes && extractResult.tier.notes.length > 0) {
          tierErrors.push(...extractResult.tier.notes);
        }
        if (extractResult.knownPlayer) {
          logger.debug('Extract tier knows player', {
            membershipId,
            count: extractResult.activities.length,
          });
          if (tierErrors.length > 0) {
            const allNotes = [...(extractResult.tier.notes || []), ...tierErrors];
            extractResult.tier.notes = Array.from(new Set(allNotes));
          }
          return this.mergeGapLeanIfEnabled(extractResult, membershipId, options, tierErrors);
        }
      } catch (error) {
        const errorMsg = `Extract tier error: ${error instanceof Error ? error.message : 'unknown'}`;
        logger.warn(errorMsg, { membershipId, error });
        tierErrors.push(errorMsg);
      }
    }

    // Tier 3: Try compact index
    if (this.compactIndexRoot && this.bucketHashType) {
      try {
        const compactResult = await this.tryCompactIndexLookup(membershipId, options);
        if (tierErrors.length > 0) {
          compactResult.tier.notes = [...(compactResult.tier.notes || []), ...tierErrors];
        }
        
        if (compactResult.knownPlayer || compactResult.tier.source === 'pending' || compactResult.tier.source === 'none') {
          logger.debug('Compact tier result', {
            membershipId,
            count: compactResult.activities.length,
            source: compactResult.tier.source,
            indexComplete: compactResult.tier.indexComplete,
          });
          return this.mergeGapLeanIfEnabled(compactResult, membershipId, options, tierErrors);
        }
      } catch (error) {
        const errorMsg = `Compact tier error: ${error instanceof Error ? error.message : 'unknown'}`;
        logger.warn(errorMsg, { membershipId, error });
        tierErrors.push(errorMsg);
      }
    }

    // Tier 3b / 4: gap-only when prior tiers miss (Option A hole fill)
    if (this.enableGapLean) {
      try {
        const gapOnly = await this.tryGapLeanLookup(membershipId, options);
        if (gapOnly.knownPlayer) {
          if (tierErrors.length > 0) {
            gapOnly.tier.notes = [...(gapOnly.tier.notes || []), ...tierErrors];
          }
          return gapOnly;
        }
        if (gapOnly.tier.notes?.length) {
          tierErrors.push(...gapOnly.tier.notes);
        }
      } catch (error) {
        const errorMsg = `Gap lean tier error: ${error instanceof Error ? error.message : 'unknown'}`;
        logger.warn(errorMsg, { membershipId, error });
        tierErrors.push(errorMsg);
      }
    }

    logger.debug('No archive data found for membership', { membershipId });
    return {
      activities: [],
      tier: {
        level: 'absent',
        source: 'none',
        notes: tierErrors.length > 0 ? tierErrors : undefined,
      },
    };
  }

  /**
   * Try tier 1: lite parquet lookup.
   */
  private async tryLiteLookup(
    membershipId: string,
    options?: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    }
  ): Promise<PlayerActivitiesResult> {
    if (!this.playerActivitiesLitePath) {
      return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
    }

    try {
      await fs.access(this.playerActivitiesLitePath);
    } catch {
      return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
    }

    const result = await this.queryPlayerActivitiesSchema(
      this.playerActivitiesLitePath,
      membershipId,
      options,
      'lite'
    );
    
    return {
      activities: result.activities,
      tier: {
        level: 'full',
        source: result.knownPlayer ? 'lite' : 'none',
        filtersApplied: result.filtersApplied,
        notes: result.notes,
      },
      knownPlayer: result.knownPlayer,
    };
  }

  /**
   * Try tier 2: per-mid light extract lookup.
   * Tries patterns: mid_{mid}_light_api.parquet (preferred), mid_{mid}_light.parquet,
   * or parts layout: membership_id={mid}/ids.parquet + parts/YYYY-MM.parquet
   */
  private async tryExtractLookup(
    membershipId: string,
    options?: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    }
  ): Promise<PlayerActivitiesResult> {
    if (!this.midLightExtractDir) {
      return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
    }

    const path = await import('path');
    const notes: string[] = [];

    // Try individual file patterns first (preferred)
    const patterns = [
      `mid_${membershipId}_light_api.parquet`,  // 20-column API shape (preferred)
      `mid_${membershipId}_light.parquet`,      // 16-column shape
    ];

    for (const i in patterns) {
      const pattern = patterns[i];
      const filePath = path.join(this.midLightExtractDir, pattern);
      try {
        await fs.access(filePath);
        const result = await this.queryPlayerActivitiesSchema(
          filePath,
          membershipId,
          options,
          'extract'
        );
        
        // If this is a fallback pattern after errors, note which file was used
        if (notes.length > 0 && i !== '0') {
          notes.push(`extract: using fallback ${pattern}`);
        }
        
        return {
          activities: result.activities,
          tier: {
            level: 'full',
            source: result.knownPlayer ? 'extract' : 'none',
            filtersApplied: result.filtersApplied,
            notes: notes.length > 0 ? [...notes, ...(result.notes || [])] : result.notes,
          },
          knownPlayer: result.knownPlayer,
        };
      } catch (error) {
        // File exists but unreadable - record error
        if (error && (error as any).code !== 'ENOENT') {
          const errorMsg = `extract: ${pattern} unreadable`;
          logger.warn(errorMsg, { membershipId, error });
          notes.push(errorMsg);
        }
        continue;
      }
    }

    // Try parts layout: membership_id={mid}/ids.parquet + parts/*.parquet
    // TODO: Implement parts-based lookup if needed
    // For now, just return not found
    
    return {
      activities: [],
      tier: {
        level: 'absent',
        source: 'none',
        notes: notes.length > 0 ? notes : undefined,
      },
      knownPlayer: false,
    };
  }

  private activityDedupeKey(a: LeanActivity): string {
    return `${a.instance_id}|${a.membership_id}|${a.character_id}`;
  }

  /** Prefer rows with real lean fields over compact_ids stubs. */
  private leanRichness(a: LeanActivity): number {
    let score = 0;
    if (a.period) score += 4;
    if (a.activity_hash) score += 2;
    if (a.mode) score += 1;
    if (a.display_name) score += 1;
    return score;
  }

  /**
   * Option A: union gap ready/ lean rows into a prior tier result.
   * Dedupe by (instance_id, membership_id, character_id); prefer richer lean rows.
   */
  private async mergeGapLeanIfEnabled(
    base: PlayerActivitiesResult,
    membershipId: string,
    options: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    } | undefined,
    tierErrors: string[]
  ): Promise<PlayerActivitiesResult> {
    if (!this.enableGapLean) {
      return base;
    }
    try {
      const gap = await this.tryGapLeanLookup(membershipId, options);
      if (!gap.knownPlayer || gap.activities.length === 0) {
        if (gap.tier.notes?.length) {
          base.tier.notes = [...(base.tier.notes || []), ...gap.tier.notes];
        }
        return base;
      }

      const map = new Map<string, LeanActivity>();
      for (const a of base.activities) {
        map.set(this.activityDedupeKey(a), a);
      }
      let gapAdded = 0;
      let gapReplaced = 0;
      for (const g of gap.activities) {
        const key = this.activityDedupeKey(g);
        const existing = map.get(key);
        if (!existing) {
          map.set(key, g);
          gapAdded++;
        } else if (this.leanRichness(g) > this.leanRichness(existing)) {
          map.set(key, g);
          gapReplaced++;
        }
      }

      const merged = Array.from(map.values());
      const limit = options?.limit || 10000;
      // Keep period-desc when possible
      merged.sort((a, b) => {
        if (a.period && b.period) return b.period.localeCompare(a.period);
        if (a.period) return -1;
        if (b.period) return 1;
        return String(b.instance_id).localeCompare(String(a.instance_id), undefined, { numeric: true });
      });
      const activities = merged.slice(0, limit);

      const notes = [
        ...(base.tier.notes || []),
        ...(gap.tier.notes || []),
        ...tierErrors,
        `gap_lean merge: +${gapAdded} new, ${gapReplaced} richer replacements from GAP_INDEX_ROOT`,
      ];

      const hasLean = activities.some(a => !!a.period || !!a.activity_hash);
      return {
        activities,
        knownPlayer: activities.length > 0 || base.knownPlayer,
        tier: {
          level: hasLean ? 'full' : base.tier.level,
          source: gapAdded + gapReplaced > 0 ? 'merged' : base.tier.source,
          indexComplete: base.tier.indexComplete ?? gap.tier.indexComplete,
          filtersApplied: base.tier.filtersApplied || gap.tier.filtersApplied,
          notes: Array.from(new Set(notes)),
        },
      };
    } catch (error) {
      const errorMsg = `Gap lean merge error: ${error instanceof Error ? error.message : 'unknown'}`;
      logger.warn(errorMsg, { membershipId, error });
      base.tier.notes = [...(base.tier.notes || []), errorMsg];
      return base;
    }
  }

  /**
   * Option A: read 20-col lean rows from gap ready/ mid_bucket=N.
   * Skips incomplete buckets (_COMPLETE.json missing) without failing the request.
   *
   * W7 (2026-10-02): gap `game` is untrusted — extract used iconPath heuristic
   * (`"destiny2" in iconPath` → D2 else D1), mislabeling ~20% of D2 PGCRs as D1.
   * Raw gap source is D2-only. Never SQL-filter on gap.game; force game='D2' on
   * returned rows. Skip entirely when caller asks for game=D1.
   */
  private async tryGapLeanLookup(
    membershipId: string,
    options?: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    }
  ): Promise<PlayerActivitiesResult> {
    if (!this.enableGapLean || !this.gapIndexRoot || !this.db || !this.bucketHashType) {
      return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
    }

    // Gap lean is D2-only (W7). Do not surface mislabeled rows as D1.
    if (options?.game === 'D1') {
      return {
        activities: [],
        tier: {
          level: 'absent',
          source: 'none',
          notes: ['Gap lean skipped for game=D1 (W7: gap rows are D2; game column untrusted)'],
        },
        knownPlayer: false,
      };
    }

    const bucket = await this.calculateBucket(membershipId);
    if (bucket === null) {
      return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
    }

    const pathMod = await import('path');
    // W11: prefer membership_id-sorted bucket when present (RG pruning ~0.1s vs ~3s).
    const candidates: Array<{ root: string; label: string }> = [];
    if (this.gapIndexSortedRoot) {
      candidates.push({ root: this.gapIndexSortedRoot, label: 'gap_sorted' });
    }
    candidates.push({ root: this.gapIndexRoot, label: 'gap_ready' });

    let instancesPath = '';
    let usedLabel = '';
    let anyPending = false;
    for (const c of candidates) {
      const bucketDir = pathMod.join(c.root, `mid_bucket=${bucket}`);
      const markerPath = pathMod.join(bucketDir, '_COMPLETE.json');
      const parquetPath = pathMod.join(bucketDir, 'instances.parquet');
      try {
        await fs.access(parquetPath);
        if (!this.gapRelaxComplete) {
          await fs.access(markerPath);
        }
        instancesPath = parquetPath;
        usedLabel = c.label;
        break;
      } catch {
        if (c.label === 'gap_ready') {
          try {
            await fs.access(markerPath);
            anyPending = false;
          } catch {
            anyPending = !this.gapRelaxComplete;
          }
        }
      }
    }

    if (!instancesPath) {
      return {
        activities: [],
        tier: {
          level: 'absent',
          source: anyPending ? 'pending' : 'none',
          indexComplete: !anyPending,
          notes: [
            anyPending
              ? `Gap ready bucket ${bucket} not complete yet`
              : `Gap ready bucket ${bucket} marker present but instances.parquet missing`,
          ],
        },
        knownPlayer: false,
      };
    }

    try {
      // Ignore stored game column when querying (W7) — filtering on it drops ~20% of real D2 rows.
      // W8: ~245k rows have membership_id='0' (unreachable); never query as mid '0'.
      if (membershipId === '0' || membershipId === '') {
        return {
          activities: [],
          tier: {
            level: 'absent',
            source: 'none',
            notes: ['Gap lean skipped for membership_id=0 (W8)'],
          },
          knownPlayer: false,
        };
      }
      const result = await this.queryPlayerActivitiesSchema(
        instancesPath,
        membershipId,
        { ...options, game: undefined },
        'gap_lean'
      );
      const activities = result.activities.map(forceGapLeanGame);
      const notes = [
        ...(result.notes || []),
        'Gap lean: forced game=D2 (W7; ignore stored game column)',
        usedLabel === 'gap_sorted'
          ? `W11: gap bucket ${bucket} from membership_id-sorted root`
          : `W11: gap bucket ${bucket} from unsorted ready root`,
      ];
      return {
        activities,
        knownPlayer: result.knownPlayer,
        tier: {
          level: activities.length > 0 ? 'full' : 'absent',
          source: activities.length > 0 ? 'gap_lean' : 'none',
          indexComplete: true,
          filtersApplied: result.filtersApplied,
          notes,
        },
      };
    } catch (error) {
      logger.error('Failed to read gap ready index', { error, bucket, membershipId });
      return {
        activities: [],
        tier: {
          level: 'absent',
          source: 'none',
          indexComplete: true,
          notes: ['Error reading gap ready index'],
        },
        knownPlayer: false,
      };
    }
  }

  /**
   * Try tier 3: compact index lookup (instance IDs only).
   * Returns distinct instance IDs, sorted numerically, with no fabricated dates/modes.
   */
  private async tryCompactIndexLookup(
    membershipId: string,
    options?: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    }
  ): Promise<PlayerActivitiesResult> {
    if (!this.compactIndexRoot || !this.db) {
      return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
    }

    const bucket = await this.calculateBucket(membershipId);
    if (bucket === null) {
      return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
    }

    const path = await import('path');
    const bucketDir = path.join(this.compactIndexRoot, `mid_bucket=${bucket}`);
    const instancesPath = path.join(bucketDir, 'instances.parquet');
    const markerPath = path.join(bucketDir, '_COMPLETE.json');

    // Check for completion marker FIRST
    let markerExists = false;
    try {
      await fs.access(markerPath);
      markerExists = true;
    } catch {
      // No marker = index build in progress, don't open the file
      logger.debug('Compact index bucket not complete, skipping query', { bucket, membershipId });
      return {
        activities: [],
        tier: {
          level: 'absent',
          source: 'pending',
          indexComplete: false,
        },
        knownPlayer: false,
      };
    }

    // Marker exists, now check for instances file
    let fileExists = false;
    try {
      await fs.access(instancesPath);
      fileExists = true;
    } catch {
      logger.debug('Compact index instances file not found', { bucket, membershipId });
    }

    // If file missing but marker exists, it's a definite absent
    if (!fileExists) {
      return {
        activities: [],
        tier: {
          level: 'absent',
          source: 'none',
          indexComplete: true,  // Marker exists, build is complete
        },
        knownPlayer: false,
      };
    }

    // Query for distinct instance IDs, sorted numerically
    try {
      // Ignore filters for compact tier (no dates available)
      const hasFilters = !!(options?.game || options?.fromPeriod || options?.toPeriod);
      
      const sql = `
        SELECT DISTINCT
          CAST(activity_instance_id AS VARCHAR) AS instance_id,
          CAST(character_id AS VARCHAR) AS character_id
        FROM read_parquet(?)
        WHERE membership_id = ?
          AND activity_instance_id IS NOT NULL
          AND activity_instance_id != ''
          AND TRY_CAST(activity_instance_id AS UBIGINT) IS NOT NULL
          AND TRY_CAST(activity_instance_id AS UBIGINT) > 0
        ORDER BY TRY_CAST(activity_instance_id AS UBIGINT) DESC
        LIMIT ?
      `;

      const limit = options?.limit || 10000;
      const rows = await this.db.all(sql, instancesPath, membershipId, limit);

      const notes: string[] = [];
      if (hasFilters) {
        notes.push('Filters (game, from, to) ignored for compact tier (no dates available)');
      }

      const activities: LeanActivity[] = rows.map((row: any) => ({
        instance_id: String(row.instance_id ?? ''),
        character_id: String(row.character_id ?? ''),
        period: '',
        activity_hash: 0,
        director_activity_hash: 0,
        mode: 0,
        membership_id: membershipId,
        membership_type: 0,
        display_name: '',
        completed: false,
        deaths: 0,
        kills: 0,
        assists: 0,
        duration_seconds: 0,
        standing: 0,
        starting_phase_index: 0,
        fireteam_id: '',
        is_private: false,
        dump_id: '',
        game: 'D2' as 'D1' | 'D2',  // Assumed D2, not actually known from compact tier
      }));

      return {
        activities,
        tier: {
          level: activities.length > 0 ? 'partial' : 'absent',
          source: activities.length > 0 ? 'compact_ids' : (markerExists ? 'none' : 'pending'),
          indexComplete: markerExists,
          filtersApplied: false,
          notes: notes.length > 0 ? notes : undefined,
        },
        knownPlayer: activities.length > 0,
      };
    } catch (error) {
      logger.error('Failed to read compact index', { error, bucket, membershipId });
      return {
        activities: [],
        tier: {
          level: 'absent',
          source: markerExists ? 'none' : 'pending',
          indexComplete: markerExists,
          notes: ['Error reading compact index'],
        },
        knownPlayer: false,
      };
    }
  }

  /**
   * Schema-tolerant query for player activities.
   * First DESCRIBEs the table to see what columns exist, then selects only available ones.
   */
  private async queryPlayerActivitiesSchema(
    parquetPath: string,
    membershipId: string,
    options: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    } | undefined,
    tierName: string
  ): Promise<{
    activities: LeanActivity[];
    knownPlayer: boolean;
    filtersApplied: boolean;
    notes?: string[];
  }> {
    if (!this.db) {
      return { activities: [], knownPlayer: false, filtersApplied: false };
    }

    try {
      // W11: cache schema — DESCRIBE was a full parquet open per request.
      let availableColumns = this.parquetSchemaCache.get(parquetPath);
      if (!availableColumns) {
        const schemaResult = await this.db.all(`DESCRIBE SELECT * FROM read_parquet(?)`, parquetPath);
        availableColumns = new Set(schemaResult.map((col: any) => col.column_name as string));
        this.parquetSchemaCache.set(parquetPath, availableColumns);
      }

      // Required columns
      const requiredCols = [
        'instance_id', 'period', 'activity_hash', 'mode', 'membership_id',
        'character_id', 'completed', 'deaths', 'duration_seconds', 'game'
      ];

      // Optional columns (provide defaults if missing)
      const optionalCols = {
        director_activity_hash: 0,
        membership_type: 0,
        display_name: "''",
        kills: 0,
        assists: 0,
        standing: 0,
        starting_phase_index: 0,
        fireteam_id: "''",
        is_private: 'false',
        dump_id: "''",
      };

      // Build select clause with available or defaulted columns
      const selectCols = requiredCols.map(col => 
        availableColumns!.has(col) ? col : `NULL AS ${col}`
      );
      
      for (const [col, defaultVal] of Object.entries(optionalCols)) {
        if (availableColumns!.has(col)) {
          selectCols.push(col);
        } else {
          selectCols.push(`${defaultVal} AS ${col}`);
        }
      }

      // W11: one SELECT only (removed pre-query COUNT(*) full-bucket scan).
      const { game, fromPeriod, toPeriod, limit = 10000 } = options || {};
      const hasFilters = !!(game || fromPeriod || toPeriod);

      const conditions: string[] = ['membership_id = ?'];
      const params: any[] = [parquetPath, membershipId];

      if (game && availableColumns!.has('game')) {
        conditions.push('LOWER(game) = ?');
        params.push(game.toLowerCase());
      }

      if (fromPeriod && availableColumns!.has('period')) {
        conditions.push('period >= ?');
        params.push(fromPeriod);
      }

      if (toPeriod && availableColumns!.has('period')) {
        conditions.push('period <= ?');
        params.push(toPeriod);
      }

      const whereClause = conditions.join(' AND ');
      const orderBy = availableColumns!.has('period') ? 'ORDER BY period DESC' : '';

      const sql = `
        SELECT ${selectCols.join(', ')}
        FROM read_parquet(?)
        WHERE ${whereClause}
        ${orderBy}
        LIMIT ?
      `;

      params.push(limit);

      const rows = await this.db.all(sql, ...params);
      const activities = rows.map((row: any) => this.mapRowToActivity(row));

      if (activities.length > 0) {
        return {
          activities,
          knownPlayer: true,
          filtersApplied: hasFilters,
        };
      }

      // Empty filtered result: cheap EXISTS to distinguish unknown mid vs no rows in window.
      if (hasFilters) {
        const exists = await this.db.all(
          `SELECT 1 AS ok FROM read_parquet(?) WHERE membership_id = ? LIMIT 1`,
          parquetPath,
          membershipId
        );
        if (exists.length > 0) {
          return { activities: [], knownPlayer: true, filtersApplied: true };
        }
      }

      return { activities: [], knownPlayer: false, filtersApplied: hasFilters };
    } catch (error) {
      logger.error(`Schema-tolerant query failed for ${tierName} tier`, { error, parquetPath, membershipId });
      throw error;
    }
  }

  /**
   * Get player activities with filtering for player activities API.
   * Reads from playerActivitiesLitePath with optional filters.
   */
  async getPlayerActivities(
    membershipId: string,
    options?: {
      game?: 'D1' | 'D2';
      fromPeriod?: string;
      toPeriod?: string;
      limit?: number;
    }
  ): Promise<LeanActivity[]> {
    if (!this.isAvailable() || !this.db) {
      throw new Error('Archive not available');
    }

    try {
      const { game, fromPeriod, toPeriod, limit = 10000 } = options || {};

      logger.debug('Reading player activities from lite archive', {
        membershipId,
        game,
        fromPeriod,
        toPeriod,
        limit,
      });

      const conditions: string[] = ['membership_id = ?'];
      const params: any[] = [this.playerActivitiesLitePath, membershipId];

      if (game) {
        conditions.push('LOWER(game) = ?');
        params.push(game.toLowerCase());
      }

      if (fromPeriod) {
        conditions.push('period >= ?');
        params.push(fromPeriod);
      }

      if (toPeriod) {
        conditions.push('period <= ?');
        params.push(toPeriod);
      }

      const whereClause = conditions.join(' AND ');

      const sql = `
        SELECT 
          instance_id,
          period,
          activity_hash,
          director_activity_hash,
          mode,
          membership_id,
          membership_type,
          display_name,
          character_id,
          completed,
          deaths,
          kills,
          assists,
          duration_seconds,
          standing,
          starting_phase_index,
          fireteam_id,
          is_private,
          dump_id,
          game
        FROM read_parquet(?)
        WHERE ${whereClause}
        ORDER BY period DESC
        LIMIT ?
      `;

      params.push(limit);

      const rows = await this.db.all(sql, ...params);
      const activities = rows.map((row: any) => this.mapRowToActivity(row));

      logger.debug('Found player activities in lite archive', {
        membershipId,
        count: activities.length,
      });

      return activities;
    } catch (error) {
      logger.error('Failed to read player activities from archive', {
        error,
        membershipId,
      });
      throw error;
    }
  }

  /**
   * Close the DuckDB connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      logger.info('DuckDB connection closed');
    }
  }
}
