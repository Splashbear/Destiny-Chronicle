import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { PlatformStats } from '../models/platform-stats.model';
import { getCharacterId } from '../utils/character-profile';
import {
  aggregatePerTypeFromActivities,
  rollupPlatformStats,
  sumPlaytimeSecondsFromCharacters,
  totalActivityTimeOrFallback,
  type PerTypeStats,
} from '../utils/account-stats-rollup';
import { aggregateGuardianFirstsFromLists } from '../utils/guardian-firsts-dedupe';
import { collectPlayerFirstCompletions } from '../utils/collect-guardian-firsts';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

export interface AccountStatsSnapshot {
  totalTime: number;
  totalActivityTime: number;
  totalActivityCount: number;
  totalSeals: number;
  perType: PerTypeStats;
}

/**
 * Host callbacks for Account Summary + Guardian Firsts refresh.
 * PlayerSearchComponent implements this; IDB / UI writes stay on the host.
 */
export interface AccountStatsCalculatorHost {
  beginStatsToken(): number;
  getCurrentStatsToken(): number;
  getSelectedPlayers(): PlayerSearchDisplay[];
  getPlayerKey(player: PlayerSearchDisplay): string;
  isD1Player(player: PlayerSearchDisplay): boolean;
  getCharactersByKey(): { [key: string]: any[] | undefined };
  getActivitiesByKey(): { [key: string]: ActivityHistory[] | undefined };
  getAggregatedTitles(): any[] | null | undefined;
  /** Earned titles count — Account Summary matches Titles tab. */
  getUnlockedTitlesCount(): number;
  getActivityType(referenceId: any, mode: any): string;
  getActivityDurationSeconds(act: ActivityHistory): number;
  getClassName(classType: number): string;
  getGuardianFirstsMap(): { [key: string]: ActivityFirstCompletion[] };
  setGuardianFirstsMapEntry(key: string, firsts: ActivityFirstCompletion[]): void;
  deleteGuardianFirstsMapKey(key: string): void;
  setAggregateGuardianFirsts(firsts: ActivityFirstCompletion[]): void;
  setGuardianFirsts(firsts: ActivityFirstCompletion[]): void;
  setLoadingAccountStats(loading: boolean): void;
  setLoadingGuardianFirsts(loading: boolean): void;
  setPerPlatformStats(stats: PlatformStats[]): void;
  setAccountStats(stats: AccountStatsSnapshot): void;
  syncActivityStore(): void;
  detectChanges(): void;
  checkAndShowAnniversaryBanner(): void;
}

/**
 * Account Summary totals + Guardian Firsts refresh (CODE_CLEANUP_SPEC).
 * Extracted from PlayerSearchComponent.calculateAccountStats — behavior identical
 * aside from dropping unused D1-raid debug IDB scans.
 */
@Injectable({ providedIn: 'root' })
export class AccountStatsCalculatorService {
  constructor(private activityDb: ActivityDbService) {}

  async calculateAccountStats(host: AccountStatsCalculatorHost): Promise<void> {
    const token = host.beginStatsToken();
    host.setLoadingAccountStats(true);
    host.syncActivityStore();
    host.setLoadingGuardianFirsts(true);

    try {
      await this.refreshGuardianFirsts(host);
      host.detectChanges();

      const perType = aggregatePerTypeFromActivities(
        host.getActivitiesByKey(),
        (ref, mode) => host.getActivityType(ref, mode),
        act => host.getActivityDurationSeconds(act)
      );

      const totalTime = sumPlaytimeSecondsFromCharacters(
        host.getSelectedPlayers(),
        host.getCharactersByKey(),
        p => host.getPlayerKey(p)
      );
      const totalActivityTime = totalActivityTimeOrFallback(perType, totalTime);

      const activityCountByKey = new Map<string, number>();
      let totalActivities = 0;
      for (const pl of host.getSelectedPlayers()) {
        const count = await this.activityDb.countActivitiesForMembershipAndGame(
          pl.membershipId,
          pl.game as 'D1' | 'D2'
        );
        activityCountByKey.set(`${pl.membershipId}|${pl.game}`, count);
        totalActivities += count;
      }

      const totalSeals =
        host.getAggregatedTitles() && host.getAggregatedTitles()!.length > 0
          ? host.getUnlockedTitlesCount()
          : 0;

      const platformStats = rollupPlatformStats({
        players: host.getSelectedPlayers(),
        charactersByKey: host.getCharactersByKey(),
        aggregatedTitles: host.getAggregatedTitles(),
        activityCountByKey,
        getPlayerKey: p => host.getPlayerKey(p),
        getClassName: ct => host.getClassName(ct),
      });
      host.setPerPlatformStats(platformStats);

      host.setAccountStats({
        totalTime,
        totalActivityTime,
        totalActivityCount: totalActivities,
        totalSeals,
        perType: { ...perType },
      });
    } catch (error) {
      console.error('[GuardianFirsts][ERROR] Error in calculateAccountStats:', error);
    } finally {
      if (token === host.getCurrentStatsToken()) {
        host.setLoadingAccountStats(false);
        host.syncActivityStore();
      }
      host.setLoadingGuardianFirsts(false);
      console.log('[🎯 CALLING] checkAndShowAnniversaryBanner from calculateAccountStats');
      host.checkAndShowAnniversaryBanner();
      host.detectChanges();
    }
  }

  private async refreshGuardianFirsts(host: AccountStatsCalculatorHost): Promise<void> {
    const selectedKeys = new Set(host.getSelectedPlayers().map(p => host.getPlayerKey(p)));
    for (const k of Object.keys(host.getGuardianFirstsMap())) {
      if (!selectedKeys.has(k)) {
        host.deleteGuardianFirstsMapKey(k);
      }
    }

    for (const player of host.getSelectedPlayers()) {
      const statsGame = host.isD1Player(player) ? 'D1' : 'D2';
      const charIds = (host.getCharactersByKey()[host.getPlayerKey(player)] || [])
        .map(getCharacterId)
        .filter((id): id is string => !!id);
      const sorted = await collectPlayerFirstCompletions(this.activityDb, {
        membershipId: player.membershipId,
        characterIds: charIds,
        game: statsGame,
        requireCompleted: true,
      });
      host.setGuardianFirstsMapEntry(host.getPlayerKey(player), sorted);
    }

    const aggregate = aggregateGuardianFirstsFromLists(
      host.getSelectedPlayers().map(p => host.getGuardianFirstsMap()[host.getPlayerKey(p)])
    );
    host.setAggregateGuardianFirsts(aggregate);
    host.setGuardianFirsts(aggregate);
  }
}
