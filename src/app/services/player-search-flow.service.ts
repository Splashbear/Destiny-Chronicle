import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { PlayerSearchResult } from '../core/data/bungie-api.service';
import {
  PlayerSearchBundle,
  dedupePlayerSearchDisplay,
  mapD1SearchPlayers,
  mapSearchAllGamesToBundle,
  pickSoleSearchPlayer,
} from '../utils/player-search-results';
import { parseUsernames, shouldSearchAsSingleUsername } from '../utils/search-usernames';
import { PlayerSearchQueryService } from './player-search-query.service';

/** Host for addPlayer / bulk-name search orchestration. */
export interface PlayerSearchFlowHost {
  isOfflineArchiveMode(): boolean;
  offlineSearchDisabledMessage(): string;
  isProfileLoadBusy(): boolean;
  stopProfileLoading(): void;
  setShowFavoritesLoadPrompt(show: boolean): void;
  getSearchUsername(): string;
  setSearchUsername(value: string): void;
  getSearchChips(): string[];
  setSearchChips(chips: string[]): void;
  setErrorMessage(message: string): void;
  getAddMode(): boolean;
  clearForReplaceSearch(): Promise<void>;
  resetSearchResultLists(): void;
  setSearchLoading(loading: boolean): void;
  clearSearchErrorMap(): void;
  detectChanges(): void;
  applySearchBundle(bundle: PlayerSearchBundle, mode: 'replace' | 'append'): void;
  selectPlayer(player: PlayerSearchResult | PlayerSearchDisplay): Promise<void>;
  getD1SearchResults(): PlayerSearchDisplay[];
  setD1SearchResults(players: PlayerSearchDisplay[]): void;
  getD2SearchResults(): PlayerSearchDisplay[];
  setD2SearchResults(players: PlayerSearchDisplay[]): void;
  pushD2SearchResults(players: PlayerSearchDisplay[]): void;
  pushD1SearchResults(players: PlayerSearchDisplay[]): void;
  getCrossSavePlayer(): PlayerSearchDisplay | null;
  setCrossSavePlayer(player: PlayerSearchDisplay | null): void;
  openPlatformPicker(): void;
  focusSearchModal(): void;
  setAddMode(on: boolean): void;
}

/**
 * Username / membership-id search orchestration (CODE_CLEANUP_SPEC).
 * Query I/O stays on PlayerSearchQueryService; UI state on the host.
 */
@Injectable({ providedIn: 'root' })
export class PlayerSearchFlowService {
  constructor(private playerSearchQuery: PlayerSearchQueryService) {}

  async addPlayer(host: PlayerSearchFlowHost): Promise<void> {
    if (host.isOfflineArchiveMode()) {
      host.setErrorMessage(host.offlineSearchDisabledMessage());
      return;
    }
    if (host.isProfileLoadBusy()) {
      host.stopProfileLoading();
    }
    host.setShowFavoritesLoadPrompt(false);

    const pending = (host.getSearchUsername() || '').trim();
    if (!pending && host.getSearchChips().length === 0) {
      host.setErrorMessage('Please enter a username.');
      return;
    }

    if (host.getSearchChips().length > 0) {
      const names = [...host.getSearchChips()];
      if (pending) {
        names.push(pending);
      }
      const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
      host.setSearchChips([]);
      host.setSearchUsername('');

      if (uniqueNames.length > 1) {
        await this.runBulkNameSearch(host, uniqueNames);
        return;
      }
      if (uniqueNames.length === 1) {
        host.setSearchUsername(uniqueNames[0]);
      }
    }

    let searchUsername = host.getSearchUsername();
    if (searchUsername.includes(',') || searchUsername.includes('\n')) {
      const raw = searchUsername.trim();
      const isSingleUser = shouldSearchAsSingleUsername(raw);
      if (isSingleUser) {
        host.setSearchUsername(raw);
        searchUsername = raw;
      } else {
        const names = parseUsernames(searchUsername);
        if (names.length > 1) {
          await this.runBulkNameSearch(host, names);
          host.setSearchUsername('');
          return;
        }
      }
    }

    if (!host.getAddMode()) {
      await host.clearForReplaceSearch();
    }

    host.setErrorMessage('');
    host.resetSearchResultLists();
    host.setSearchLoading(true);
    host.clearSearchErrorMap();
    host.setSearchUsername(host.getSearchUsername().trim());

    const trimmedSearch = host.getSearchUsername().trim();
    const isNumericId = /^\d{15,20}$/.test(trimmedSearch);

    if (isNumericId) {
      const result = await this.playerSearchQuery.lookupMembershipId(trimmedSearch);
      if (!result.ok) {
        host.setErrorMessage(result.errorMessage);
        host.setSearchLoading(false);
        host.detectChanges();
        return;
      }
      host.applySearchBundle(result.bundle, 'replace');
      await this.finishSearchOutcome(host, {
        countCrossSaveInTotal: false,
        emptyMessage: 'No Destiny accounts found for that membership ID.',
      });
      host.setSearchLoading(false);
      host.detectChanges();
      return;
    }

    try {
      const [d2Resp, d1Xbox, d1Psn] = await this.playerSearchQuery.searchAllGamesRaw(
        host.getSearchUsername()
      );

      if (host.getSearchUsername().includes('#')) {
        await this.processExactD2SearchResponse(host, d2Resp);
      } else {
        const mapped = mapSearchAllGamesToBundle(
          host.getSearchUsername(),
          d2Resp,
          [],
          []
        );
        host.setD2SearchResults(mapped.d2);
        host.setCrossSavePlayer(mapped.crossSave);
      }

      host.setD1SearchResults(mapD1SearchPlayers(d1Xbox, d1Psn));

      await this.finishSearchOutcome(host, {
        countCrossSaveInTotal: false,
        emptyMessage: 'No Destiny accounts found with that name.',
        preferD2ThenD1: true,
      });
    } catch (error: any) {
      console.error('Error searching accounts:', error);
      if (error.status === 503) {
        host.setErrorMessage(
          'Bungie API is temporarily unavailable. Please try again later.'
        );
      } else {
        host.setErrorMessage(
          `Error searching for accounts: ${error.message || 'Unknown error'}`
        );
      }
    } finally {
      host.setSearchLoading(false);
      host.detectChanges();
    }
  }

  /** Exact Bungie Name (#) response → set D2 results and open picker / select. */
  async processExactD2SearchResponse(
    host: PlayerSearchFlowHost,
    response: any
  ): Promise<void> {
    const mapped = this.playerSearchQuery.mapExactD2Response(response);
    if (mapped.empty) {
      host.setErrorMessage('No Destiny 2 player found with that Bungie Name.');
      return;
    }

    host.setD2SearchResults(mapped.players);
    host.setCrossSavePlayer(mapped.crossSave);

    if (mapped.players.length > 1 || mapped.crossSave) {
      host.openPlatformPicker();
    } else if (mapped.players.length === 1) {
      await host.selectPlayer(mapped.players[0]);
    }
  }

  async finishSearchOutcome(
    host: PlayerSearchFlowHost,
    opts: {
      countCrossSaveInTotal: boolean;
      emptyMessage: string;
      preferD2ThenD1?: boolean;
    }
  ): Promise<void> {
    const crossExtra =
      opts.countCrossSaveInTotal && host.getCrossSavePlayer() ? 1 : 0;
    const total =
      host.getD1SearchResults().length +
      host.getD2SearchResults().length +
      crossExtra;
    if (total === 0) {
      host.setErrorMessage(opts.emptyMessage);
    } else if (total === 1) {
      const player = opts.preferD2ThenD1
        ? host.getD2SearchResults()[0] || host.getD1SearchResults()[0]
        : pickSoleSearchPlayer(
            host.getD1SearchResults(),
            host.getD2SearchResults(),
            host.getCrossSavePlayer()
          );
      if (player) {
        await host.selectPlayer(player);
      }
    } else {
      host.openPlatformPicker();
      host.focusSearchModal();
    }
  }

  async runBulkNameSearch(
    host: PlayerSearchFlowHost,
    names: string[]
  ): Promise<void> {
    if (!host.getAddMode()) {
      await host.clearForReplaceSearch();
    }

    host.resetSearchResultLists();

    for (const name of names) {
      await this.addPlayerByName(host, name, { accumulate: true });
    }

    host.setD1SearchResults(dedupePlayerSearchDisplay(host.getD1SearchResults()));
    host.setD2SearchResults(dedupePlayerSearchDisplay(host.getD2SearchResults()));
    host.setCrossSavePlayer(
      host.getD2SearchResults().find((p) => p.isCrossSavePrimary) || null
    );

    await this.finishSearchOutcome(host, {
      countCrossSaveInTotal: true,
      emptyMessage: 'No Destiny accounts found for the provided names.',
    });
  }

  async addPlayerByName(
    host: PlayerSearchFlowHost,
    name: string,
    options?: { accumulate?: boolean }
  ): Promise<void> {
    const originalAddMode = host.getAddMode();
    const accumulate = options?.accumulate === true;
    try {
      if (!accumulate) {
        host.setAddMode(true);
        host.setErrorMessage('');
        host.resetSearchResultLists();
        host.setSearchLoading(true);
      }
      host.clearSearchErrorMap();
      const query = name.trim();
      if (!query) return;

      const [d2Resp, d1Xbox, d1Psn] =
        await this.playerSearchQuery.searchAllGamesRaw(query);

      if (query.includes('#')) {
        if (accumulate) {
          const mapped = mapSearchAllGamesToBundle(query, d2Resp, [], []);
          host.pushD2SearchResults(mapped.d2);
        } else {
          await this.processExactD2SearchResponse(host, d2Resp);
        }
      } else {
        const results = d2Resp?.Response?.searchResults as any[] | undefined;
        if (d2Resp && d2Resp.ErrorCode === 1 && results && results.length > 0) {
          const mapped = mapSearchAllGamesToBundle(query, d2Resp, [], []);
          if (accumulate) {
            host.pushD2SearchResults(mapped.d2);
          } else {
            host.setD2SearchResults(mapped.d2);
            host.setCrossSavePlayer(mapped.crossSave);
          }
        }
      }

      const d1Mapped = mapD1SearchPlayers(d1Xbox, d1Psn);
      if (accumulate) {
        host.pushD1SearchResults(d1Mapped);
      } else {
        host.setD1SearchResults(d1Mapped);
      }

      if (!accumulate) {
        const total =
          host.getD1SearchResults().length + host.getD2SearchResults().length;
        if (total === 1) {
          const player =
            host.getD2SearchResults()[0] || host.getD1SearchResults()[0];
          await host.selectPlayer(player);
        } else if (total === 0) {
          console.warn(`[BulkAdd] No accounts found for "${name}"`);
        } else {
          host.openPlatformPicker();
          host.focusSearchModal();
        }
      } else {
        const total =
          host.getD1SearchResults().length + host.getD2SearchResults().length;
        if (total === 0) {
          console.warn(`[BulkAdd] No accounts found for "${name}"`);
        }
      }
    } catch (err) {
      console.warn(`[BulkAdd] Failed to add "${name}":`, err);
    } finally {
      if (!accumulate) {
        host.setSearchLoading(false);
        host.setAddMode(originalAddMode);
        host.detectChanges();
      }
    }
  }
}
