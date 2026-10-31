import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { PlayerSearchResult } from '../core/data/bungie-api.service';
import { filterModalSelectedPlayers } from '../utils/modal-search-players';

/** Host for modal multi-select load (CODE_CLEANUP_SPEC). */
export interface ModalPlayerLoadHost {
  collectAllModalPlayers(): PlayerSearchDisplay[];
  getModalSelectedPlayers(): Set<string>;
  getPlayerKey(player: PlayerSearchDisplay): string;
  setErrorMessage(message: string): void;
  selectPlayer(player: PlayerSearchResult | PlayerSearchDisplay): Promise<void>;
  appendPlayer(player: PlayerSearchDisplay): Promise<void>;
  setShowPlatformPicker(show: boolean): void;
  getSelectedDate(): string;
  loadAllFilteredActivities(): Promise<void>;
  calculateAccountStats(): Promise<void> | void;
  clearModalSelectedPlayers(): void;
  setSearchPanelExpanded(expanded: boolean): void;
  detectChanges(): void;
  /** Hold engram theater across primary + appends until the day is ready. */
  beginDecryptBatchHold(): void;
  endDecryptBatchHold(): void;
  seedFetchingProfileStatuses(players: PlayerSearchDisplay[]): void;
}

/**
 * Load accounts selected in the search-results modal (primary + append rest).
 */
@Injectable({ providedIn: 'root' })
export class ModalPlayerLoadService {
  async loadSelectedPlayers(host: ModalPlayerLoadHost): Promise<void> {
    const selectedPlayers = filterModalSelectedPlayers(
      host.collectAllModalPlayers(),
      host.getModalSelectedPlayers(),
      (p) => host.getPlayerKey(p)
    );

    if (selectedPlayers.length === 0) {
      return;
    }

    if (selectedPlayers.length > 10) {
      host.setErrorMessage(
        `Too many profiles selected (${selectedPlayers.length}). Only the first 10 will be loaded.`
      );
      selectedPlayers.splice(10);
    }

    const [primary, ...rest] = selectedPlayers;
    // Keep the bronze engram up for the whole multi-account wait — do not unzip
    // after the primary day-browse while appends are still loading.
    host.beginDecryptBatchHold();
    try {
      await host.selectPlayer(primary);
      // Seed remaining rows so facets/checklist show every account during the wait.
      if (rest.length) {
        host.seedFetchingProfileStatuses(rest);
      }
      for (const player of rest) {
        await host.appendPlayer(player);
      }

      host.setShowPlatformPicker(false);
      if (host.getSelectedDate()) {
        await host.loadAllFilteredActivities();
      }
      await host.calculateAccountStats();

      host.setShowPlatformPicker(false);
      host.clearModalSelectedPlayers();
      host.setSearchPanelExpanded(false);
      host.detectChanges();
    } finally {
      host.endDecryptBatchHold();
    }
  }
}
