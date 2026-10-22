import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ActivityHistory } from '../models/activity-history.model';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { gameInstanceKey } from '../utils/heatmap-filters';
import { PgcrBatchCharacter } from './activity-pgcr-batch.service';

/**
 * Host for non-blocking PGCR character-class enrichment (CODE_CLEANUP_SPEC).
 * Must remain non-fatal and progress-friendly for weak machines.
 */
export interface PgcrCharacterClassEnrichHost {
  getSelectedPlayers(): PlayerSearchDisplay[];
  getPlayerKey(player: PlayerSearchDisplay): string;
  getSelectedCharacterId(playerKey: string): string;
  getPlatformName(membershipType: number | undefined): string;
  getPgcrBatchSize(): number;
  updateLoadingProgress(
    phase: 'pgcr',
    current: number,
    total: number,
    message: string
  ): void;
  validatePgcrBatch(
    activities: ActivityHistory[],
    character: PgcrBatchCharacter,
    startIdx: number
  ): Promise<ActivityHistory[]>;
  getFilteredActivitiesForDate(): ActivityWithMembership[];
}

/**
 * Enrich activities with characterClass from PGCR cache/API.
 * Extracted from PlayerSearchComponent.enrichActivitiesWithCharacterClass.
 */
@Injectable({ providedIn: 'root' })
export class PgcrCharacterClassEnrichService {
  async enrichActivitiesWithCharacterClass(
    host: PgcrCharacterClassEnrichHost,
    activities: ActivityHistory[]
  ): Promise<void> {
    try {
      if (!activities || activities.length === 0) return;

      const players = (host.getSelectedPlayers() || []).filter(Boolean);
      const batchSize = host.getPgcrBatchSize();
      let totalBatches = 0;
      for (const player of players) {
        const actsForPlayer = activities.filter(
          a =>
            !a.characterClass &&
            (a as any).membershipId === player.membershipId &&
            (!(a as any).game || (a as any).game === player.game)
        );
        if (actsForPlayer.length > 0) {
          totalBatches += Math.ceil(actsForPlayer.length / batchSize);
        }
      }
      if (totalBatches === 0) return;

      host.updateLoadingProgress('pgcr', 0, totalBatches, 'Loading post-game reports (PGCRs)…');
      let currentBatch = 0;

      for (const player of players) {
        const actsForPlayer = activities.filter(
          a =>
            !a.characterClass &&
            (a as any).membershipId === player.membershipId &&
            (!(a as any).game || (a as any).game === player.game)
        );
        if (actsForPlayer.length === 0) continue;

        const character: PgcrBatchCharacter = {
          characterId: host.getSelectedCharacterId(host.getPlayerKey(player)) || '',
          membershipType: player.membershipType,
          membershipId: player.membershipId,
          game: (player as any).game === 'D1' ? 'D1' : 'D2',
        };

        for (let idx = 0; idx < actsForPlayer.length; idx += batchSize) {
          if (environment.debug) {
            console.log('[Load] PGCR batch', {
              displayName: (player as any).displayName,
              platform: host.getPlatformName(player.membershipType),
              batch: currentBatch + 1,
              of: totalBatches,
              startIdx: idx,
            });
          }
          const validated = await host.validatePgcrBatch(actsForPlayer, character, idx);
          currentBatch += 1;
          host.updateLoadingProgress(
            'pgcr',
            currentBatch,
            totalBatches,
            `Loading post-game reports (PGCRs)… ${currentBatch} of ${totalBatches}`
          );
          if (!validated || validated.length === 0) continue;

          const clsByInstance = new Map<string, string | undefined>();
          for (const v of validated) {
            const iid = gameInstanceKey(v as any, character.game as 'D1' | 'D2');
            if (iid && v.characterClass) {
              clsByInstance.set(iid, v.characterClass);
            }
          }
          if (clsByInstance.size === 0) continue;

          for (const a of activities) {
            const iid = gameInstanceKey(a as any);
            if (iid && !a.characterClass && clsByInstance.has(iid)) {
              (a as any).characterClass = clsByInstance.get(iid);
            }
          }
        }
      }

      for (const a of host.getFilteredActivitiesForDate()) {
        if (!a.characterClass) {
          const match = activities.find(
            x => gameInstanceKey(x as any) === gameInstanceKey(a as any)
          );
          if (match?.characterClass) {
            (a as any).characterClass = match.characterClass;
          }
        }
      }
    } catch (_) {
      // Non-fatal: if PGCR fetch fails, we simply skip class icons
    }
  }
}
