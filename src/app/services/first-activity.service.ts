import { Injectable } from '@angular/core';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { ActivityHistory } from '../models/activity-history.model';

export interface PlayerIdentityBasic {
  membershipId: string;
  game: 'D1' | 'D2';
}

@Injectable({ providedIn: 'root' })
export class FirstActivityService {
  private cache: { [key: string]: ActivityHistory | null } = {};
  constructor(private db: ActivityDbService) {
    // Clear cache when service is instantiated to ensure new filtering logic takes effect
    this.clearCache();
  }

  private getKey(p: PlayerIdentityBasic): string {
    return `${p.game}|${p.membershipId}`;
  }

  /**
   * Clears the cache for first ever activities. Useful when the filtering logic changes.
   */
  clearCache(): void {
    this.cache = {};
  }

  /** Clears cache for a specific player key */
  clearCacheFor(player: PlayerIdentityBasic): void {
    const key = this.getKey(player);
    delete this.cache[key];
  }

  /**
   * Returns the earliest (first ever) stored activity for the given player & game,
   * or undefined if none found.
   */
  async getFirstEverActivity(player: PlayerIdentityBasic, forceRefresh: boolean = false): Promise<ActivityHistory | undefined> {
    const key = this.getKey(player);
    if (!forceRefresh && this.cache[key] !== undefined) {
      return this.cache[key] || undefined;
    }

    try {
      // Query all activities for membershipId, filter by game/date validity, then sort by period asc
      const acts: StoredActivity[] = await this.db.activities
        .where('membershipId')
        .equals(player.membershipId)
        .filter(a => {
          const g = (a as any).game as 'D1' | 'D2' | undefined;
          // Enforce game separation when tagged; if missing, assume it matches the player's game
          if (g && g !== player.game) {
            return false;
          }
          const d = new Date(a.period);
          if (!(d instanceof Date) || isNaN(d.getTime())) {
            return false;
          }
          if (d > new Date()) {
            return false;
          }
          return true; // No mode/type filtering – earliest by date wins
        })
        .sortBy('period');

      // Guard against duplicate-timestamp ordering issues by applying a stable tie-breaker
      // Choose the smallest numeric instanceId among the earliest timestamp set.
      let first: StoredActivity | undefined = acts.length ? acts[0] : undefined;
      if (first) {
        const firstTs = first.period;
        const sameTs = acts.filter(a => a.period === firstTs);
        if (sameTs.length > 1) {
          const withNumericId = sameTs
            .map(a => ({ a, n: Number(a.activityDetails?.instanceId || 0) }))
            .filter(x => !Number.isNaN(x.n) && x.n > 0);
          if (withNumericId.length > 0) {
            withNumericId.sort((x, y) => x.n - y.n);
            first = withNumericId[0].a;
          }
        }
      }
      this.cache[key] = first || null;
      return first;
    } catch (err) {
      console.error('[FirstActivityService] Failed to load first activity', err);
      this.cache[key] = null;
      return undefined;
    }
  }
} 