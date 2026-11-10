import { Injectable } from '@angular/core';
import {
  ActivityBreakdownService,
  BreakdownMembershipScope,
} from './activity-breakdown.service';
import { ActivityHistoryLoaderService } from './activity-history-loader.service';
import { PgcrApiService } from '../core/data/archive-api.service';
import { StoredActivity } from './activity-db.service';
import { breakdownActivityDedupeKey } from '../utils/breakdown-account-identity';
import {
  leanFromArchiveLight,
  mergeTimeStorySourceRows,
  timeStorySourceSeconds,
  type TimeStorySourceRow,
} from '../utils/time-story-source';
import {
  buildTimeStoryByYear,
  type TimeStoryByYearResult,
} from '../utils/time-story-by-year';
import type { TimeStoryGroupId } from '../utils/time-story-groups';

/** Lean fields the year chart needs; full activity objects are not kept. */
export interface TimeStoryLeanRow {
  instanceId?: string;
  period?: string;
  group: TimeStoryGroupId | null;
  timeSeconds: number;
}

@Injectable({ providedIn: 'root' })
export class TimeStoryService {
  constructor(
    private breakdown: ActivityBreakdownService,
    private loader: ActivityHistoryLoaderService,
    private archiveApi: PgcrApiService
  ) {}

  async getYearBars(
    scopes: BreakdownMembershipScope[],
    identityByMembership?: Record<string, string>,
    timeZone?: string
  ): Promise<TimeStoryByYearResult> {
    if (!scopes.length) {
      return { years: [], totalSeconds: 0, totalGames: 0 };
    }
    const sources = await this.collectSourceRows(scopes);
    const seen = new Set<string>();
    const lean: TimeStoryLeanRow[] = [];
    for (const row of sources) {
      const stub = this.stubForDedupeAndGroup(row);
      const key = breakdownActivityDedupeKey(stub, identityByMembership);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      lean.push({
        instanceId: row.instanceId,
        period: row.period,
        timeSeconds: timeStorySourceSeconds(row),
        group: this.breakdown.timeStoryGroupForActivity(stub as StoredActivity),
      });
    }
    return buildTimeStoryByYear(lean, r => r.group, timeZone);
  }

  /**
   * Lean archive list already held by the loader (plus Bungie fill rows),
   * falling back to the in-memory archive activities cache. Never reads IDB.
   */
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
