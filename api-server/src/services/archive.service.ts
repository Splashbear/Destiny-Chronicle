import * as fs from 'fs/promises';
import { ParquetReader } from 'parquetjs';
import { LeanActivity } from '../types/lean-activity.types';
import { logger } from '../utils/logger';

/**
 * Service for reading lean activities from Parquet archives.
 */
export class ArchiveService {
  private leanActivitiesPath: string;
  private membershipPath: string;
  private archiveAvailable = false;

  constructor(leanActivitiesPath: string, membershipPath: string) {
    this.leanActivitiesPath = leanActivitiesPath;
    this.membershipPath = membershipPath;
  }

  /**
   * Initialize and verify archive paths.
   */
  async initialize(): Promise<void> {
    if (!this.leanActivitiesPath || !this.membershipPath) {
      logger.warn('Archive paths not configured - archive lookups disabled');
      return;
    }

    try {
      await fs.access(this.leanActivitiesPath);
      await fs.access(this.membershipPath);
      this.archiveAvailable = true;
      logger.info('Archive initialized', {
        leanActivitiesPath: this.leanActivitiesPath,
        membershipPath: this.membershipPath,
      });
    } catch (error) {
      logger.warn('Archive files not accessible', {
        error,
        leanActivitiesPath: this.leanActivitiesPath,
        membershipPath: this.membershipPath,
      });
      this.archiveAvailable = false;
    }
  }

  /**
   * Check if archive is available.
   */
  isAvailable(): boolean {
    return this.archiveAvailable;
  }

  /**
   * Get activities for a membership from the archive.
   */
  async getActivitiesByMembership(membershipId: string): Promise<LeanActivity[]> {
    if (!this.archiveAvailable) {
      throw new Error('Archive not available');
    }

    try {
      logger.debug('Reading membership activities from archive', { membershipId });

      const reader = await ParquetReader.openFile(this.membershipPath);
      const cursor = reader.getCursor();
      const activities: LeanActivity[] = [];

      let record: Record<string, unknown> | null = null;
      while ((record = await cursor.next())) {
        if (String(record.membership_id) === membershipId) {
          activities.push(this.mapRowToActivity(record));
        }
      }

      await reader.close();
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
   * Get a single activity by instance ID from the archive.
   */
  async getActivityByInstanceId(instanceId: string): Promise<LeanActivity | null> {
    if (!this.archiveAvailable) {
      throw new Error('Archive not available');
    }

    try {
      logger.debug('Reading activity from archive', { instanceId });

      const reader = await ParquetReader.openFile(this.leanActivitiesPath);
      const cursor = reader.getCursor();

      let record: Record<string, unknown> | null = null;
      while ((record = await cursor.next())) {
        if (String(record.instance_id) === instanceId) {
          await reader.close();
          return this.mapRowToActivity(record);
        }
      }

      await reader.close();
      logger.debug('Activity not found in archive', { instanceId });
      return null;
    } catch (error) {
      logger.error('Failed to read activity from archive', { error, instanceId });
      throw error;
    }
  }

  /**
   * Map Parquet row to LeanActivity type.
   */
  private mapRowToActivity(row: Record<string, unknown>): LeanActivity {
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
      game: (row.game === 'D1' ? 'D1' : 'D2') as 'D1' | 'D2',
    };
  }
}
