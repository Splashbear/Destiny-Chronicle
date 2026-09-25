import { LeanActivity } from '../types/lean-activity.types';
import { logger } from '../utils/logger';

export type Game = 'D1' | 'D2';

/**
 * Error raised when Bungie answers with a non-success ErrorCode (e.g. 5 SystemDisabled)
 * or an unexpected HTTP status. Routes map this to 502 instead of inventing data.
 */
export class BungieApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly errorStatus?: string,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = 'BungieApiError';
  }
}

/** Bungie PlatformErrorCodes that mean "this PGCR does not exist". */
const PGCR_NOT_FOUND_CODES = new Set<number>([1653 /* DestinyPGCRNotFound */]);

/**
 * Parse the `game` query/body value. Returns null for anything other than D1/D2
 * (case-insensitive); callers default a missing value to D2 before calling this.
 */
export function parseGame(value: unknown): Game | null {
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'D1' || s === 'D2' ? s : null;
}

/**
 * Unwrap a Bungie PGCR envelope to the report body.
 * D2: { Response: { period, activityDetails, entries } }
 * D1: { Response: { data: { period, activityDetails, entries } } }
 */
export function unwrapPgcrBody(raw: any, game: Game): any {
  const response = raw?.Response ?? raw;
  if (game === 'D1') {
    return response?.data ?? response;
  }
  return response;
}

/**
 * Resolve the activity period from a PGCR body. Bungie puts `period` at the top of the
 * report (NOT inside activityDetails) for both D1 and D2. Returns null when missing or
 * unparseable: never substitute the current time.
 */
export function resolvePgcrPeriod(body: any): string | null {
  const p = body?.period ?? body?.activityDetails?.period;
  if (typeof p !== 'string' || p.trim() === '' || Number.isNaN(Date.parse(p))) {
    return null;
  }
  return p;
}

/**
 * Service for fetching activities from live Bungie API.
 */
export class BungieApiService {
  private apiKey: string;
  private apiRoot: string;
  private d1ApiRoot: string;

  constructor(apiKey: string, apiRoot: string, d1ApiRoot: string = 'https://www.bungie.net/d1/Platform') {
    this.apiKey = apiKey;
    this.apiRoot = apiRoot;
    this.d1ApiRoot = d1ApiRoot;
  }

  /** Game-specific PGCR URL. D1 and D2 instance IDs overlap numerically, so the game must be explicit. */
  getPgcrUrl(instanceId: string, game: Game): string {
    return game === 'D1'
      ? `${this.d1ApiRoot}/Destiny/Stats/PostGameCarnageReport/${instanceId}/`
      : `${this.apiRoot}/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`;
  }

  /**
   * Fetch a single PGCR from Bungie API (full response for DC compatibility).
   * Returns null when Bungie says the PGCR does not exist; throws BungieApiError for
   * any other failure (disabled system, throttling, 5xx).
   */
  async getBungiePgcr(instanceId: string, game: Game): Promise<unknown | null> {
    const url = this.getPgcrUrl(instanceId, game);
    logger.debug('Fetching full PGCR from Bungie', { instanceId, game });

    const response = await fetch(url, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const errorCode: number | undefined = typeof data?.ErrorCode === 'number' ? data.ErrorCode : undefined;

    if (response.status === 404 || (errorCode !== undefined && PGCR_NOT_FOUND_CODES.has(errorCode))) {
      logger.debug('PGCR not found on Bungie', { instanceId, game });
      return null;
    }

    if (!response.ok || (errorCode !== undefined && errorCode !== 1) || !data) {
      const err = new BungieApiError(
        `Bungie ${game} PGCR error: HTTP ${response.status} ${data?.ErrorStatus ?? ''}`.trim(),
        errorCode,
        data?.ErrorStatus,
        response.status
      );
      logger.warn('Bungie PGCR request failed', { instanceId, game, errorCode, errorStatus: data?.ErrorStatus, httpStatus: response.status });
      throw err;
    }

    return data;
  }

  /**
   * Fetch a single PGCR from Bungie API and convert to lean format.
   */
  async getActivityByInstanceId(instanceId: string, game: Game): Promise<LeanActivity | null> {
    const pgcr = await this.getBungiePgcr(instanceId, game);
    if (!pgcr) {
      return null;
    }
    return this.convertPgcrToLean(instanceId, pgcr, game);
  }

  /**
   * Convert Bungie PGCR format to lean activity format.
   * This is a simplified conversion - extend as needed.
   */
  private convertPgcrToLean(instanceId: string, pgcr: any, game: Game): LeanActivity | null {
    const body = unwrapPgcrBody(pgcr, game);
    const activityDetails = body?.activityDetails || {};
    const entries = body?.entries || [];

    if (entries.length === 0) {
      logger.warn('PGCR has no entries', { instanceId, game });
      return null;
    }

    const period = resolvePgcrPeriod(body);
    if (!period) {
      // Refuse to invent a timestamp; surface as an upstream data problem.
      throw new BungieApiError(`Bungie ${game} PGCR ${instanceId} has no period`);
    }

    const firstEntry = entries[0];
    const player = firstEntry.player || {};
    const values = firstEntry.values || {};
    const extended = firstEntry.extended?.values || {};

    return {
      instance_id: String(activityDetails.instanceId ?? instanceId),
      period,
      activity_hash: activityDetails.referenceId ?? 0,
      director_activity_hash: activityDetails.directorActivityHash ?? 0,
      mode: activityDetails.mode ?? activityDetails.modes?.[0] ?? 0,
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
      game,
    };
  }
}
