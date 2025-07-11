import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { DungeonSoloFirst } from '../models/dungeon-solo-first.model';

@Injectable({ providedIn: 'root' })
export class DungeonSoloService {
  private cache: { [membershipId: string]: DungeonSoloFirst[] } = {};
  private loading: { [membershipId: string]: Promise<DungeonSoloFirst[]> | undefined } = {};

  constructor(private db: ActivityDbService) {}

  /**
   * Returns cached list of solo / solo-flawless firsts for the given player, or
   * loads it from IndexedDB if not yet present. Results are memoised for the
   * lifetime of the page.
   */
  async getSoloFirsts(membershipId: string): Promise<DungeonSoloFirst[]> {
    if (this.cache[membershipId]) {
      return this.cache[membershipId];
    }
    if (this.loading[membershipId]) {
      return this.loading[membershipId];
    }
    const promise = this.db.getDungeonSoloFirsts(membershipId).then(list => {
      this.cache[membershipId] = list;
      delete this.loading[membershipId];
      return list;
    }).catch(err => {
      delete this.loading[membershipId];
      console.error('[DungeonSoloService] Failed to load solo firsts', err);
      return [];
    });
    this.loading[membershipId] = promise;
    return promise;
  }

  /** Convenience helper */
  getSoloFirstForFamily(membershipId: string, family: string): DungeonSoloFirst | undefined {
    const list = this.cache[membershipId];
    return list?.find(d => d.family === family);
  }

  /** Convenience helper – fuzzy match against label substring */
  getSoloFirstForLabel(membershipId: string, label: string): DungeonSoloFirst | undefined {
    const list = this.cache[membershipId];
    if (!list) return undefined;
    const lower = label.toLowerCase();
    return list.find(d => lower.includes(d.family.toLowerCase()));
  }
} 