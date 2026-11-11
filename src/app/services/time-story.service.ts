import { Injectable } from '@angular/core';
import {
  ActivityBreakdownService,
  BreakdownMembershipScope,
  type ActivityCountRow,
} from './activity-breakdown.service';
import { ActivityHistoryLoaderService } from './activity-history-loader.service';
import { PgcrApiService } from '../core/data/archive-api.service';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { PGCRCacheService } from './pgcr-cache.service';
import { d1PgcrCacheKey } from '../utils/pgcr-prune';
import { backfillD1DurationsFromCache } from '../utils/time-story-d1-duration';
import { dedupeLinkedSourceRows } from '../utils/time-story-linked-dedupe';
import {
  leanFromArchiveLight,
  mergeTimeStorySourceRows,
  timeStorySourceSeconds,
  type TimeStorySourceRow,
} from '../utils/time-story-source';
import {
  type TimeStoryByYearResult,
  type TimeStoryYearFilter,
} from '../utils/time-story-by-year';
import {
  buildTimeStoryYearGroupResults,
  type TimeStoryYearGroupResults,
} from '../utils/time-story-year-group-results';
import {
  buildTimeStoryEras,
  TIME_STORY_UNKNOWN_ACTIVITY,
  type TimeStoryEraItem,
} from '../utils/time-story-eras';
import {
  aggregateUnifiedCountRows,
  buildUnifiedYearBars,
  filterUnifiedByYear,
  type UnifiedBreakdownSource,
} from '../utils/unified-breakdown-year';

export interface TimeStoryLeanRow {
  instanceId?: string;
  period?: string;
  group: string | null;
  timeSeconds: number;
}

export interface UnifiedBreakdownView {
  records: UnifiedBreakdownSource[];
  bars: TimeStoryByYearResult;
  timeZone?: string;
}

@Injectable({ providedIn: 'root' })
export class TimeStoryService {
  private unifiedCache: { key: string; view: UnifiedBreakdownView } | null = null;

  constructor(
    private breakdown: ActivityBreakdownService,
    private loader: ActivityHistoryLoaderService,
    private archiveApi: PgcrApiService,
    private manifest: DestinyManifestService,
    private pgcrCache: PGCRCacheService
  ) {}

  clearUnifiedCache(): void {
    this.unifiedCache = null;
  }

  async getYearBars(
    scopes: BreakdownMembershipScope[],
    identityByMembership?: Record<string, string>,
    timeZone?: string
  ): Promise<TimeStoryByYearResult> {
    return (await this.getUnifiedView(scopes, identityByMembership, timeZone)).bars;
  }

  async getUnifiedView(
    scopes: BreakdownMembershipScope[],
    identityByMembership?: Record<string, string>,
    timeZone?: string
  ): Promise<UnifiedBreakdownView> {
    if (!scopes.length) {
      return { records: [], bars: { years: [], totalSeconds: 0, totalGames: 0 }, timeZone };
    }
    const key = this.unifiedCacheKey(scopes, identityByMembership, timeZone);
    if (this.unifiedCache?.key === key) return this.unifiedCache.view;
    const sources = await this.dedupedSourceRows(scopes, identityByMembership);
    const records = sources
      .map(row => this.breakdown.describeLeanRow(row))
      .filter((row): row is UnifiedBreakdownSource => row != null);
    const keys = [...new Set(records.map(row => row.sectionKey))];
    keys.sort((a, b) => {
      const order = this.breakdown.sectionOrder(a) - this.breakdown.sectionOrder(b);
      return order !== 0 ? order : a.localeCompare(b);
    });
    const view: UnifiedBreakdownView = {
      records,
      bars: buildUnifiedYearBars(records, timeZone, keys),
      timeZone,
    };
    this.unifiedCache = { key, view };
    return view;
  }

  countRowsForYear(
    records: UnifiedBreakdownSource[],
    year: TimeStoryYearFilter,
    timeZone?: string
  ): ActivityCountRow[] {
    return aggregateUnifiedCountRows(filterUnifiedByYear(records, year, timeZone));
  }

  labelForGroup(sectionKey: string, game?: 'D1' | 'D2'): string {
    return this.breakdown.labelForSectionKey(sectionKey, game);
  }

  private unifiedCacheKey(
    scopes: BreakdownMembershipScope[],
    identityByMembership: Record<string, string> | undefined,
    timeZone?: string
  ): string {
    const scopeKey = scopes.map(s => `${s.game}:${s.membershipId}`).slice().sort().join(',');
    const identityKey = Object.entries(identityByMembership || {})
      .map(([id, ident]) => `${id}=${ident}`)
      .sort()
      .join(',');
    return `${scopeKey}|${identityKey}|${timeZone || ''}`;
  }

  /**
   * All games behind a year+group, same classify/dedupe/year bounds as the bars.
   * Lean local sources only; does not fetch PGCRs.
   */
  async getYearGroupResults(
    scopes: BreakdownMembershipScope[],
    identityByMembership: Record<string, string> | undefined,
    year: TimeStoryYearFilter,
    group: string,
    timeZone?: string,
    chartGames?: number | null
  ): Promise<TimeStoryYearGroupResults> {
    const allowedGames = [...new Set(scopes.map(scope => scope.game))];
    if (!scopes.length) {
      return buildTimeStoryYearGroupResults([], {
        year,
        group,
        timeZone,
        allowedGames,
        classify: () => group,
        chartGames,
      });
    }
    const view = await this.getUnifiedView(scopes, identityByMembership, timeZone);
    const classified = view.records.map(row => ({
      ...row,
      timeSeconds: row.seconds,
      group: row.sectionKey,
    }));
    return buildTimeStoryYearGroupResults(classified, {
      year,
      group,
      timeZone,
      allowedGames,
      classify: row => row.group,
      chartGames,
    });
  }

    activityNameForSource(game: 'D1' | 'D2' | undefined, hash: string | number | undefined): string {
    if (hash == null || String(hash) === '') return TIME_STORY_UNKNOWN_ACTIVITY;
    return this.activityNameForEra(game === 'D1' ? 'D1' : 'D2', String(hash));
  }

  async getEras(
    scopes: BreakdownMembershipScope[],
    identityByMembership?: Record<string, string>,
    timeZone?: string
  ): Promise<TimeStoryEraItem[]> {
    if (!scopes.length) return [];
    const sources = await this.dedupedSourceRows(scopes, identityByMembership);
    const games = Array.from(new Set(scopes.map(s => s.game)));
    return buildTimeStoryEras(
      sources.map(row => ({
        period: row.period,
        game: row.game,
        activityHash: row.activityHash,
        timeSeconds: timeStorySourceSeconds(row),
      })),
      {
        timeZone,
        games,
        resolveActivityName: (game, hash) => this.activityNameForEra(game, hash),
      }
    );
  }

  /**
   * Lean archive list already held by the loader (plus Bungie fill rows),
   * falling back to the in-memory archive activities cache. Activity history IDB
   * is not scanned; missing D1 durations may be filled from the local PGCR cache.
   */
  private async dedupedSourceRows(
    scopes: BreakdownMembershipScope[],
    identityByMembership?: Record<string, string>
  ): Promise<TimeStorySourceRow[]> {
    const sources = await this.collectSourceRows(scopes);
    const withDurations = await backfillD1DurationsFromCache(sources, (instanceId, period) =>
      this.lookupCachedD1Duration(instanceId, period)
    );
    return dedupeLinkedSourceRows(withDurations, identityByMembership);
  }


  /** Cache-only D1 duration lookup (no network). Mirrors pre-unified PGCR cache backfill. */
  private async lookupCachedD1Duration(instanceId: string, period?: string): Promise<number | null> {
    if (period) {
      try {
        const keyed = await this.pgcrCache.getD1PGCR(instanceId, period);
        if (typeof keyed?.duration === 'number' && Number.isFinite(keyed.duration) && keyed.duration > 0) {
          return keyed.duration;
        }
      } catch {
        /* cache miss */
      }
    }
    try {
      const legacy = await this.pgcrCache.getBatch([instanceId, period ? d1PgcrCacheKey(instanceId, period) : instanceId]);
      for (const value of legacy.values()) {
        if (typeof value?.duration === 'number' && Number.isFinite(value.duration) && value.duration > 0) {
          return value.duration;
        }
      }
    } catch {
      /* cache miss */
    }
    return null;
  }

  private activityNameForEra(game: 'D1' | 'D2', hash: string): string {
    const raw =
      game === 'D1'
        ? ActivityDbService.getD1FamilyName(hash) || this.manifest.getActivityName(hash, true)
        : this.manifest.getActivityFamilyName(hash) || this.manifest.getActivityName(hash, false);
    if (!raw || raw === 'Unknown Activity' || raw === 'Loading...') {
      return TIME_STORY_UNKNOWN_ACTIVITY;
    }
    return raw;
  }

  private async collectSourceRows(scopes: BreakdownMembershipScope[]): Promise<TimeStorySourceRow[]> {
    const merged: TimeStorySourceRow[] = [];
    const seenScope = new Set<string>();
    for (const scope of scopes) {
      const scopeKey = `${scope.membershipId}|${scope.game}`;
      if (seenScope.has(scopeKey)) continue;
      seenScope.add(scopeKey);

      let rows = this.loader.getTimeStorySources(scope.membershipId, scope.game);
      if (!rows.length) {
        try {
          const archive = await this.archiveApi.fetchPlayerActivities(scope.membershipId, {
            game: scope.game,
            limit: 100000,
          });
          rows = (archive?.activities ?? [])
            .map(light => leanFromArchiveLight(light))
            .filter((row): row is TimeStorySourceRow => row != null)
            .filter(row => !row.game || row.game === scope.game);
        } catch {
          rows = [];
        }
      }
      merged.push(...rows);
    }
    return mergeTimeStorySourceRows([], merged);
  }

  private stubForDedupeAndGroup(row: TimeStorySourceRow): {
    membershipId?: string;
    game?: 'D1' | 'D2';
    period?: string;
    activityDetails: { instanceId?: string; referenceId?: string; mode?: number };
  } {
    const hash = row.activityHash;
    return {
      membershipId: row.membershipId,
      game: row.game,
      period: row.period,
      activityDetails: {
        instanceId: row.instanceId,
        referenceId: hash != null && String(hash) !== '' ? String(hash) : undefined,
        mode: row.mode,
      },
    };
  }
}
