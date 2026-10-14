import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { PGCRCacheService } from './pgcr-cache.service';
import { PgcrApiService, PlayedWithAccount, PlayedWithBuildProgress, PlayedWithCoverageInfo, PlayedWithPerAccount } from './pgcr-api.service';
import { PrunedPgcr } from '../utils/pgcr-prune';
import { pickBestPlayerDisplayName } from '../utils/pgcr-player-name';

export interface FireteamPartnerRow {
  membershipId: string;
  displayName: string;
  activitiesTogether: number;
  timeTogetherSeconds: number;
  lastPlayedTogether?: string;
  perAccount?: PlayedWithPerAccount[];
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

/** Games together with one account (0 when the partner never played with it). */
export function perAccountGames(row: FireteamPartnerRow, accountId: string): number {
  return row.perAccount?.find(a => a.id === accountId)?.activitiesTogether ?? 0;
}

/** Incremental partner stats — avoids rescanning the full PGCR cache on every update. */
export class FireteamStatsSession {
  private readonly partners = new Map<string, FireteamPartnerRow>();
  private readonly processedIds = new Set<string>();
  private readonly ourIds: Set<string>;

  readonly totalActivities: number;
  pgcrCached = 0;
  fromApi = false;
  /** True when the archive API queued a Played With summary build (no partners yet). */
  pendingBuild = false;
  pendingStatus?: string;
  pendingPosition?: number | null;
  pendingProgress?: PlayedWithBuildProgress | null;
  /** Per-account status from the server (v2). */
  accounts: PlayedWithAccount[] = [];
  /** Some selected accounts are still building. */
  partial = false;
  serverCoverage: PlayedWithCoverageInfo | null = null;

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
    direction: 'asc' | 'desc',
    byAccount?: string
  ): FireteamPartnerRow[] {
    const dir = direction === 'asc' ? 1 : -1;
    return this.getPartners().sort((a, b) => {
      if (byAccount && column === 'activities') {
        const d = perAccountGames(a, byAccount) - perAccountGames(b, byAccount);
        if (d !== 0) {
          return d * dir;
        }
      }
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
    onChunk?: (session: FireteamStatsSession) => void,
    opts: { include?: string[]; sortBy?: string } = {}
  ): Promise<FireteamStatsSession> {
    const allIds = await this.collectInstanceIds(membershipIds);
    const session = new FireteamStatsSession(membershipIds, allIds.length);

    if (this.pgcrApi.enabled) {
      const api = await this.pgcrApi.fetchPlayedWithStats(membershipIds, opts);
      if (api) {
        session.accounts = api.accounts ?? [];
        session.partial = !!api.partial;
        session.serverCoverage = api.coverage ?? null;
      }
      if (api?.pending) {
        // Queued on the server — do not fall through to a local PGCR scan (that can hang).
        session.fromApi = true;
        session.pendingBuild = true;
        session.pendingStatus = api.status;
        session.pendingPosition = api.position ?? null;
        session.pendingProgress = api.progress ?? null;
        onChunk?.(session);
        return session;
      }
      if (api && !api.pending && api.partners.length) {
        session.fromApi = true;
        session.seedFromApiPartners(
          api.partners.map(p => ({
            membershipId: p.membershipId,
            displayName: p.displayName,
            activitiesTogether: p.activitiesTogether,
            timeTogetherSeconds: p.timeTogetherSeconds,
            lastPlayedTogether: p.lastPlayedTogether,
            perAccount: p.perAccount
          }))
        );
        onChunk?.(session);
        return session;
      }
      // Empty ready summary (0 partners) — still treat as API so we skip local scan.
      if (api && !api.pending) {
        session.fromApi = true;
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
