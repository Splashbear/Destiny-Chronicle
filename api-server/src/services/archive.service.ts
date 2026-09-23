import * as fs from 'fs/promises';
import { Database } from 'duckdb-async';
import { LeanActivity } from '../types/lean-activity.types';
import { logger } from '../utils/logger';

/**
 * Service for reading lean activities from Parquet archives using DuckDB.
 * DuckDB can read ZSTD-compressed Parquet files written by DuckDB or other tools.
 */
export class ArchiveService {
  private leanActivitiesPath: string;
  private membershipPath: string;
  private playerActivitiesLitePath: string;
  private archiveAvailable = false;
  private db: Database | null = null;

  constructor(
    leanActivitiesPath: string,
    membershipPath: string,
    playerActivitiesLitePath: string
  ) {
    this.leanActivitiesPath = leanActivitiesPath;
    this.membershipPath = membershipPath;
    this.playerActivitiesLitePath = playerActivitiesLitePath;
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
      
      this.archiveAvailable = true;
      logger.info('Archive initialized', {
        leanActivitiesPath: this.leanActivitiesPath,
        membershipPath: this.membershipPath,
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
   * Handles lowercase 'd2'/'d1' game values from Travis files.
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
