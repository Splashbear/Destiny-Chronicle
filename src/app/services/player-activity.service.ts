import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, firstValueFrom } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';
import { BungieApiService, PlayerSearchResult } from './bungie-api.service';
import { ActivityDbService, StoredActivity, FavoriteAccount } from './activity-db.service';
import { ActivityHistory, Character } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

export interface LoadingProgress {
  current: number;
  total: number;
  message: string;
  playerName?: string;
}

export interface AccountLoadingStatus {
  playerKey: string;
  status: 'fetching-profile' | 'fetching-characters' | 'fetching-activities' | 'processing' | 'complete' | 'error';
  message: string;
  progress?: number;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlayerActivityService {
  private readonly BATCH_SIZE = 50;
  private readonly MAX_RETRIES = 3;
  private readonly MAX_PARALLEL_PLAYER_SYNCS = 3;

  private loadingProgressSubject = new BehaviorSubject<LoadingProgress | null>(null);
  private accountLoadingStatusesSubject = new BehaviorSubject<AccountLoadingStatus[]>([]);

  public loadingProgress$ = this.loadingProgressSubject.asObservable();
  public accountLoadingStatuses$ = this.accountLoadingStatusesSubject.asObservable();

  constructor(
    private bungieApi: BungieApiService,
    private activityDb: ActivityDbService
  ) {}

  /**
   * Searches for Destiny accounts across both D1 and D2
   */
  async searchPlayers(username: string): Promise<{
    d1Results: PlayerSearchDisplay[];
    d2Results: PlayerSearchDisplay[];
    crossSavePlayer: PlayerSearchDisplay | null;
  }> {
    const d1Results: PlayerSearchDisplay[] = [];
    const d2Results: PlayerSearchDisplay[] = [];
    let crossSavePlayer: PlayerSearchDisplay | null = null;

    try {
      // Search D1 accounts
      const d1Search = await firstValueFrom(this.bungieApi.searchD1Player(username, 1));
      if (d1Search && d1Search.length > 0) {
        d1Results.push(...d1Search.map((result: any) => this.mapToPlayerSearchDisplay(result, 'D1')));
      }

      // Search D2 accounts
      const d2SearchResponse = await firstValueFrom(this.bungieApi.searchD2Player(username));
      if (d2SearchResponse && d2SearchResponse.Response && d2SearchResponse.Response.length > 0) {
        d2Results.push(...d2SearchResponse.Response.map((result: any) => this.mapToPlayerSearchDisplay(result, 'D2')));
      }

      // Check for cross-save
      if (d1Results.length > 0 && d2Results.length > 0) {
        crossSavePlayer = this.findCrossSavePlayer(d1Results, d2Results);
      }

      return { d1Results, d2Results, crossSavePlayer };
    } catch (error) {
      console.error('Error searching players:', error);
      throw error;
    }
  }

  /**
   * Loads activities for multiple players
   */
  async loadActivitiesForPlayers(
    players: PlayerSearchDisplay[],
    selectedDate: string,
    onProgress?: (progress: LoadingProgress) => void
  ): Promise<Map<string, ActivityHistory[]>> {
    const activitiesMap = new Map<string, ActivityHistory[]>();
    
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const playerKey = `${player.game}|${player.membershipId}`;
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: players.length,
          message: `Loading activities for ${player.displayName}...`,
          playerName: player.displayName
        });
      }

      try {
        const activities = await this.loadPlayerActivities(player, selectedDate);
        activitiesMap.set(playerKey, activities);
      } catch (error) {
        console.error(`Error loading activities for ${player.displayName}:`, error);
        activitiesMap.set(playerKey, []);
      }
    }

    return activitiesMap;
  }

  /**
   * Loads activities for a single player
   * Note: This is a simplified version. The main component handles character loading.
   */
  private async loadPlayerActivities(
    player: PlayerSearchDisplay,
    selectedDate: string
  ): Promise<ActivityHistory[]> {
    // For now, return empty array. The main component handles activity loading.
    // This service is primarily for data processing and stats calculation.
    return [];
  }

  /**
   * Loads favorite accounts
   */
  async loadFavorites(): Promise<FavoriteAccount[]> {
    return await this.activityDb.getFavorites();
  }

  /**
   * Adds a player to favorites
   */
  async addToFavorites(player: PlayerSearchDisplay): Promise<void> {
    const favorite: FavoriteAccount = {
      displayName: player.displayName,
      membershipId: player.membershipId,
      platform: player.platform,
      game: player.game,
      compositeKey: `${player.membershipId}-${player.game}`,
      membershipType: 1, // Default membership type
      lastUpdated: new Date().toISOString()
    };
    
    await this.activityDb.addFavorite(favorite);
  }

  /**
   * Removes a player from favorites
   */
  async removeFromFavorites(player: PlayerSearchDisplay): Promise<void> {
    await this.activityDb.removeFavorite(player.membershipId, player.game);
  }

  /**
   * Checks if a player is in favorites
   */
  async isFavorite(player: PlayerSearchDisplay): Promise<boolean> {
    const favorites = await this.activityDb.getFavorites();
    return favorites.some(fav => fav.membershipId === player.membershipId);
  }

  /**
   * Updates loading progress
   */
  updateLoadingProgress(progress: LoadingProgress | null): void {
    this.loadingProgressSubject.next(progress);
  }

  /**
   * Updates account loading statuses
   */
  updateAccountLoadingStatuses(statuses: AccountLoadingStatus[]): void {
    this.accountLoadingStatusesSubject.next(statuses);
  }

  /**
   * Maps API result to PlayerSearchDisplay
   */
  private mapToPlayerSearchDisplay(result: any, game: 'D1' | 'D2'): PlayerSearchDisplay {
    return {
      displayName: result.displayName,
      membershipId: result.membershipId,
      platform: result.platform || 'Unknown',
      game: game,
      iconPath: result.iconPath || undefined,
      isPublic: result.isPublic || false
    };
  }

  /**
   * Finds cross-save player between D1 and D2 results
   */
  private findCrossSavePlayer(
    d1Results: PlayerSearchDisplay[],
    d2Results: PlayerSearchDisplay[]
  ): PlayerSearchDisplay | null {
    for (const d1Player of d1Results) {
      for (const d2Player of d2Results) {
        if (d1Player.displayName === d2Player.displayName && 
            d1Player.platform === d2Player.platform) {
          return d2Player; // Return D2 version for cross-save
        }
      }
    }
    return null;
  }
}
