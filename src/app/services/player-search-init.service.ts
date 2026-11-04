import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActivityDbService } from './activity-db.service';
import { FirstActivityService } from './first-activity.service';
import { ShareService } from './share.service';
import { SharedStateService } from './shared-state.service';
import { ArchiveService } from './archive.service';
import { DeepLinkService } from './deep-link.service';
import { DeepLinkTab, parseDeepLink } from '../utils/deep-link';

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
  /** Show a tab right away (before accounts finish loading). */
  setActiveTab(tab: DeepLinkTab): void;
  /** Full tab switch with its lazy loads; call once accounts are selected. */
  onTabChange(tab: DeepLinkTab): Promise<void>;
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
    private archiveService: ArchiveService,
    private deepLinkService: DeepLinkService
  ) {}

  async runNgOnInit(host: PlayerSearchInitHost): Promise<void> {
    host.installRegressionProbe();

    if (host.isOfflineArchiveMode()) {
      await host.hydrateFromOfflineArchive();
      host.setShowOfflineDeviceReady(this.archiveService.isDevicePreparedForOffline());
    }

    host.setDefaultTodayDate();

    const params = this.route.snapshot.params;
    const snapshotQuery = this.route.snapshot.queryParams;
    const queryParams: Record<string, string> = Object.keys(snapshotQuery).length
      ? snapshotQuery
      : Object.fromEntries(new URLSearchParams(window.location.search));
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

    // ?a=<type>-<id>&tab=&d= skips search: accounts go straight to the normal loader.
    // An unusable link parses to null and falls through to the normal home page.
    const deepLink = parseDeepLink(queryParams);
    let deepLinkTab: DeepLinkTab | null = null;
    if (deepLink && !host.getPendingPlayerData()) {
      try {
        host.setPendingPlayerData(await this.deepLinkService.resolvePlayers(deepLink));
        host.applyPermalinkDate(deepLink.date);
        host.setActiveTab(deepLink.tab);
        deepLinkTab = deepLink.tab;
      } catch (err) {
        console.warn('[DeepLink] could not open link, showing home', err);
      }
    }

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
      const loading = host.loadPlayersFromUrlData(pending);
      let tabOpened: Promise<void> | null = null;
      if (deepLinkTab) {
        // The full load keeps going for a long time (Bungie fill-in); the linked tab's own
        // loads must start as soon as the account is selected, not when that load ends.
        let settled = false;
        const done = loading.then(
          () => { settled = true; },
          () => { settled = true; }
        );
        while (!settled && host.getSelectedPlayersLength() === 0) {
          await Promise.race([done, new Promise((r) => setTimeout(r, 50))]);
        }
        if (host.getSelectedPlayersLength() > 0) {
          tabOpened = host.onTabChange(deepLinkTab).catch((err) => {
            console.warn('[DeepLink] tab load failed', err);
          });
        }
      }
      await loading;
      host.setPendingPlayerData(null);
      if (tabOpened) {
        await tabOpened;
      }
    } else {
      await host.loadAndDisplayFavorites();
    }

    host.setDbReady(true);
    host.detectChanges();
    host.addVisibilityListener();
  }
}
