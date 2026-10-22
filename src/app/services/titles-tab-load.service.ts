import { Injectable } from '@angular/core';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { TitleService } from './title.service';

/** Host for Titles tab load / refresh helpers (CODE_CLEANUP_SPEC). */
export interface TitlesTabLoadHost {
  getSelectedPlayers(): PlayerSearchDisplay[];
  isD1Player(player: PlayerSearchDisplay): boolean;
  getPlayerKey(player: PlayerSearchDisplay): string;
  hasPlayerTitles(playerKey: string): boolean;
  getPlayerTitlesMap(): Record<string, unknown[]>;
  setLoadingTitlesOverall(loading: boolean): void;
  setLoadingTitlesForPlayer(playerKey: string, loading: boolean): void;
  setPlayerTitles(playerKey: string, titles: unknown[]): void;
  setAggregatedTitles(titles: unknown[]): void;
  emitStatsDebounce(): void;
  detectChanges(): void;
}

/**
 * Titles tab: load missing D2 titles and aggregate (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class TitlesTabLoadService {
  constructor(private titleService: TitleService) {}

  async ensureTitlesLoadedForTab(host: TitlesTabLoadHost): Promise<void> {
    host.setLoadingTitlesOverall(true);
    try {
      for (const player of host.getSelectedPlayers()) {
        if (host.isD1Player(player)) continue;
        const pKey = host.getPlayerKey(player);
        if (host.hasPlayerTitles(pKey)) continue;
        host.setLoadingTitlesForPlayer(pKey, true);
        try {
          await this.loadTitlesForPlayer(host, player);
        } finally {
          host.setLoadingTitlesForPlayer(pKey, false);
        }
      }
      host.setAggregatedTitles(
        this.titleService.aggregateTitles(
          host.getSelectedPlayers() as any,
          host.getPlayerTitlesMap() as any
        )
      );
      host.emitStatsDebounce();
    } finally {
      host.setLoadingTitlesOverall(false);
      host.detectChanges();
    }
  }

  async loadTitlesForPlayer(
    host: TitlesTabLoadHost,
    player: PlayerSearchDisplay
  ): Promise<void> {
    if (host.isD1Player(player)) return;
    const pKey = host.getPlayerKey(player);
    if (host.hasPlayerTitles(pKey)) return;

    try {
      const titles = await this.titleService.getPlayerTitles(player as any);
      const completed = titles
        .filter((t) => t.completed)
        .sort((a, b) => a.name.localeCompare(b.name));
      const locked = titles
        .filter((t) => !t.completed)
        .sort((a, b) => a.name.localeCompare(b.name));
      host.setPlayerTitles(pKey, [...completed, ...locked]);
      host.setAggregatedTitles(
        this.titleService.aggregateTitles(
          host.getSelectedPlayers() as any,
          host.getPlayerTitlesMap() as any
        )
      );
      host.emitStatsDebounce();
    } catch (err) {
      console.warn(
        '[loadTitlesForPlayer] Failed to load titles for player',
        player.membershipId,
        err
      );
      host.setPlayerTitles(pKey, []);
    }
  }
}
