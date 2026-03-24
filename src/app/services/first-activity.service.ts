import { Injectable } from '@angular/core';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { ActivityHistory } from '../models/activity-history.model';

export interface PlayerIdentityBasic {
  membershipId: string;
  game: 'D1' | 'D2';
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
    return `${p.game}|${p.membershipId}${chars}`;
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

      // Optional: restrict to specific characterIds if provided
      if (player.characterIds && player.characterIds.length) {
        const charSet = new Set(player.characterIds);
        acts = acts.filter(a => charSet.has((a as any).characterId));
      }

      // Only consider completed activities for "first ever" to avoid partial/patrol noise
      const completedActs = acts.filter(a => {
        const completed = Number((a as any)?.values?.completed?.basic?.value ?? 0);
        return completed === 1;
      });
      if (completedActs.length) {
        acts = completedActs;
      }

      // Prefer the tutorial mission "A Guardian Rises" when present (D1 only)
      if (player.game === 'D1' && acts.length) {
        const D1_TUTORIAL_HASHES = new Set<string>(['1846390409', '1856964953']);
        const tutorialActs = acts.filter(a => {
          const refStr = String((a as any)?.activityDetails?.referenceId ?? '');
          if (refStr && D1_TUTORIAL_HASHES.has(refStr)) return true;
          const name = this.manifest.getActivityName(refStr, true);
          return name === 'A Guardian Rises';
        });
        if (tutorialActs.length) {
          tutorialActs.sort((x, y) => new Date(x.period).getTime() - new Date(y.period).getTime());
          this.cache[key] = tutorialActs[0] || null;
          return tutorialActs[0];
        }
      }

      // Prefer D2 tutorial mission when present (e.g., "Homecoming")
      if (player.game === 'D2' && acts.length) {
        const D2_TUTORIAL_HASHES = new Set<string>(['1658347443']);
        const tutorialActs = acts.filter(a => {
          const ref = String((a as any)?.activityDetails?.referenceId ?? '');
          if (ref && D2_TUTORIAL_HASHES.has(ref)) return true;
          const name = this.manifest.getActivityName(ref, false);
          return name === 'Homecoming';
        });
        if (tutorialActs.length) {
          tutorialActs.sort((x, y) => new Date(x.period).getTime() - new Date(y.period).getTime());
          this.cache[key] = tutorialActs[0] || null;
          return tutorialActs[0];
        }
      }

      // Next preference: any Story mission (avoids Patrols like "Patrol the Dreadnought" being selected)
      if (acts.length) {
        const storyActs = acts.filter(a => {
          const ref = (a as any)?.activityDetails?.referenceId;
          const mode = (a as any)?.activityDetails?.mode;
          const type = this.manifest.getActivityType(String(ref), mode);
          return type === 'story';
        });
        if (storyActs.length) {
          storyActs.sort((x, y) => new Date(x.period).getTime() - new Date(y.period).getTime());
          this.cache[key] = storyActs[0] || null;
          return storyActs[0];
        }
      }

      // Exclude Patrols by default when picking the generic earliest completed activity
      let candidateActs = acts;
      const nonPatrolActs = acts.filter(a => {
        const ref = (a as any)?.activityDetails?.referenceId;
        const mode = (a as any)?.activityDetails?.mode;
        const type = this.manifest.getActivityType(String(ref), mode);
        return type !== 'patrol';
      });
      if (nonPatrolActs.length) {
        candidateActs = nonPatrolActs;
      }

      // Guard against duplicate-timestamp ordering issues by applying a stable tie-breaker
      // Choose the smallest numeric instanceId among the earliest timestamp set.
      let first: StoredActivity | undefined = candidateActs.length ? candidateActs[0] : undefined;
      if (first) {
        const firstTs = first.period;
        const sameTs = candidateActs.filter(a => a.period === firstTs);
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