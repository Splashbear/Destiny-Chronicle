import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ActivityHistory } from '../models/activity-history.model';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ActivityDbService } from './activity-db.service';
import { collectPlayerFirstCompletions } from '../utils/collect-guardian-firsts';
import { aggregateGuardianFirstsFromLists } from '../utils/guardian-firsts-dedupe';

/**
 * Host for loading / aggregating Guardian Firsts (CODE_CLEANUP_SPEC).
 */
export interface GuardianFirstsLoadHost {
  setLoadingGuardianFirsts(loading: boolean): void;
  isD1Player(player: PlayerSearchDisplay): boolean;
  getPlayerKey(player: PlayerSearchDisplay): string;
  getCharacterIdsForPlayer(player: PlayerSearchDisplay): string[];
  setGuardianFirstsForPlayer(playerKey: string, firsts: ActivityFirstCompletion[]): void;
  getGuardianFirstsMapValues(): ActivityFirstCompletion[][];
  setAggregateGuardianFirsts(firsts: ActivityFirstCompletion[]): void;
  setGuardianFirsts(firsts: ActivityFirstCompletion[]): void;
  deriveFirstEverFromLoadedFirsts(
    player: PlayerSearchDisplay,
    sorted: ActivityFirstCompletion[]
  ): ActivityHistory | undefined;
  computeFirstEverActivityForPlayer(
    player: PlayerSearchDisplay
  ): Promise<ActivityHistory | undefined>;
  setFirstEverForPlayer(playerKey: string, activity: ActivityHistory | undefined): void;
  bumpFirstEverActivities(): void;
  rebuildAggregateGuardianFirstsFromMap(): void;
  updatePlatformTabs(): void;
  checkAndShowAnniversaryBanner(): void;
  detectChanges(): void;
}

/**
 * Per-player Firsts load + aggregate update (CODE_CLEANUP_SPEC).
 * Off the browse-ready critical path — does not touch accountLoadingStatus.
 */
@Injectable({ providedIn: 'root' })
export class GuardianFirstsLoadService {
  constructor(private activityDb: ActivityDbService) {}

  async loadDungeonSoloFirsts(
    host: {
      setLoadingSolo(membershipId: string, loading: boolean): void;
      setDungeonSoloFirsts(membershipId: string, data: unknown[]): void;
      detectChanges(): void;
    },
    membershipId: string
  ): Promise<void> {
    host.setLoadingSolo(membershipId, true);
    try {
      const data = await this.activityDb.getDungeonSoloFirsts(membershipId);
      host.setDungeonSoloFirsts(membershipId, data);
    } catch (error) {
      console.error('[SoloFirsts] Error loading dungeon solos:', error);
      host.setDungeonSoloFirsts(membershipId, []);
    } finally {
      host.setLoadingSolo(membershipId, false);
      host.detectChanges();
    }
  }

  async loadGuardianFirsts(
    host: GuardianFirstsLoadHost,
    player: PlayerSearchDisplay
  ): Promise<void> {
    host.setLoadingGuardianFirsts(true);
    const game = host.isD1Player(player) ? 'D1' : 'D2';
    try {
      const charIds = host.getCharacterIdsForPlayer(player);
      if (environment.traceGuardianFirsts) {
        console.log('[Firsts·trace]', 'ui:loadGuardianFirsts_start', {
          displayName: player.displayName,
          game,
          membershipIdTail: player.membershipId?.slice(-8),
          characterCount: charIds.length,
          characterIdsTail: charIds.map((id) => id.slice(-8)),
        });
      }
      const sorted = await collectPlayerFirstCompletions(this.activityDb, {
        membershipId: player.membershipId,
        characterIds: charIds,
        game,
        includeD1MembershipStoryFirsts: true,
        trace: environment.traceGuardianFirsts,
      });

      const pKey = host.getPlayerKey(player);
      host.setGuardianFirstsForPlayer(pKey, sorted);
      if (environment.traceGuardianFirsts) {
        const story = sorted.filter((f) => f.type === 'story');
        console.log('[Firsts·trace]', 'ui:after_account_dedupe', {
          playerKey: pKey,
          totalFirsts: sorted.length,
          storyCount: story.length,
          storySummary: story.map((f) => ({
            storyReleaseId: f.storyReleaseId,
            name: f.name,
            instanceId: f.instanceId,
            period: f.completionDate,
          })),
        });
      }
      const aggregate = aggregateGuardianFirstsFromLists(host.getGuardianFirstsMapValues());
      host.setAggregateGuardianFirsts(aggregate);
      host.setGuardianFirsts(aggregate);
      host.setFirstEverForPlayer(
        pKey,
        host.deriveFirstEverFromLoadedFirsts(player, sorted) ??
          (await host.computeFirstEverActivityForPlayer(player))
      );
      host.bumpFirstEverActivities();
    } catch (error) {
      console.error('[Firsts] Error loading guardian firsts:', error);
      const pKey = host.getPlayerKey(player);
      host.setGuardianFirstsForPlayer(pKey, []);
      host.setFirstEverForPlayer(pKey, undefined);
      host.bumpFirstEverActivities();
      host.rebuildAggregateGuardianFirstsFromMap();
    } finally {
      host.setLoadingGuardianFirsts(false);
      host.updatePlatformTabs();
      host.checkAndShowAnniversaryBanner();
      host.detectChanges();
    }
  }
}
