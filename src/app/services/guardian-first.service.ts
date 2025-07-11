import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { ActivityFirstCompletion } from '../models/guardian-firsts.model';

export interface GuardianPlayerIdentity {
  membershipId: string;
  game: 'D1' | 'D2';
}

@Injectable({ providedIn: 'root' })
export class GuardianFirstService {
  constructor(private activityDb: ActivityDbService) {}

  /**
   * Loads first completions (raid / dungeon etc.) for the given player across the
   * provided characterIds, deduplicating so that only the earliest completion for
   * a given (game,type,name) tuple is kept.
   */
  async loadFirstsForPlayer(player: GuardianPlayerIdentity, characterIds: string[]): Promise<ActivityFirstCompletion[]> {
    const all: ActivityFirstCompletion[] = [];

    for (const characterId of characterIds) {
      // activityDb helper already contains the heavy logic of figuring out firsts
      const res = await this.activityDb.getFirstCompletions(player.membershipId, characterId, player.game);
      if (res?.firstCompletions?.length) {
        all.push(...res.firstCompletions);
      }
    }

    // Pick earliest completion per (game|type|name)
    const dedup = new Map<string, ActivityFirstCompletion>();
    for (const f of all) {
      const key = `${f.game}|${f.type}|${f.name}`;
      const existing = dedup.get(key);
      if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
        dedup.set(key, f);
      }
    }

    return Array.from(dedup.values()).sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime());
  }

  /**
   * Aggregates first-completion lists from multiple players keeping the earliest
   * completion for each unique (game,type,name).
   */
  aggregateFirsts(firstsMap: { [playerKey: string]: ActivityFirstCompletion[] }): ActivityFirstCompletion[] {
    const agg = new Map<string, ActivityFirstCompletion>();
    for (const list of Object.values(firstsMap)) {
      for (const f of list) {
        const key = `${f.game}|${f.type}|${f.name}`;
        const existing = agg.get(key);
        if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
          agg.set(key, f);
        }
      }
    }
    return Array.from(agg.values()).sort((a, b) => new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime());
  }
} 