import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { PGCRCacheService } from './pgcr-cache.service';
import { PgcrApiService } from './pgcr-api.service';
import { PrunedPgcr } from '../utils/pgcr-prune';
import { pickBestPlayerDisplayName } from '../utils/pgcr-player-name';

export interface FireteamPartnerRow {
  membershipId: string;
  displayName: string;
  activitiesTogether: number;
  timeTogetherSeconds: number;
  lastPlayedTogether?: string;
}

export interface FireteamCoverage {
  totalActivities: number;
  pgcrCached: number;
  percent: number;
}

export interface MissingPgcrEntry {
  id: string;
  isD1: boolean;
  period: string;
}

export type PlayedWithSortColumn = 'activities' | 'time' | 'lastPlayed';

/** Incremental partner stats — avoids rescanning the full PGCR cache on every update. */
export class FireteamStatsSession {
  private readonly partners = new Map<string, FireteamPartnerRow>();
  private readonly processedIds = new Set<string>();
  private readonly ourIds: Set<string>;

  readonly totalActivities: number;
  pgcrCached = 0;
  fromApi = false;

  constructor(membershipIds: string[], totalActivities: number) {
    this.ourIds = new Set(membershipIds);
    this.totalActivities = totalActivities;
  }

  get coverage(): FireteamCoverage {
    const percent =
      this.totalActivities > 0
        ? Math.round((100 * this.pgcrCached) / this.totalActivities)
        : 0;
    return {
      totalActivities: this.totalActivities,
      pgcrCached: this.pgcrCached,
      percent
    };
  }

  /** Returns true when this PGCR was newly ingested. */
  mergePgcr(pgcr: PrunedPgcr): boolean {
    if (!pgcr?.id || this.processedIds.has(pgcr.id)) {
      return false;
    }
    if (!pgcr.players?.length) {
      this.processedIds.add(pgcr.id);
      this.pgcrCached++;
      return true;
    }

    const ourPresent = pgcr.players.some(p => p.id && this.ourIds.has(p.id));
    if (!ourPresent) {
      this.processedIds.add(pgcr.id);
      this.pgcrCached++;
      return true;
    }

    this.processedIds.add(pgcr.id);
    this.pgcrCached++;

    const period = pgcr.period;
    const fallbackDuration = pgcr.duration ?? 0;

    for (const player of pgcr.players) {
      if (!player.id || this.ourIds.has(player.id)) {
        continue;
      }

      let row = this.partners.get(player.id);
      if (!row) {
        row = {
          membershipId: player.id,
          displayName: player.name || 'Guardian',
          activitiesTogether: 0,
          timeTogetherSeconds: 0
        };
        this.partners.set(player.id, row);
      }

      row.activitiesTogether++;
      row.timeTogetherSeconds += player.timeSeconds || fallbackDuration;
      row.displayName = pickBestPlayerDisplayName(row.displayName, player.name);
      if (period && (!row.lastPlayedTogether || period > row.lastPlayedTogether)) {
        row.lastPlayedTogether = period;
      }
    }

    return true;
  }

  mergePgcrBatch(pgcrs: PrunedPgcr[]): number {
    let added = 0;
    for (const pgcr of pgcrs) {
      if (this.mergePgcr(pgcr)) {
        added++;
      }
    }
    return added;
  }

  getPartners(): FireteamPartnerRow[] {
    return [...this.partners.values()];
  }

  sortPartners(
    column: PlayedWithSortColumn,
    direction: 'asc' | 'desc'
  ): FireteamPartnerRow[] {
    const dir = direction === 'asc' ? 1 : -1;
    return this.getPartners().sort((a, b) => {
      switch (column) {
        case 'time':
          return (a.timeTogetherSeconds - b.timeTogetherSeconds) * dir;
        case 'lastPlayed': {
          const aT = a.lastPlayedTogether ? Date.parse(a.lastPlayedTogether) : 0;
          const bT = b.lastPlayedTogether ? Date.parse(b.lastPlayedTogether) : 0;
          return (aT - bT) * dir;
        }
        case 'activities':
        default:
          return (a.activitiesTogether - b.activitiesTogether) * dir;
      }
    });
  }

  /** Preload partner rows from Chronicle PGCR API (full corpus). */
  seedFromApiPartners(partners: FireteamPartnerRow[]): void {
    for (const p of partners) {
      this.partners.set(p.membershipId, { ...p });
    }
    this.pgcrCached = this.totalActivities;
  }
}

@Injectable({
  providedIn: 'root'
})
export class FireteamStatsService {
  constructor(
    private activityDb: ActivityDbService,
    private pgcrCache: PGCRCacheService,
    private pgcrApi: PgcrApiService
  ) {}

  async createSession(
    membershipIds: string[],
    onChunk?: (session: FireteamStatsSession) => void
  ): Promise<FireteamStatsSession> {
    const allIds = await this.collectInstanceIds(membershipIds);
    const session = new FireteamStatsSession(membershipIds, allIds.length);

    if (this.pgcrApi.enabled) {
      const apiPartners = await this.pgcrApi.fetchPlayedWithStats(membershipIds);
      if (apiPartners?.length) {
        session.fromApi = true;
        session.seedFromApiPartners(
          apiPartners.map(p => ({
            membershipId: p.membershipId,
            displayName: p.displayName,
            activitiesTogether: p.activitiesTogether,
            timeTogetherSeconds: p.timeTogetherSeconds,
            lastPlayedTogether: p.lastPlayedTogether
          }))
        );
        onChunk?.(session);
        return session;
      }
    }

    const chunkSize = 400;
    for (let i = 0; i < allIds.length; i += chunkSize) {
      const chunk = allIds.slice(i, i + chunkSize);
      const batch = await this.pgcrCache.getBatch(chunk);
      const pgcrs: PrunedPgcr[] = [];
      for (const id of chunk) {
        const pgcr = batch.get(id);
        if (pgcr) {
          pgcrs.push(pgcr);
        }
      }
      if (pgcrs.length > 0) {
        session.mergePgcrBatch(pgcrs);
        onChunk?.(session);
      }
      await yieldToUi();
    }

    return session;
  }

  /** Missing PGCRs newest-first so partner stats populate from recent play first. */
  async collectMissingPgcrQueue(membershipIds: string[]): Promise<MissingPgcrEntry[]> {
    const metaById = new Map<string, MissingPgcrEntry>();

    for (const membershipId of membershipIds) {
      const acts = await this.activityDb.getAllActivitiesForMembershipOptimized(membershipId);
      for (const a of acts) {
        const inst = ActivityDbService.resolveStoredActivityInstanceId(a);
        if (!inst) {
          continue;
        }
        const period = a.period || '';
        const isD1 = a.game === 'D1';
        const existing = metaById.get(inst);
        if (!existing || period > existing.period) {
          metaById.set(inst, { id: inst, isD1, period });
        }
      }
    }

    const allIds = [...metaById.keys()];
    if (allIds.length === 0) {
      return [];
    }

    const missingSet = new Set(await this.pgcrCache.getMissingPGCRs(allIds));
    return [...metaById.values()]
      .filter(entry => missingSet.has(entry.id))
      .sort((a, b) => b.period.localeCompare(a.period));
  }

  private async collectInstanceIds(membershipIds: string[]): Promise<string[]> {
    const ids = new Set<string>();
    for (const membershipId of membershipIds) {
      const acts = await this.activityDb.getAllActivitiesForMembershipOptimized(membershipId);
      for (const a of acts) {
        const inst = ActivityDbService.resolveStoredActivityInstanceId(a);
        if (inst) {
          ids.add(inst);
        }
      }
    }
    return [...ids];
  }
}

function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
