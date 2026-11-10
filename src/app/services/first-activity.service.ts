import { Injectable } from '@angular/core';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { ActivityHistory } from '../models/activity-history.model';
import { canonicalAccountKey } from '../utils/account-key';
import {
  FIRST_EVER_TUTORIAL_NAMES,
  firstEverTutorialReferenceIds,
} from '../utils/first-ever-from-firsts';

export interface PlayerIdentityBasic {
  membershipId: string;
  game: 'D1' | 'D2';
  membershipType?: number;
  characterIds?: string[]; // optional filter to scope earliest by specific characters
}

@Injectable({ providedIn: 'root' })
export class FirstActivityService {
  private cache: { [key: string]: ActivityHistory | null } = {};
  constructor(private db: ActivityDbService, private manifest: DestinyManifestService) {
    // Clear cache when service is instantiated to ensure new filtering logic takes effect
    this.clearCache();
  }

  private getKey(p: PlayerIdentityBasic): string {
    const chars = p.characterIds && p.characterIds.length ? `|${p.characterIds.sort().join(',')}` : '';
    return `${canonicalAccountKey(p)}${chars}`;
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
      let acts: StoredActivity[] = await this.db.activities
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

      // Optional: restrict to specific characterIds if provided (stringify — IDB/Bungie type drift)
      if (player.characterIds && player.characterIds.length) {
        const charSet = new Set(player.characterIds.map(String));
        acts = acts.filter(a => charSet.has(String((a as any).characterId ?? '')));
      }

      // Only consider completed activities for "first ever" to avoid partial/patrol noise
      const completedActs = acts.filter(a => {
        const completed = Number((a as any)?.values?.completed?.basic?.value ?? 0);
        return completed === 1;
      });
      if (completedActs.length) {
        acts = completedActs;
      }

      // First Ever is only the true intro mission — never an arbitrary story/playlist (e.g. Battlegrounds).
      // D1: A Guardian Rises. D2: Homecoming (Red War) or A Guardian Rises (New Light).
      if (acts.length) {
        const tutorialHashes = firstEverTutorialReferenceIds(player.game);
        const tutorialNames = FIRST_EVER_TUTORIAL_NAMES[player.game];
        const isD1 = player.game === 'D1';
        const tutorialActs = acts.filter(a => {
          const refStr = String((a as any)?.activityDetails?.referenceId ?? '');
          if (refStr && tutorialHashes.has(refStr)) return true;
          const name = (this.manifest.getActivityName(refStr, isD1) || '').trim();
          return !!name && tutorialNames.has(name);
        });
        if (tutorialActs.length) {
          tutorialActs.sort((x, y) => new Date(x.period).getTime() - new Date(y.period).getTime());
          this.cache[key] = tutorialActs[0] || null;
          return tutorialActs[0];
        }
      }

      // No intro found in stored history — leave First Ever empty rather than invent a wrong activity.
      this.cache[key] = null;
      return undefined;
    } catch (err) {
      console.error('[FirstActivityService] Failed to load first activity', err);
      this.cache[key] = null;
      return undefined;
    }
  }
} 