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
  constructor(private db: ActivityDbService) {}

  private getKey(p: PlayerIdentityBasic): string {
    return `${p.game}|${p.membershipId}`;
  }

  /**
   * Clears the cache for first ever activities. Useful when the filtering logic changes.
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Returns the earliest (first ever) stored activity for the given player & game,
   * or undefined if none found.
   */
  async getFirstEverActivity(player: PlayerIdentityBasic): Promise<ActivityHistory | undefined> {
    const key = this.getKey(player);
    if (this.cache[key] !== undefined) {
      return this.cache[key] || undefined;
    }

    try {
      // Query all activities for membershipId, filter by game, then sort
      const acts: StoredActivity[] = await this.db.activities
        .where('membershipId')
        .equals(player.membershipId)
        .filter(a => {
          const g = (a as any).game as 'D1' | 'D2' | undefined;
          // Older cached rows may not include the `game` marker – treat them as belonging to this player's game
          return !g || g === player.game;
        })
        .sortBy('period');

      const first = acts.length ? acts[0] : undefined;
      this.cache[key] = first || null;
      return first;
    } catch (err) {
      console.error('[FirstActivityService] Failed to load first activity', err);
      this.cache[key] = null;
      return undefined;
    }
  }
} 