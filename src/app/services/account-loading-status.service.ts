import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { PlayerSearchResult } from '../core/data/bungie-api.service';
import { AccountLoadingStatus } from '../models/account-loading-status.model';
import { LoadingProgress } from '../models/loading-progress.model';

/** Host for account loading modal / status tracking (CODE_CLEANUP_SPEC). */
export interface AccountLoadingStatusHost {
  getAccountLoadingStatusMap(): Map<string, AccountLoadingStatus>;
  setAccountLoadingStatuses(statuses: AccountLoadingStatus[]): void;
  getAccountLoadingStatuses(): AccountLoadingStatus[];
  setShowLoadingModal(show: boolean): void;
  setIsLoadingComplete(complete: boolean): void;
  getIsLoadingComplete(): boolean;
  beginLookupAnalytics(): void;
  getLoadingProgress(): LoadingProgress | null;
  updateLoadingProgress(
    phase: LoadingProgress['phase'],
    current: number,
    total: number,
    message: string
  ): void;
  maybeSendLookupAnalytics(): void;
  closeLoadingModal(): void;
  detectChanges(): void;
  getPlayerKey(player: PlayerSearchDisplay | PlayerSearchResult): string;
  isD1Player(player: PlayerSearchDisplay | PlayerSearchResult): boolean;
  getPlatformName(membershipType: number): string;
  trackLookupError(code: string): void;
}

/**
 * Loading modal account status updates (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class AccountLoadingStatusService {
  updateAccountLoadingStatus(
    host: AccountLoadingStatusHost,
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    status: AccountLoadingStatus['status'],
    message: string,
    progress?: number
  ): void {
    const loadingStatus: AccountLoadingStatus = {
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      status,
      message,
      progress,
      timestamp: new Date(),
    };

    const map = host.getAccountLoadingStatusMap();
    map.set(accountKey, loadingStatus);
    const statuses = Array.from(map.values());
    host.setAccountLoadingStatuses(statuses);

    if (statuses.length === 1) {
      host.setShowLoadingModal(true);
      host.setIsLoadingComplete(false);
      host.beginLookupAnalytics();
    }

    if (status === 'fetching-activities' && !host.getLoadingProgress()) {
      host.updateLoadingProgress('fetch', 0, 100, message);
    }

    const allComplete = statuses.every(
      (s) => s.status === 'complete' || s.status === 'error'
    );
    if (allComplete && statuses.length > 0) {
      host.setIsLoadingComplete(true);
      host.maybeSendLookupAnalytics();
      setTimeout(() => {
        if (host.getIsLoadingComplete()) {
          host.closeLoadingModal();
        }
      }, 3000);
    }

    host.detectChanges();
  }

  removeAccountLoadingStatus(
    host: AccountLoadingStatusHost,
    accountKey: string
  ): void {
    const map = host.getAccountLoadingStatusMap();
    map.delete(accountKey);
    const statuses = Array.from(map.values());
    host.setAccountLoadingStatuses(statuses);
    if (statuses.length === 0) {
      host.setShowLoadingModal(false);
      host.setIsLoadingComplete(false);
    }
    host.detectChanges();
  }

  markAccountLoadCancelled(
    host: AccountLoadingStatusHost,
    player: PlayerSearchDisplay | PlayerSearchResult,
    reason: string
  ): void {
    const accountKey = host.getPlayerKey(player);
    const game = host.isD1Player(player) ? 'D1' : 'D2';
    const platform = host.getPlatformName(player.membershipType);
    const existing = host.getAccountLoadingStatusMap().get(accountKey);
    console.warn(
      `[Load] Account cancelled (${reason}): ${player.displayName} ${game} ${player.membershipId}`
    );
    host.trackLookupError('cancelled');
    this.updateAccountLoadingStatus(
      host,
      accountKey,
      player.displayName,
      existing?.platform || platform,
      existing?.game || game,
      existing?.membershipType ?? player.membershipType,
      'error',
      `Load cancelled for ${game} ${player.displayName}`
    );
  }

  seedFetchingProfileStatuses(
    host: AccountLoadingStatusHost,
    players: PlayerSearchDisplay[],
    messageSuffix = ''
  ): void {
    for (const pl of players) {
      const accountKey = host.getPlayerKey(pl);
      const isD1 = host.isD1Player(pl);
      const game = isD1 ? 'D1' : 'D2';
      const platform = host.getPlatformName(pl.membershipType);
      this.updateAccountLoadingStatus(
        host,
        accountKey,
        pl.displayName,
        platform,
        game,
        pl.membershipType,
        'fetching-profile',
        `Loading ${game} profile for ${pl.displayName}${messageSuffix}...`
      );
    }
  }

  markAccountLoadFailed(
    host: AccountLoadingStatusHost,
    player: PlayerSearchDisplay
  ): void {
    const accountKey = host.getPlayerKey(player);
    const existingStatus = host.getAccountLoadingStatusMap().get(accountKey);
    if (!existingStatus) return;
    this.updateAccountLoadingStatus(
      host,
      accountKey,
      existingStatus.displayName,
      existingStatus.platform,
      existingStatus.game,
      existingStatus.membershipType,
      'error',
      `Failed to load ${existingStatus.game} data for ${existingStatus.displayName}`
    );
  }
}
