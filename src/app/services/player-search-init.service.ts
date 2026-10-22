import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActivityDbService } from './activity-db.service';
import { FirstActivityService } from './first-activity.service';
import { ShareService } from './share.service';
import { SharedStateService } from './shared-state.service';
import { ArchiveService } from './archive.service';

/** Host for player-search ngOnInit bootstrap (CODE_CLEANUP_SPEC). */
export interface PlayerSearchInitHost {
  installRegressionProbe(): void;
  isOfflineArchiveMode(): boolean;
  hydrateFromOfflineArchive(): Promise<void>;
  setShowOfflineDeviceReady(on: boolean): void;
  setDefaultTodayDate(): void;
  applyPermalinkDate(dateParam: string | null | undefined): void;
  applyPlayersParamFromUrl(playersParam: string): void;
  getPendingPlayerData(): unknown[] | null;
  setPendingPlayerData(data: unknown[] | null): void;
  clearFirstEverActivities(): void;
  loadPlayersFromUrlData(data: unknown[]): Promise<void>;
  loadAndDisplayFavorites(): Promise<void>;
  setDbReady(ready: boolean): void;
  detectChanges(): void;
  addVisibilityListener(): void;
  getSelectedPlayersLength(): number;
}

/**
 * Permalinks, share restore, favorites vs URL players bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class PlayerSearchInitService {
  constructor(
    private route: ActivatedRoute,
    private activityDb: ActivityDbService,
    private firstActivityService: FirstActivityService,
    private shareService: ShareService,
    private sharedState: SharedStateService,
    private archiveService: ArchiveService
  ) {}

  async runNgOnInit(host: PlayerSearchInitHost): Promise<void> {
    host.installRegressionProbe();

    if (host.isOfflineArchiveMode()) {
      await host.hydrateFromOfflineArchive();
      host.setShowOfflineDeviceReady(this.archiveService.isDevicePreparedForOffline());
    }

    host.setDefaultTodayDate();

    const params = this.route.snapshot.params;
    const queryParams = this.route.snapshot.queryParams;
    const pathname = window.location.pathname;
    const dateMatch = pathname.match(/\/date\/(\d{4}-\d{2}-\d{2})/);
    const playersMatch = pathname.match(/\/players\/(.+)$/);

    const pendingShare = this.sharedState.pendingShare;
    if (pendingShare) {
      this.sharedState.pendingShare = null;
      const normalized = this.shareService.normalizeShareState(pendingShare);
      if (normalized) {
        host.applyPermalinkDate(normalized.date);
        host.setPendingPlayerData(normalized.players);
      }
    }

    host.applyPermalinkDate(params['date'] || queryParams['date'] || dateMatch?.[1]);

    const playersParam = params['players'] || queryParams['players'] || playersMatch?.[1];
    if (playersParam) {
      host.applyPlayersParamFromUrl(playersParam);
    } else if (!host.getPendingPlayerData()) {
      await this.activityDb.clearAllActivities();
    }

    this.route.params.subscribe((routeParams) => {
      if (routeParams['date']) {
        host.applyPermalinkDate(routeParams['date']);
      }
      if (routeParams['players']) {
        host.applyPlayersParamFromUrl(routeParams['players']);
      }
    });
    this.route.queryParams.subscribe((qp) => {
      if (qp['date']) {
        host.applyPermalinkDate(qp['date']);
      }
      if (qp['players'] && host.getSelectedPlayersLength() === 0 && !host.getPendingPlayerData()) {
        host.applyPlayersParamFromUrl(qp['players']);
        const pending = host.getPendingPlayerData();
        if (pending) {
          host.setPendingPlayerData(null);
          void host.loadPlayersFromUrlData(pending);
        }
      }
    });

    host.clearFirstEverActivities();
    this.firstActivityService.clearCache();

    this.activityDb.preloadFavoritesCache().catch((error) => {
      console.warn('Favorites cache preload failed:', error);
    });

    const pending = host.getPendingPlayerData();
    if (pending) {
      await host.loadPlayersFromUrlData(pending);
      host.setPendingPlayerData(null);
    } else {
      await host.loadAndDisplayFavorites();
    }

    host.setDbReady(true);
    host.detectChanges();
    host.addVisibilityListener();
  }
}
