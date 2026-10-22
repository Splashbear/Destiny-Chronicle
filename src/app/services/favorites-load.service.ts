import { Injectable } from '@angular/core';
import { FavoriteAccount } from './activity-db.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import {
  PlayerAccountSyncHost,
  PlayerAccountSyncOptions,
  PlayerAccountSyncService,
} from './player-account-sync.service';

/** Shared host for favorites + permalink multi-account loads. */
export interface FavoritesLoadHost extends PlayerAccountSyncHost {
  getCurrentLoadToken(): number;
  setShowFavoritesLoadPrompt(show: boolean): void;
  setProfileLoadInProgress(on: boolean): void;
  syncActivityStore(): void;
  setShowLoadingModal(show: boolean): void;
  clearAccountLoadingStatuses(): void;
  resetSelectionCachesForFavorites(): void;
  setSelectedPlayers(players: PlayerSearchDisplay[]): void;
  setSelectedCharacterId(playerKey: string, characterId: string | undefined): void;
  getPlayerKey(player: PlayerSearchDisplay): string;
  ensureSelectedDate(): void;
  setDateActivityLoading(loading: boolean): void;
  updateLoadingProgress(
    phase: 'fetch',
    current: number,
    total: number,
    message: string
  ): void;
  detectChanges(): void;
  seedFetchingProfileStatuses(players: PlayerSearchDisplay[], suffix?: string): void;
  loadAllFilteredActivities(forceRefresh: boolean): Promise<void>;
  getSelectedDate(): string;
  emitStatsDebounce(): void;
  isD1Player(player: PlayerSearchDisplay): boolean;
  noteBungieApiIssue(scope: 'D1' | 'D2' | 'both', err: unknown): void;
  markAccountLoadCancelled(player: PlayerSearchDisplay, reason: string): void;
  markAccountLoadFailed(player: PlayerSearchDisplay): void;
  setErrorMessage(message: string): void;
  showSuccessMessage?(message: string): void;
}

export interface UrlPlayerPayload {
  displayName?: string;
  membershipId: string;
  membershipType?: number;
  game?: 'D1' | 'D2';
  platform?: string;
}

/**
 * Multi-account batch loads: favorites + permalink (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class FavoritesLoadService {
  constructor(private playerAccountSync: PlayerAccountSyncService) {}

  async loadMultipleFavorites(
    host: FavoritesLoadHost,
    favorites: FavoriteAccount[]
  ): Promise<void> {
    if (favorites.length === 0) return;

    let list = favorites;
    if (list.length > 10) {
      host.setErrorMessage(
        `Too many favorites (${list.length}). Only the first 10 will be loaded.`
      );
      list = list.slice(0, 10);
    }

    host.setShowFavoritesLoadPrompt(false);
    host.setProfileLoadInProgress(true);
    host.syncActivityStore();

    const playersToLoad: PlayerSearchDisplay[] = list.map(
      fav =>
        ({
          displayName: fav.displayName,
          membershipId: fav.membershipId,
          membershipType: fav.membershipType,
          game: fav.game,
          platform: fav.platform,
          isPrimary: false,
        }) as PlayerSearchDisplay
    );

    await this.runBatchLoad(host, playersToLoad, {
      showLoadingModal: true,
      clearStatuses: true,
      seedSuffix: undefined,
      useLoadTokenCancel: true,
      errorLogLabel: '[LoadFavorites]',
      noteApiOnPlayerError: true,
      noteApiOnCatch: true,
      successMessage: undefined,
      trackProfileLoadFlag: true,
    });
  }

  async loadPlayersFromUrlData(
    host: FavoritesLoadHost,
    playerData: UrlPlayerPayload[]
  ): Promise<void> {
    if (!playerData?.length) return;

    let list = playerData;
    if (list.length > 10) {
      host.setErrorMessage(
        `Too many players in URL (${list.length}). Only the first 10 will be loaded.`
      );
      list = list.slice(0, 10);
    }

    const playersToLoad: PlayerSearchDisplay[] = list.map(
      data =>
        ({
          displayName: data.displayName || 'Unknown Player',
          membershipId: data.membershipId,
          membershipType: data.membershipType || 1,
          game: data.game || 'D2',
          platform: data.platform || 'Unknown',
          isPrimary: false,
        }) as PlayerSearchDisplay
    );

    await this.runBatchLoad(host, playersToLoad, {
      showLoadingModal: false,
      clearStatuses: false,
      seedSuffix: ' from permalink',
      useLoadTokenCancel: false,
      errorLogLabel: '[LoadURLPlayers]',
      noteApiOnPlayerError: false,
      noteApiOnCatch: false,
      successMessage:
        playersToLoad.length > 0
          ? `Successfully loaded ${playersToLoad.length} player(s) from permalink`
          : undefined,
      trackProfileLoadFlag: false,
    });
  }

  private async runBatchLoad(
    host: FavoritesLoadHost,
    playersToLoad: PlayerSearchDisplay[],
    opts: {
      showLoadingModal: boolean;
      clearStatuses: boolean;
      seedSuffix: string | undefined;
      useLoadTokenCancel: boolean;
      errorLogLabel: string;
      noteApiOnPlayerError: boolean;
      noteApiOnCatch: boolean;
      successMessage: string | undefined;
      trackProfileLoadFlag: boolean;
    }
  ): Promise<void> {
    const loadToken = host.getCurrentLoadToken();

    if (opts.showLoadingModal) {
      host.setShowLoadingModal(true);
    }
    if (opts.clearStatuses) {
      host.clearAccountLoadingStatuses();
    }
    host.resetSelectionCachesForFavorites();

    host.setSelectedPlayers(playersToLoad);
    for (const player of playersToLoad) {
      host.setSelectedCharacterId(host.getPlayerKey(player), undefined);
    }

    host.ensureSelectedDate();
    host.setDateActivityLoading(true);
    host.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');
    host.detectChanges();

    try {
      host.seedFetchingProfileStatuses(playersToLoad, opts.seedSuffix);

      const syncOpts: PlayerAccountSyncOptions = {
        preserveOrder: true,
        errorLogLabel: opts.errorLogLabel,
        onPlayerError: (player, err) => {
          if (opts.noteApiOnPlayerError) {
            host.noteBungieApiIssue(host.isD1Player(player) ? 'D1' : 'D2', err);
          }
          host.markAccountLoadFailed(player);
        },
      };
      if (opts.useLoadTokenCancel) {
        syncOpts.shouldContinue = () => loadToken === host.getCurrentLoadToken();
        syncOpts.onCancelled = (player, reason) =>
          host.markAccountLoadCancelled(player, reason);
      }

      await this.playerAccountSync.syncPlayers(host, playersToLoad, syncOpts);
      if (opts.useLoadTokenCancel && loadToken !== host.getCurrentLoadToken()) {
        return;
      }

      if (host.getSelectedDate()) {
        await host.loadAllFilteredActivities(true);
      }

      host.emitStatsDebounce();
      if (opts.successMessage) {
        host.showSuccessMessage?.(opts.successMessage);
      }
    } catch (error) {
      console.error(`${opts.errorLogLabel} Error loading players:`, error);
      if (opts.noteApiOnCatch) {
        host.noteBungieApiIssue('both', error);
      }
    } finally {
      if (opts.trackProfileLoadFlag) {
        host.setProfileLoadInProgress(false);
        host.syncActivityStore();
        host.emitStatsDebounce();
      }
      host.setDateActivityLoading(false);
      host.detectChanges();
    }
  }
}
