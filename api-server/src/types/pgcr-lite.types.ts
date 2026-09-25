import { LeanActivity } from '../types/lean-activity.types';

/**
 * PgcrLite format - Bungie-compatible shape expected by Destiny Chronicle Angular app.
 */
export interface PgcrLite {
  /** Which game's PGCR this is (D1 and D2 instance IDs overlap numerically). */
  game?: 'D1' | 'D2';
  /** Where the report came from. */
  _source?: 'archive' | 'live';
  activityDetails: {
    /** ISO/archive timestamp of the activity; null when the source has no period (never "now"). */
    period: string | null;
    instanceId: string;
    referenceId: number;
    directorActivityHash: number;
    mode: number;
    isPrivate?: boolean;
  };
  entries: PgcrLiteEntry[];
}

export interface PgcrLiteEntry {
  player: {
    destinyUserInfo: {
      membershipId: string;
      membershipType: number;
      displayName: string;
    };
  };
  characterId: string;
  values: {
    deaths: { basic: { value: number } };
    kills: { basic: { value: number } };
    assists: { basic: { value: number } };
    completed: { basic: { value: number } };
    activityDurationSeconds: { basic: { value: number } };
    standing: { basic: { value: number } };
  };
}

/**
 * Convert lean activities to PgcrLite format.
 * Takes multiple lean rows (one per player) and combines into single PGCR.
 */
export function leanToPgcrLite(activities: LeanActivity[]): PgcrLite | null {
  if (activities.length === 0) {
    return null;
  }

  // Use first activity for shared details
  const first = activities[0];

  return {
    game: first.game,
    _source: 'archive',
    activityDetails: {
      period: first.period ? first.period : null,
      instanceId: first.instance_id,
      referenceId: first.activity_hash,
      directorActivityHash: first.director_activity_hash,
      mode: first.mode,
      isPrivate: first.is_private,
    },
    entries: activities.map((activity) => ({
      player: {
        destinyUserInfo: {
          membershipId: activity.membership_id,
          membershipType: activity.membership_type,
          displayName: activity.display_name,
        },
      },
      characterId: activity.character_id,
      values: {
        deaths: { basic: { value: activity.deaths } },
        kills: { basic: { value: activity.kills } },
        assists: { basic: { value: activity.assists } },
        completed: { basic: { value: activity.completed ? 1 : 0 } },
        activityDurationSeconds: { basic: { value: activity.duration_seconds } },
        standing: { basic: { value: activity.standing } },
      },
    })),
  };
}
