import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { PlayerSearchResult } from '../core/data/bungie-api.service';
import { toDisplayPlayer } from '../utils/to-display-player';
import {
  PlayerAccountSyncHost,
  PlayerAccountSyncService,
} from './player-account-sync.service';
import { environment } from '../../environments/environment';

/** Host for primary select + append account orchestration. */
export interface PlayerSelectLoadHost extends PlayerAccountSyncHost {
  getSelectedPlayers(): PlayerSearchDisplay[];
  setSelectedPlayers(players: PlayerSearchDisplay[]): void;
  pushSelectedPlayer(player: PlayerSearchDisplay): void;
  getAddMode(): boolean;
  setErrorMessage(message: string): void;
  setShowPlatformPicker(show: boolean): void;
  setSearchPanelExpanded(expanded: boolean): void;
  resetSessionForPrimarySelect(): void;
  getPlayerKey(player: PlayerSearchDisplay): string;
  setSelectedCharacterId(key: string, id: string | undefined): void;
  clearSelectedCharacterId(key: string): void;
  addSelectedAccount(player: PlayerSearchResult | PlayerSearchDisplay): void;
  ensureSelectedDate(): void;
  setDateActivityLoading(loading: boolean): void;
  updateLoadingProgress(
    phase: 'fetch',
    current: number,
    total: number,
    message: string
  ): void;
  detectChanges(): void;
  seedFetchingProfileStatuses(players: PlayerSearchDisplay[]): void;
  setOverallActivitiesProcessed(n: number): void;
  getSelectedDate(): string;
  loadAllFilteredActivities(force: boolean): Promise<void>;
  emitStatsDebounce(): void;
  updateUrlForPermalink(): void;
  getActiveTab(): string;
  syncActiveFirstsGameWithPlayers(): void;
  updatePlatformTabs(): void;
  markSyncedPlayer(playerKey: string): void;
  getFirstFullSyncDone(): boolean;
  refreshComputedViews(): void;
}

/**
 * Primary select / append account load paths (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class PlayerSelectLoadService {
  constructor(private playerAccountSync: PlayerAccountSyncService) {}

  async selectPlayer(
    host: PlayerSelectLoadHost,
    player: PlayerSearchResult
  ): Promise<void> {
    if (host.getSelectedPlayers().length >= 10) {
      host.setErrorMessage(
        'Maximum of 10 profiles allowed. Please remove some profiles before adding more.'
      );
      return;
    }

    if (host.getAddMode() || host.getSelectedPlayers().length > 0) {
      await this.appendPlayer(host, player as any);
      return;
    }

    host.setShowPlatformPicker(false);

    const incomingGame = (player as any).game || 'D2';
    if (
      host
        .getSelectedPlayers()
        .some((p) => p.membershipId === player.membershipId && p.game === incomingGame)
    ) {
      return;
    }

    host.resetSessionForPrimarySelect();

    const displayPlayer = toDisplayPlayer(player, {
      isPrimary: true,
      game: incomingGame,
    });
    host.setSelectedPlayers([displayPlayer]);
    host.setSearchPanelExpanded(false);
    host.setSelectedCharacterId(host.getPlayerKey(displayPlayer), undefined);
    host.addSelectedAccount(player);

    host.ensureSelectedDate();
    host.setDateActivityLoading(true);
    host.updateLoadingProgress(
      'fetch',
      0,
      1,
      'Loading activities for selected date…'
    );
    host.detectChanges();

    try {
      host.seedFetchingProfileStatuses(host.getSelectedPlayers());
      host.setOverallActivitiesProcessed(0);

      await this.playerAccountSync.syncPlayers(
        host,
        host.getSelectedPlayers(),
        { debugActivities: true }
      );

      if (host.getSelectedDate()) {
        if (environment.debug) {
          console.log(
            '[Load] Character history sync done, loading activities for date',
            host.getSelectedDate()
          );
        }
        await host.loadAllFilteredActivities(true);
      }
      host.emitStatsDebounce();
    } catch (error) {
      host.setSelectedPlayers([]);
      host.clearSelectedCharacterId(host.getPlayerKey(displayPlayer));
      throw error;
    } finally {
      host.setDateActivityLoading(false);
      host.detectChanges();
    }
  }

  async appendPlayer(
    host: PlayerSelectLoadHost,
    player: PlayerSearchDisplay
  ): Promise<void> {
    host.setShowPlatformPicker(false);

    const incomingGame = (player as any).game || 'D2';

    if (
      host
        .getSelectedPlayers()
        .some((p) => p.membershipId === player.membershipId && p.game === incomingGame)
    ) {
      return;
    }

    const displayPlayer = toDisplayPlayer(player, {
      isPrimary: false,
      game: incomingGame,
    });

    host.pushSelectedPlayer(displayPlayer);
    host.setSelectedCharacterId(host.getPlayerKey(displayPlayer), undefined);

    host.updateUrlForPermalink();

    if (host.getActiveTab() === 'firsts') {
      host.syncActiveFirstsGameWithPlayers();
    }
    host.updatePlatformTabs();
    host.detectChanges();

    try {
      await this.playerAccountSync.syncOnePlayer(host, displayPlayer);

      if (host.getSelectedDate()) {
        await host.loadAllFilteredActivities(true);
      }
      host.emitStatsDebounce();
    } catch (err) {
      console.warn('[appendPlayer] Failed to load new player', err);
    }

    host.markSyncedPlayer(host.getPlayerKey(displayPlayer));

    if (host.getFirstFullSyncDone() && host.getSelectedDate()) {
      await host.loadAllFilteredActivities(true);
    }

    host.addSelectedAccount(player);
    host.refreshComputedViews();
  }
}
