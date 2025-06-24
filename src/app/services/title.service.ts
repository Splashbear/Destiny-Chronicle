import { Injectable } from '@angular/core';
import { BungieApiService } from './bungie-api.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { firstValueFrom } from 'rxjs';

export interface TitleItem {
  hash: number;
  name: string;
  icon?: string | null;
  altIcon?: string | null;
  completed: boolean;
  locked: boolean;
  legacy: boolean;
  releaseRank?: number;
  holders?: { displayName: string; platform: string }[];
  isGilded?: boolean;
  timesGilded?: number;
  gildedIcon?: string;
  normalized?: string;
}

export interface PlayerIdentityMin {
  membershipType: number;
  membershipId: string;
  displayName: string;
  platform: string;
}

@Injectable({ providedIn: 'root' })
export class TitleService {
  constructor(private bungie: BungieApiService, private manifest: DestinyManifestService) {}

  /**
   * Fetches the player's title records and returns a raw map of record hashes
   * to record objects. Low-level helper mostly for internal use.
   */
  private async fetchProfileRecords(membershipType: number, membershipId: string): Promise<any> {
    const response = await firstValueFrom(this.bungie.getPlayerTitles(membershipType, membershipId));
    return response?.Response || {};
  }

  /**
   * High-level helper that will eventually replicate the component's existing
   * title-building logic and return the list of `TitleItem` rows ready for display.
   * For now this is just a placeholder that returns an empty array so we can wire
   * the service incrementally without breaking the build.
   */
  async getPlayerTitles(_player: PlayerIdentityMin): Promise<TitleItem[]> {
    // TODO: move logic from PlayerSearchComponent here in subsequent steps.
    return [];
  }
} 