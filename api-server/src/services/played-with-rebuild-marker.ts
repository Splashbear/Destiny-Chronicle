import { logger } from '../utils/logger';
import { Game } from './bungie-api.service';
import { PgcrOverrideStore } from './pgcr-override.store';
import { SummaryStore } from './played-with-summary.store';

/**
 * Service to mark affected Played With summaries for rebuild when a PGCR fix changes the roster.
 * 
 * When a flagged PGCR is fetched and saved, compares the old (dump) roster with the new (Bungie)
 * roster. If different, marks every account in either roster (that has a summary) for rebuild at
 * low priority (15 = stale refresh).
 */

export interface RosterComparison {
  changed: boolean;
  oldMembershipIds: Set<string>;
  newMembershipIds: Set<string>;
  addedIds: string[];
  removedIds: string[];
  affectedIds: string[];
}

export class PlayedWithRebuildMarker {
  constructor(
    private overrideStore: PgcrOverrideStore,
    private summaryStore: SummaryStore | null
  ) {}

  /**
   * Extract unique membership IDs from a PGCR response.
   */
  private extractMembershipIds(pgcr: any, game: Game): Set<string> {
    const ids = new Set<string>();

    try {
      // Handle D1/D2 envelope differences
      const response = game === 'D1' ? pgcr?.Response?.data : pgcr?.Response;
      const entries = response?.entries || [];

      for (const entry of entries) {
        const mid = String(entry?.player?.destinyUserInfo?.membershipId || '').trim();
        if (mid && /^\d+$/.test(mid)) {
          ids.add(mid);
        }
      }
    } catch (error) {
      logger.error('Failed to extract membership IDs from PGCR', { error, game });
    }

    return ids;
  }

  /**
   * Compare rosters between old (dump) and new (Bungie) PGCRs.
   */
  compareRosters(
    oldPgcr: any | null,
    newPgcr: any,
    game: Game
  ): RosterComparison {
    const oldIds = oldPgcr ? this.extractMembershipIds(oldPgcr, game) : new Set<string>();
    const newIds = this.extractMembershipIds(newPgcr, game);

    const added = Array.from(newIds).filter((id) => !oldIds.has(id));
    const removed = Array.from(oldIds).filter((id) => !newIds.has(id));
    const changed = added.length > 0 || removed.length > 0;

    // Affected IDs: all accounts in either roster
    const affectedIds = Array.from(new Set([...oldIds, ...newIds]));

    return {
      changed,
      oldMembershipIds: oldIds,
      newMembershipIds: newIds,
      addedIds: added,
      removedIds: removed,
      affectedIds,
    };
  }

  /**
   * Mark affected Played With summaries for rebuild.
   * Only marks accounts that have existing summaries.
   */
  async markForRebuild(
    instanceId: string,
    game: Game,
    oldPgcr: any | null,
    newPgcr: any
  ): Promise<void> {
    if (!this.summaryStore) {
      return; // No summary store configured
    }

    const comparison = this.compareRosters(oldPgcr, newPgcr, game);

    if (!comparison.changed) {
      return; // Roster unchanged, no rebuild needed
    }

    logger.info('PGCR roster changed, marking summaries for rebuild', {
      instanceId,
      game,
      added: comparison.addedIds.length,
      removed: comparison.removedIds.length,
      affected: comparison.affectedIds.length,
    });

    // Check which affected accounts have existing summaries
    let marked = 0;
    for (const membershipId of comparison.affectedIds) {
      const summaryKey = membershipId; // v2 per-account key
      
      try {
        // Check if summary exists (either legacy or v2 format)
        const summaryPath = this.summaryStore.summaryPath(summaryKey);
        const v2Path = summaryPath.replace('/summaries/', '/summaries/acct/').replace('.json', '.json.gz');
        
        const exists = require('fs').existsSync(summaryPath) || require('fs').existsSync(v2Path);
        
        if (exists) {
          // Mark for rebuild at priority 15 (stale refresh on lookup)
          this.summaryStore.request([membershipId], 'refresh');
          marked++;
        }
      } catch (error) {
        logger.warn('Failed to check/mark summary for rebuild', {
          membershipId,
          error,
        });
      }
    }

    if (marked > 0) {
      logger.info('Marked Played With summaries for rebuild', {
        instanceId,
        game,
        marked,
        total: comparison.affectedIds.length,
      });
    }
  }

  /**
   * Check if a PGCR fix should trigger rebuild marking.
   * Compares old (dump) vs new (override) roster.
   */
  shouldMarkForRebuild(instanceId: string, game: Game): boolean {
    if (!this.summaryStore) {
      return false;
    }

    // Check if override exists (new PGCR was saved)
    return this.overrideStore.exists(instanceId, game);
  }
}
