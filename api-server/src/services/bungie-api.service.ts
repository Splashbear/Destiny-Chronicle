import { LeanActivity } from '../types/lean-activity.types';
import { logger } from '../utils/logger';

/**
 * Service for fetching activities from live Bungie API.
 */
export class BungieApiService {
  private apiKey: string;
  private apiRoot: string;

  constructor(apiKey: string, apiRoot: string) {
    this.apiKey = apiKey;
    this.apiRoot = apiRoot;
  }

  /**
   * Fetch a single PGCR from Bungie API and convert to lean format.
   */
  async getActivityByInstanceId(instanceId: string): Promise<LeanActivity | null> {
    try {
      logger.debug('Fetching PGCR from Bungie', { instanceId });

      const url = `${this.apiRoot}/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`;
      const response = await fetch(url, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.debug('PGCR not found on Bungie', { instanceId });
          return null;
        }
        throw new Error(`Bungie API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.convertPgcrToLean(instanceId, data);
    } catch (error) {
      logger.error('Failed to fetch PGCR from Bungie', { error, instanceId });
      throw error;
    }
  }

  /**
   * Convert Bungie PGCR format to lean activity format.
   * This is a simplified conversion - extend as needed.
   */
  private convertPgcrToLean(instanceId: string, pgcr: any): LeanActivity | null {
    try {
      const response = pgcr.Response || pgcr;
      const activityDetails = response.activityDetails || {};
      const entries = response.entries || [];

      if (entries.length === 0) {
        logger.warn('PGCR has no entries', { instanceId });
        return null;
      }

      const firstEntry = entries[0];
      const player = firstEntry.player || {};
      const values = firstEntry.values || {};
      const extended = firstEntry.extended?.values || {};

      return {
        instance_id: String(activityDetails.instanceId || instanceId),
        period: activityDetails.period || new Date().toISOString(),
        activity_hash: activityDetails.referenceId || 0,
        director_activity_hash: activityDetails.directorActivityHash || 0,
        mode: activityDetails.mode || activityDetails.modes?.[0] || 0,
        membership_id: player.destinyUserInfo?.membershipId || '',
        membership_type: player.destinyUserInfo?.membershipType || 0,
        display_name: player.destinyUserInfo?.displayName || '',
        character_id: firstEntry.characterId || '',
        completed: values.completed?.basic?.value === 1,
        deaths: values.deaths?.basic?.value || 0,
        kills: values.kills?.basic?.value || 0,
        assists: values.assists?.basic?.value || 0,
        duration_seconds: values.activityDurationSeconds?.basic?.value || 0,
        standing: values.standing?.basic?.value || 0,
        starting_phase_index: activityDetails.startingPhaseIndex || 0,
        fireteam_id: extended.fireteamId?.basic?.displayValue || '',
        is_private: activityDetails.isPrivate || false,
        dump_id: 'live',
        game: activityDetails.mode <= 4 ? 'D1' : 'D2',
      };
    } catch (error) {
      logger.error('Failed to convert PGCR to lean format', { error, instanceId });
      return null;
    }
  }
}
