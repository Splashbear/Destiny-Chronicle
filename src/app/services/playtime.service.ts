import { Injectable } from '@angular/core';
import { BungieApiService } from './bungie-api.service';
import { WastedOnDestinyService } from './wasted-on-destiny.service';
import { ActivityDbService } from './activity-db.service';
import { firstValueFrom } from 'rxjs';
import { ActivityHistory } from '../models/activity-history.model';

export interface PlaytimeResult {
  seconds: number;
  seals: number; // Destiny 2 only; 0 for D1
}

export interface PlayerIdentity {
  game: 'D1' | 'D2';
  membershipId: string;
  membershipType: number;
}

@Injectable({ providedIn: 'root' })
export class PlaytimeService {
  private cache: { [key: string]: PlaytimeResult } = {};

  constructor(
    private bungie: BungieApiService,
    private wod: WastedOnDestinyService,
    private activityDb: ActivityDbService
  ) {}

  private getCacheKey(player: PlayerIdentity): string {
    // Include game so a D1 + D2 account with same membershipId are distinct
    return `${player.game}|${player.membershipId}`;
  }

  async getPlaytime(player: PlayerIdentity): Promise<PlaytimeResult> {
    const key = this.getCacheKey(player);
    if (this.cache[key]) return this.cache[key];

    let seconds = 0;
    let seals = 0;

    if (player.game === 'D2') {
      try {
        const response: any = await firstValueFrom(this.wod.getProfile(player.membershipId));
        if (response?.data?.characters) {
          for (const ch of Object.values(response.data.characters) as any[]) {
            if (typeof ch.timePlayedSeconds === 'number') seconds += ch.timePlayedSeconds;
            else if (typeof ch.minutesPlayedTotal === 'number') seconds += ch.minutesPlayedTotal * 60;
          }
        }
        if (!seconds && typeof response?.timePlayed === 'number') {
          seconds = response.timePlayed;
        }
        if (typeof response?.seals === 'number') {
          seals = response.seals;
        }
      } catch {}

      // Bungie fallback if WoD fails / privacy off
      if (!seconds) {
        try {
          const prof: any = await firstValueFrom(this.bungie.getProfile(player.membershipType, player.membershipId));
          const chars = Object.values(prof?.Response?.characters?.data || {}) as any[];
          for (const ch of chars) {
            if (ch.minutesPlayedTotal) seconds += Number(ch.minutesPlayedTotal) * 60;
          }
        } catch {}
      }
    } else {
      // Destiny 1 – approximate by summing stored activity durations
      const allActs: ActivityHistory[] = await this.activityDb.getActivitiesByGame(player.membershipId, '', 'D1');
      for (const act of allActs) {
        const dur = (act as any)?.values?.timePlayedSeconds?.basic?.value;
        if (typeof dur === 'number' && dur > 0) seconds += dur;
      }
    }

    const result: PlaytimeResult = { seconds, seals };
    this.cache[key] = result;
    return result;
  }
} 