import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from './bungie-api.service';

export interface AchievementMeta {
  hash: number;
  name: string;
  description?: string;
  icon?: string;
  gamerscore?: number;
}

export interface AchievementStatus extends AchievementMeta {
  unlocked: boolean;
}

// TODO: Fill out the full list. Only a small starter set is provided so the feature compiles.
const ACHIEVEMENT_MAP: AchievementMeta[] = [
  // Example entries – replace hashes with the correct ones from Manifest
  { hash: 876498389, name: 'The People\u2019s Hero', description: 'Complete a heroic public event', gamerscore: 20, icon: 'assets/icons/achievements/peoples-hero.png' },
  { hash: 993322929, name: 'In A Flash', description: 'Complete a Flashpoint', gamerscore: 20, icon: 'assets/icons/achievements/in-a-flash.png' },
  { hash: 2731861220, name: 'Show Me What You Got', description: 'Complete Shaxx\u2019s Call to Arms', gamerscore: 20, icon: 'assets/icons/achievements/show-me-what-you-got.png' }
];

// Bungie Record State bit 0 (value 1) == completed
const RECORD_COMPLETE_FLAG = 1;

@Injectable({ providedIn: 'root' })
export class AchievementsService {
  constructor(private bungie: BungieApiService) {}

  /**
   * Returns the full list of Destiny 2 achievements with an `unlocked` flag for the given profile.
   */
  async getAchievementStatuses(membershipType: number, membershipId: string): Promise<AchievementStatus[]> {
    const response = await firstValueFrom(this.bungie.getPlayerRecords(membershipType, membershipId));
    const profileRecords = response?.Response?.profileRecords?.data?.records || {};
    const charRecordsData = response?.Response?.characterRecords?.data || {};

    // Merge profile + character records into one map keyed by recordHash
    const completedHashes = new Set<number>();

    const collectCompleted = (recordsObj: { [hash: string]: { state: number } }) => {
      if (!recordsObj) return;
      for (const [hashStr, rec] of Object.entries(recordsObj)) {
        if ((rec.state & RECORD_COMPLETE_FLAG) !== 0) {
          completedHashes.add(Number(hashStr));
        }
      }
    };

    collectCompleted(profileRecords);
    for (const charId of Object.keys(charRecordsData)) {
      collectCompleted(charRecordsData[charId]?.records || {});
    }

    return ACHIEVEMENT_MAP.map(a => ({ ...a, unlocked: completedHashes.has(a.hash) }));
  }
} 