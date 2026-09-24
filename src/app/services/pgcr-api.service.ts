import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ExternalPgcrPartner {
  membershipId: string;
  displayName: string;
  activitiesTogether: number;
  timeTogetherSeconds: number;
  lastPlayedTogether?: string;
}

export interface LightActivityRow {
  instanceId: string;
  period: string;
  activityHash: string;
  mode: number;
  membershipId: string;
  membershipType: number;
  characterId: string;
  completed: number;
  deaths: number;
  kills: number;
  assists: number;
  durationSeconds: number;
  game: 'D1' | 'D2';
  displayName: string;
}

export interface PlayerActivitiesCoverage {
  level: 'full' | 'partial' | 'absent';
  source: 'lite' | 'extract' | 'compact_ids' | 'none' | 'pending' | 'archive';
  rowCount: number;
  distinctInstances?: number;
  minPeriod?: string | null;
  maxPeriod?: string | null;
  watermarkNote?: string;
  indexComplete?: boolean;
  filtersApplied?: boolean;
  notes?: string[];
}

export interface PlayerActivitiesResponse {
  membershipId: string;
  coverage: PlayerActivitiesCoverage;
  activities: LightActivityRow[];
  partialInstanceIds?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class PgcrApiService {
  /** Dedupe concurrent cold-start character loads for the same mid+game. */
  private playerActivitiesInflight = new Map<string, Promise<PlayerActivitiesResponse | null>>();
  private playerActivitiesCache = new Map<string, PlayerActivitiesResponse | null>();

  constructor(private http: HttpClient) {}

  get enabled(): boolean {
    return environment.useExternalPgcr && !!environment.pgcrApiRoot?.trim();
  }

  /** Drop memoized player activity lists (e.g. after IDB wipe / new sync session). */
  clearPlayerActivitiesCache(): void {
    this.playerActivitiesCache.clear();
    this.playerActivitiesInflight.clear();
  }

  private headers(): HttpHeaders {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = environment.pgcrApiKey?.trim();
    if (key) {
      h['X-API-Key'] = key;
    }
    return new HttpHeaders(h);
  }

  private url(path: string): string {
    const root = environment.pgcrApiRoot.replace(/\/+$/, '');
    return `${root}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async fetchPgcr(instanceId: string, game: 'D1' | 'D2'): Promise<unknown | null> {
    if (!this.enabled) {
      return null;
    }
    try {
      return await firstValueFrom(
        this.http.get(this.url(`/pgcr/${instanceId}`), {
          headers: this.headers(),
          params: { game, format: 'lite' }
        })
      );
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        return null;
      }
      throw err;
    }
  }

  async fetchPgcrBatch(instanceIds: string[], game: 'D1' | 'D2'): Promise<Map<string, unknown>> {
    const out = new Map<string, unknown>();
    if (!this.enabled || !instanceIds.length) {
      return out;
    }
    const chunkSize = 100;
    for (let i = 0; i < instanceIds.length; i += chunkSize) {
      const chunk = instanceIds.slice(i, i + chunkSize);
      try {
        const body = await firstValueFrom(
          this.http.post<Record<string, unknown>>(
            this.url('/pgcr/batch'),
            { instanceIds: chunk, game },
            { headers: this.headers(), params: { format: 'lite' } }
          )
        );
        for (const [id, pgcr] of Object.entries(body || {})) {
          if (pgcr) {
            out.set(id, pgcr);
          }
        }
      } catch {
        // Fall back to Bungie for this chunk
      }
    }
    return out;
  }

  async fetchPrunedPgcr(instanceId: string, game: 'D1' | 'D2'): Promise<unknown | null> {
    if (!this.enabled) {
      return null;
    }
    try {
      return await firstValueFrom(
        this.http.get(this.url(`/pgcr/${instanceId}`), {
          headers: this.headers(),
          params: { game, format: 'pruned' }
        })
      );
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        return null;
      }
      return null;
    }
  }

  async fetchPlayedWithStats(membershipIds: string[]): Promise<ExternalPgcrPartner[] | null> {
    if (!this.enabled || !membershipIds.length) {
      return null;
    }
    try {
      const resp = await firstValueFrom(
        this.http.post<{ partners: ExternalPgcrPartner[] }>(
          this.url('/played-with/stats'),
          { membershipIds, limit: 500 },
          { headers: this.headers() }
        )
      );
      return resp?.partners ?? [];
    } catch {
      return null;
    }
  }

  /**
   * Fetch archived activity history for a single player from the local PGCR archive API.
   * Returns light activity rows (without full PGCR bodies) for fast cold-start loading.
   * Falls back to null if the API is disabled or the player has no archived data.
   */
  async fetchPlayerActivities(
    membershipId: string,
    options?: { game?: 'D1' | 'D2'; from?: string; to?: string; limit?: number }
  ): Promise<PlayerActivitiesResponse | null> {
    if (!this.enabled) {
      return null;
    }

    const cacheKey = [
      membershipId,
      options?.game ?? '',
      options?.from ?? '',
      options?.to ?? '',
      String(options?.limit ?? '')
    ].join('|');

    if (this.playerActivitiesCache.has(cacheKey)) {
      return this.playerActivitiesCache.get(cacheKey) ?? null;
    }
    const inflight = this.playerActivitiesInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async (): Promise<PlayerActivitiesResponse | null> => {
      try {
        const params: Record<string, string> = {};
        if (options?.game) params['game'] = options.game;
        if (options?.from) params['from'] = options.from;
        if (options?.to) params['to'] = options.to;
        // Default high enough for PSN-scale histories (~7.4k); callers may override.
        params['limit'] = String(options?.limit ?? 10000);

        const response = await firstValueFrom(
          this.http.get<PlayerActivitiesResponse>(
            this.url(`/players/${membershipId}/activities`),
            { headers: this.headers(), params }
          )
        );
        this.playerActivitiesCache.set(cacheKey, response);
        return response;
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 404) {
          this.playerActivitiesCache.set(cacheKey, null);
          return null;
        }
        console.warn(`[Archive] fetchPlayerActivities failed for ${membershipId}:`, err);
        // Do not cache hard failures — allow retry / Bungie fallback on next character.
        return null;
      } finally {
        this.playerActivitiesInflight.delete(cacheKey);
      }
    })();

    this.playerActivitiesInflight.set(cacheKey, request);
    return request;
  }

  /**
   * Batch fetch archived activity history for multiple players.
   * More efficient than multiple individual requests when loading multiple accounts.
   */
  async fetchPlayerActivitiesBatch(
    membershipIds: string[]
  ): Promise<Map<string, PlayerActivitiesResponse>> {
    const result = new Map<string, PlayerActivitiesResponse>();
    if (!this.enabled || !membershipIds.length) {
      return result;
    }
    try {
      const response = await firstValueFrom(
        this.http.post<Record<string, PlayerActivitiesResponse>>(
          this.url('/players/activities/batch'),
          { membershipIds },
          { headers: this.headers() }
        )
      );
      for (const [membershipId, data] of Object.entries(response || {})) {
        if (data && data.coverage && data.activities) {
          result.set(membershipId, data);
        }
      }
      return result;
    } catch (err) {
      console.warn('[PgcrApiService] Failed to batch fetch player activities:', err);
      return result;
    }
  }
}
