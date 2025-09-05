import { Injectable } from '@angular/core';
import { ActivityDbService } from './activity-db.service';
import { BungieApiService } from './bungie-api.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BackgroundSyncService {
  private syncInterval: any;
  private readonly SYNC_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private isRunning = false;

  constructor(
    private activityDb: ActivityDbService,
    private bungieService: BungieApiService
  ) {}

  /**
   * Start background sync for favorite accounts
   */
  startBackgroundSync(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[BackgroundSync] Starting background sync service');
    
    // Initial sync
    this.performBackgroundSync();
    
    // Set up interval
    this.syncInterval = setInterval(() => {
      this.performBackgroundSync();
    }, this.SYNC_INTERVAL);
  }

  /**
   * Stop background sync
   */
  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log('[BackgroundSync] Stopped background sync service');
  }

  /**
   * Perform background sync for all favorite accounts
   */
  private async performBackgroundSync(): Promise<void> {
    try {
      const favorites = await this.activityDb.getFavoriteAccounts();
      
      if (favorites.length === 0) {
        console.log('[BackgroundSync] No favorite accounts to sync');
        return;
      }

      console.log(`[BackgroundSync] Syncing ${favorites.length} favorite accounts`);
      
      // Sync each favorite account (limited concurrency)
      const concurrencyLimit = 2; // Conservative for background sync
      const chunks = this.chunkArray(favorites, concurrencyLimit);
      
      for (const chunk of chunks) {
        const promises = chunk.map(favorite => this.syncFavoriteAccount(favorite));
        await Promise.allSettled(promises);
        
        // Small delay between chunks to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('[BackgroundSync] Background sync completed');
    } catch (error) {
      console.error('[BackgroundSync] Error during background sync:', error);
    }
  }

  /**
   * Sync a single favorite account
   */
  private async syncFavoriteAccount(favorite: any): Promise<void> {
    try {
      console.log(`[BackgroundSync] Syncing ${favorite.displayName} (${favorite.game})`);
      
      // Get characters for this account
      const characters = await this.getCharactersForAccount(favorite);
      
      if (characters.length === 0) {
        console.log(`[BackgroundSync] No characters found for ${favorite.displayName}`);
        return;
      }

      // Sync activities for each character (incremental only)
      for (const character of characters) {
        await this.activityDb.fetchAndStoreActivities(
          favorite.membershipType,
          favorite.membershipId,
          character.characterId,
          favorite.game === 'D1'
        );
      }
      
      // Update last sync time
      await this.activityDb.updateFavoriteLastSync(favorite.membershipId);
      
    } catch (error) {
      console.error(`[BackgroundSync] Error syncing ${favorite.displayName}:`, error);
    }
  }

  /**
   * Get characters for an account
   */
  private async getCharactersForAccount(account: any): Promise<any[]> {
    try {
      if (account.game === 'D1') {
        const response = await firstValueFrom(
          this.bungieService.getD1Characters(account.membershipType, account.membershipId)
        );
        return response.Response?.characters || [];
      } else {
        const response = await firstValueFrom(
          this.bungieService.getCharacters(account.membershipType, account.membershipId)
        );
        return response.Response?.characters || [];
      }
    } catch (error) {
      console.error(`[BackgroundSync] Error getting characters for ${account.displayName}:`, error);
      return [];
    }
  }

  /**
   * Utility to chunk array
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Force immediate sync for a specific account
   */
  async forceSyncAccount(membershipId: string): Promise<void> {
    const favorites = await this.activityDb.getFavoriteAccounts();
    const favorite = favorites.find(f => f.membershipId === membershipId);
    
    if (favorite) {
      await this.syncFavoriteAccount(favorite);
    }
  }

  /**
   * Check if background sync is running
   */
  isBackgroundSyncRunning(): boolean {
    return this.isRunning;
  }
}
