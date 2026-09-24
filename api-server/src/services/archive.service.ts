import * as fs from 'fs/promises';
import { Database } from 'duckdb-async';
import { LeanActivity } from '../types/lean-activity.types';
import { logger } from '../utils/logger';

/**
 * Tier information for multi-tier archive lookups.
 */
export interface TierInfo {
  level: 'full' | 'partial' | 'absent';
  source: 'lite' | 'extract' | 'compact_ids' | 'none' | 'pending';
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
 * Service for reading lean activities from Parquet archives using DuckDB.
 * DuckDB can read ZSTD-compressed Parquet files written by DuckDB or other tools.
 */
export class ArchiveService {
  private leanActivitiesPath: string;
  private membershipPath: string;
  private playerActivitiesLitePath: string;
  private midLightExtractDir: string;
  private compactIndexRoot: string;
  private archiveAvailable = false;
  private db: Database | null = null;
  private bucketHashType: 'BIGINT' | 'VARCHAR' | null = null;

  constructor(
    leanActivitiesPath: string,
    membershipPath: string,
    playerActivitiesLitePath: string,
    midLightExtractDir: string,
    compactIndexRoot: string
  ) {
    this.leanActivitiesPath = leanActivitiesPath;
    this.membershipPath = membershipPath;
    this.playerActivitiesLitePath = playerActivitiesLitePath;
    this.midLightExtractDir = midLightExtractDir;
    this.compactIndexRoot = compactIndexRoot;
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
      logger.info('DuckDB initialized for archive reading');
      
      // Determine bucket hash type using test vector
      await this.initializeBucketHashType();
      
      this.archiveAvailable = true;
      logger.info('Archive initialized', {
        leanActivitiesPath: this.leanActivitiesPath,
        membershipPath: this.membershipPath,
        midLightExtractDir: this.midLightExtractDir,
        compactIndexRoot: this.compactIndexRoot,
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

    try {
      const castType = this.bucketHashType === 'BIGINT' ? 'BIGINT' : 'VARCHAR';
      const result = await this.db.all(
        `SELECT (hash(CAST(? AS ${castType})) % 256) AS bucket`,
        membershipId
      );
      return Number(result[0]?.bucket) ?? null;
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
   */
  async getActivitiesByInstanceId(instanceId: string): Promise<LeanActivity[]> {
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
      `;

      const rows = await this.db.all(sql, this.leanActivitiesPath, instanceId);
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
  async getActivityByInstanceId(instanceId: string): Promise<LeanActivity | null> {
    const activities = await this.getActivitiesByInstanceId(instanceId);
    return activities.length > 0 ? activities[0] : null;
  }

  /**
   * Map DuckDB row to LeanActivity type.
   * Handles lowercase 'd2'/'d1' game values.
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
      period: String(row.period ?? ''),
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
        return liteResult;
      }
    } catch (error) {
      logger.warn('Lite lookup error, trying next tier', { membershipId, error });
    }

    // Tier 2: Try per-mid light extract
    if (this.midLightExtractDir) {
      try {
        const extractResult = await this.tryExtractLookup(membershipId, options);
        if (extractResult.knownPlayer) {
          logger.debug('Extract tier knows player', {
            membershipId,
            count: extractResult.activities.length,
          });
          return extractResult;
        }
      } catch (error) {
        logger.warn('Extract lookup error, trying next tier', { membershipId, error });
      }
    }

    // Tier 3: Try compact index
    if (this.compactIndexRoot && this.bucketHashType) {
      try {
        const compactResult = await this.tryCompactIndexLookup(membershipId, options);
        if (compactResult.knownPlayer || compactResult.tier.source === 'pending') {
          logger.debug('Compact tier result', {
            membershipId,
            count: compactResult.activities.length,
            source: compactResult.tier.source,
          });
          return compactResult;
        }
      } catch (error) {
        logger.warn('Compact index lookup error', { membershipId, error });
      }
    }

    // Tier 4: Nothing found
    logger.debug('No archive data found for membership', { membershipId });
    return {
      activities: [],
      tier: { level: 'absent', source: 'none' },
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

    // Try individual file patterns first (preferred)
    const patterns = [
      `mid_${membershipId}_light_api.parquet`,  // 20-column API shape (preferred)
      `mid_${membershipId}_light.parquet`,      // 16-column shape
    ];

    for (const pattern of patterns) {
      const filePath = path.join(this.midLightExtractDir, pattern);
      try {
        await fs.access(filePath);
        const result = await this.queryPlayerActivitiesSchema(
          filePath,
          membershipId,
          options,
          'extract'
        );
        return {
          activities: result.activities,
          tier: {
            level: 'full',
            source: result.knownPlayer ? 'extract' : 'none',
            filtersApplied: result.filtersApplied,
            notes: result.notes,
          },
          knownPlayer: result.knownPlayer,
        };
      } catch {
        continue;
      }
    }

    // Try parts layout: membership_id={mid}/ids.parquet + parts/*.parquet
    // TODO: Implement parts-based lookup if needed
    // For now, just return not found
    
    return { activities: [], tier: { level: 'absent', source: 'none' }, knownPlayer: false };
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

    // Check for completion marker
    let markerExists = false;
    try {
      await fs.access(markerPath);
      markerExists = true;
    } catch {
      // Bucket exists but incomplete
      logger.debug('Compact index bucket not complete', { bucket, membershipId });
    }

    // Check for instances file
    let fileExists = false;
    try {
      await fs.access(instancesPath);
      fileExists = true;
    } catch {
      logger.debug('Compact index instances file not found', { bucket, membershipId });
    }

    // If bucket/file missing, report as pending
    if (!fileExists) {
      return {
        activities: [],
        tier: {
          level: 'absent',
          source: markerExists ? 'none' : 'pending',
          indexComplete: markerExists,
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
          AND CAST(activity_instance_id AS UBIGINT) > 0
        ORDER BY CAST(activity_instance_id AS UBIGINT) DESC
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
      // First, check schema
      const schemaResult = await this.db.all(`DESCRIBE SELECT * FROM read_parquet(?)`, parquetPath);
      const availableColumns = new Set(schemaResult.map((col: any) => col.column_name));

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
        availableColumns.has(col) ? col : `NULL AS ${col}`
      );
      
      for (const [col, defaultVal] of Object.entries(optionalCols)) {
        if (availableColumns.has(col)) {
          selectCols.push(col);
        } else {
          selectCols.push(`${defaultVal} AS ${col}`);
        }
      }

      // Check if player exists (without filters)
      const countSql = `
        SELECT COUNT(*) as cnt
        FROM read_parquet(?)
        WHERE membership_id = ?
      `;
      const countResult = await this.db.all(countSql, parquetPath, membershipId);
      const knownPlayer = (countResult[0]?.cnt || 0) > 0;

      if (!knownPlayer) {
        return { activities: [], knownPlayer: false, filtersApplied: false };
      }

      // Build filtered query
      const { game, fromPeriod, toPeriod, limit = 10000 } = options || {};

      const conditions: string[] = ['membership_id = ?'];
      const params: any[] = [parquetPath, membershipId];

      if (game && availableColumns.has('game')) {
        conditions.push('LOWER(game) = ?');
        params.push(game.toLowerCase());
      }

      if (fromPeriod && availableColumns.has('period')) {
        conditions.push('period >= ?');
        params.push(fromPeriod);
      }

      if (toPeriod && availableColumns.has('period')) {
        conditions.push('period <= ?');
        params.push(toPeriod);
      }

      const whereClause = conditions.join(' AND ');
      const orderBy = availableColumns.has('period') ? 'ORDER BY period DESC' : '';

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

      return {
        activities,
        knownPlayer: true,
        filtersApplied: true,
      };
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
