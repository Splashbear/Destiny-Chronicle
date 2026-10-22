import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { interleavePlayersForConcurrency } from '../utils/interleave-players';

/**
 * Host callbacks for concurrent per-account sync after selection/append.
 * PlayerSearchComponent implements this; I/O stays on existing loaders.
 */
export interface PlayerAccountSyncHost {
  isD1Player(player: PlayerSearchDisplay): boolean;
  runWithPlayerSyncLimit<T>(task: () => Promise<T>): Promise<T>;
  loadCharacterHistory(player: PlayerSearchDisplay): Promise<void>;
  scheduleAfterBrowseReady(fn: () => void): void;
  loadGuardianFirsts(player: PlayerSearchDisplay): Promise<void>;
  loadDungeonSoloFirsts(player: PlayerSearchDisplay): Promise<void>;
  loadTitlesForPlayer(player: PlayerSearchDisplay): Promise<void>;
  /** Optional debug dump after character history (primary select path). */
  debugPlayerActivities?(membershipId: string): Promise<void>;
}

export type PlayerSyncCancelPhase = 'before' | 'afterHistory' | 'afterError';

export interface PlayerAccountSyncOptions {
  debugActivities?: boolean;
  /** Favorites/URL keep input order; primary select interleaves D1/D2. */
  preserveOrder?: boolean;
  /**
   * Return false to abort this player (e.g. load token changed).
   * Called before history, after history, and on catch.
   */
  shouldContinue?: (
    player: PlayerSearchDisplay,
    phase: PlayerSyncCancelPhase
  ) => boolean;
  onCancelled?: (player: PlayerSearchDisplay, reason: string) => void;
  onPlayerError?: (player: PlayerSearchDisplay, err: unknown) => void;
  /** console.warn prefix when a player sync fails (default LoadCharacterHistory/Firsts). */
  errorLogLabel?: string;
}

/**
 * Concurrent D1/D2 account sync with firsts/titles side work (CODE_CLEANUP_SPEC).
 * Extracted from PlayerSearchComponent select / append / favorites / permalink paths.
 */
@Injectable({ providedIn: 'root' })
export class PlayerAccountSyncService {
  /**
   * Sync each account under the host concurrency limit.
   * Firsts/dungeon solos wait for browse-ready; titles fire in parallel for D2.
   */
  async syncPlayers(
    host: PlayerAccountSyncHost,
    players: PlayerSearchDisplay[],
    opts?: PlayerAccountSyncOptions
  ): Promise<void> {
    const allPlayers = opts?.preserveOrder
      ? players
      : interleavePlayersForConcurrency(
          players.filter(p => host.isD1Player(p)),
          players.filter(p => !host.isD1Player(p))
        );
    const errorLabel = opts?.errorLogLabel ?? '[LoadCharacterHistory/Firsts]';
    const loadPromises: Promise<void>[] = [];

    for (const pl of allPlayers) {
      loadPromises.push(
        host.runWithPlayerSyncLimit(async () => {
          if (opts?.shouldContinue && !opts.shouldContinue(pl, 'before')) {
            opts.onCancelled?.(pl, 'cancelled before start');
            return;
          }
          try {
            await host.loadCharacterHistory(pl);
            if (opts?.shouldContinue && !opts.shouldContinue(pl, 'afterHistory')) {
              opts.onCancelled?.(pl, 'cancelled after history');
              return;
            }
            host.scheduleAfterBrowseReady(() => {
              void host.loadGuardianFirsts(pl).catch(err => {
                console.warn('[Sync] Firsts skipped for', pl.membershipId, err);
              });
              void host.loadDungeonSoloFirsts(pl).catch(err => {
                console.warn('[Sync] DungeonSolo skipped for', pl.membershipId, err);
              });
            });
            if (opts?.debugActivities && host.debugPlayerActivities) {
              await host.debugPlayerActivities(pl.membershipId);
            }
          } catch (err) {
            if (opts?.shouldContinue && !opts.shouldContinue(pl, 'afterError')) {
              opts.onCancelled?.(pl, 'cancelled after error');
              return;
            }
            console.warn(errorLabel, 'Skipped due to error for', pl.membershipId, err);
            opts?.onPlayerError?.(pl, err);
          }
        })
      );

      if (!host.isD1Player(pl)) {
        void host.loadTitlesForPlayer(pl).catch((err: any) => {
          console.warn('[Sync] Title load skipped for', pl.membershipId, err);
        });
      }
    }

    await Promise.all(loadPromises);
  }

  /** Single-account append path (same post-history side work, no interleave). */
  async syncOnePlayer(
    host: PlayerAccountSyncHost,
    player: PlayerSearchDisplay
  ): Promise<void> {
    await host.runWithPlayerSyncLimit(async () => {
      await host.loadCharacterHistory(player);
      host.scheduleAfterBrowseReady(() => {
        void host.loadGuardianFirsts(player).catch(err => {
          console.warn('[Sync] Firsts skipped for', player.membershipId, err);
        });
        void host.loadDungeonSoloFirsts(player).catch(err => {
          console.warn('[Sync] DungeonSolo skipped for', player.membershipId, err);
        });
      });
    });

    if (!host.isD1Player(player)) {
      void host.loadTitlesForPlayer(player).catch((err: any) =>
        console.warn('[appendPlayer] Background title load skipped', err)
      );
    }
  }
}
