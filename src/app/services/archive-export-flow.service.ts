import { Injectable } from '@angular/core';
import { ArchiveAccount } from '../models/archive.types';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ActivityHistory } from '../models/activity-history.model';
import { DestinyManifestService } from '../core/data/manifest.service';
import { ArchiveService } from './archive.service';
import { ArchiveRuntimeService } from './archive-runtime.service';
import { ArchiveHtmlReportService } from './archive-html-report.service';
import { AssetUrlService } from './asset-url.service';
import { UiI18nService } from './ui-i18n.service';

/** Host for offline archive prepare / ZIP / HTML report (CODE_CLEANUP_SPEC). */
export interface ArchiveExportFlowHost {
  getSelectedPlayers(): PlayerSearchDisplay[];
  setErrorMessage(message: string): void;
  needProfilesMessage(): string;
  exportFailedMessage(): string;
  exportStartingMessage(): string;
  setArchiveExporting(on: boolean): void;
  setArchiveProgressMessage(message: string): void;
  setArchiveProgressPercent(percent: number): void;
  detectChanges(): void;
  setApiAvailable(on: boolean): void;
  setBungieUnavailable(on: boolean): void;
  setShowOfflineDeviceReady(on: boolean): void;
  setDismissOfflineDeviceReady(on: boolean): void;
  loadAllFilteredActivities(force: boolean): Promise<void>;
  getPlayerKey(player: PlayerSearchDisplay): string;
  getCharacters(playerKey: string): unknown[];
  getFirstEverActivity(): ActivityHistory | undefined;
  setSelectedPlayers(players: PlayerSearchDisplay[]): void;
  setDateActivityLoading(loading: boolean): void;
  showCachedDataInstantly(
    player: PlayerSearchDisplay,
    playerKey: string
  ): Promise<boolean | void>;
  loadFavorites(): Promise<void>;
  loadCharacterHistory(player: PlayerSearchDisplay): Promise<void>;
}

/**
 * Device-prepare, ZIP download, HTML report, and offline hydrate (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class ArchiveExportFlowService {
  constructor(
    private archiveService: ArchiveService,
    private archiveRuntime: ArchiveRuntimeService,
    private archiveHtmlReportService: ArchiveHtmlReportService,
    private assetUrl: AssetUrlService,
    private manifest: DestinyManifestService,
    private uiI18n: UiI18nService
  ) {}

  async hydrateFromOfflineArchive(host: ArchiveExportFlowHost): Promise<void> {
    const manifest = this.archiveRuntime.archiveManifest;
    if (!manifest?.accounts?.length) {
      return;
    }
    host.setApiAvailable(false);
    host.setBungieUnavailable(true);
    await this.archiveRuntime.preloadMedia();
    await host.loadFavorites();
    const players: PlayerSearchDisplay[] = manifest.accounts.map((acct) => ({
      membershipId: acct.membershipId,
      membershipType: acct.membershipType,
      displayName: acct.displayName,
      platform: acct.platform,
      game: acct.game,
      iconPath: acct.iconPath ? this.assetUrl.resolve(acct.iconPath) : undefined,
    }));
    for (const player of players) {
      const playerKey = host.getPlayerKey(player);
      await host.showCachedDataInstantly(player, playerKey);
    }
    host.setSelectedPlayers(players);
    host.setDateActivityLoading(false);
    host.detectChanges();
  }

  async runArchiveExport(
    host: ArchiveExportFlowHost,
    mode: 'prepare' | 'download',
    includePgcr: boolean
  ): Promise<void> {
    const selectedPlayers = host.getSelectedPlayers();
    if (selectedPlayers.length === 0) {
      host.setErrorMessage(host.needProfilesMessage());
      return;
    }
    host.setArchiveExporting(true);
    host.setArchiveProgressMessage(host.exportStartingMessage());
    host.setArchiveProgressPercent(0);
    host.detectChanges();
    const accounts: ArchiveAccount[] = selectedPlayers.map((p) => ({
      membershipId: p.membershipId,
      membershipType: p.membershipType,
      displayName: p.displayName,
      platform: p.platform,
      game: p.game as 'D1' | 'D2',
      iconPath: p.iconPath,
    }));
    const onProgress = (message: string, percent: number) => {
      host.setArchiveProgressMessage(message);
      host.setArchiveProgressPercent(percent);
      host.detectChanges();
    };
    try {
      if (mode === 'prepare') {
        await this.archiveService.prepareDeviceForOffline(accounts, {
          includePgcr,
          onProgress,
        });
        await this.archiveRuntime.preloadMedia();
        host.setApiAvailable(false);
        host.setBungieUnavailable(true);
        host.setShowOfflineDeviceReady(true);
        host.setDismissOfflineDeviceReady(false);
        await host.loadAllFilteredActivities(true);
        host.detectChanges();
      } else {
        await this.archiveService.exportArchive(accounts, {
          includePgcr,
          onProgress,
        });
      }
    } catch (err) {
      console.error(
        mode === 'prepare' ? '[Archive] prepare device failed' : '[Archive] export failed',
        err
      );
      host.setErrorMessage(host.exportFailedMessage());
    } finally {
      host.setArchiveExporting(false);
      host.detectChanges();
    }
  }

  async buildHtmlArchiveReport(host: ArchiveExportFlowHost): Promise<void> {
    const selectedPlayers = host.getSelectedPlayers();
    if (selectedPlayers.length === 0) {
      host.setErrorMessage(host.needProfilesMessage());
      return;
    }
    host.setArchiveExporting(true);
    host.setArchiveProgressMessage('Generating HTML archive report...');
    host.setArchiveProgressPercent(10);
    host.detectChanges();

    try {
      const reportData = await this.archiveHtmlReportService.collectReportData(
        selectedPlayers,
        {
          getPlayerKey: (p) => host.getPlayerKey(p as PlayerSearchDisplay),
          getCharacters: (key) => host.getCharacters(key) as any[],
          firstEverActivity: host.getFirstEverActivity(),
          onProgress: (percent) => {
            host.setArchiveProgressPercent(percent);
            host.detectChanges();
          },
        }
      );

      host.setArchiveProgressMessage('Building HTML report...');
      host.setArchiveProgressPercent(80);
      host.detectChanges();

      const html = this.archiveHtmlReportService.generateHtmlReport(reportData);

      host.setArchiveProgressMessage('Downloading report...');
      host.setArchiveProgressPercent(95);
      host.detectChanges();

      const label =
        selectedPlayers[0]?.displayName?.replace(/[^\w.-]+/g, '_') || 'archive';
      this.archiveHtmlReportService.downloadHtmlReport(
        html,
        `${label}-destiny-chronicle-report.html`
      );

      host.setArchiveProgressPercent(100);
      host.detectChanges();
    } catch (err) {
      console.error('[Archive] HTML report generation failed', err);
      host.setErrorMessage('Failed to generate HTML report');
    } finally {
      host.setArchiveExporting(false);
      host.detectChanges();
    }
  }

  async updateOfflineArchive(host: ArchiveExportFlowHost): Promise<void> {
    const manifest = this.archiveRuntime.archiveManifest;
    const accounts: ArchiveAccount[] = manifest?.accounts?.length
      ? manifest.accounts
      : host.getSelectedPlayers().map((p) => ({
          membershipId: p.membershipId,
          membershipType: p.membershipType,
          displayName: p.displayName,
          platform: p.platform,
          game: p.game as 'D1' | 'D2',
          iconPath: p.iconPath,
        }));
    host.setArchiveExporting(true);
    try {
      await this.archiveService.updateArchive(accounts, manifest, {
        includePgcr: manifest?.includePgcr ?? true,
        onProgress: (message, percent) => {
          host.setArchiveProgressMessage(message);
          host.setArchiveProgressPercent(percent);
          host.detectChanges();
        },
      });
    } finally {
      host.setArchiveExporting(false);
      host.detectChanges();
    }
  }

  async importArchiveFile(host: ArchiveExportFlowHost, file: File): Promise<void> {
    try {
      host.setArchiveExporting(true);
      host.setArchiveProgressMessage(this.uiI18n.t('archive.importStarting'));
      await this.archiveService.importArchive(file);
      await this.archiveRuntime.preloadMedia();
      await this.hydrateFromOfflineArchive(host);
      host.setShowOfflineDeviceReady(true);
      host.setDismissOfflineDeviceReady(false);
    } catch (err) {
      console.error('[Archive] import failed', err);
      host.setErrorMessage(this.uiI18n.t('archive.importFailed'));
    } finally {
      host.setArchiveExporting(false);
      host.detectChanges();
    }
  }

  async checkForArchiveUpdates(host: ArchiveExportFlowHost): Promise<void> {
    const manifest = this.archiveRuntime.archiveManifest;
    if (!manifest?.accounts?.length) {
      host.setErrorMessage(this.uiI18n.t('archive.needProfiles'));
      return;
    }

    host.setArchiveExporting(true);
    host.setArchiveProgressMessage(this.uiI18n.t('archive.checkingUpdates'));
    host.setArchiveProgressPercent(0);
    this.archiveRuntime.beginOnlineSyncSession();
    host.detectChanges();

    try {
      await this.manifest.refreshManifest();
      const reachable = await this.archiveService.isBungieReachable();
      if (!reachable) {
        host.setErrorMessage(this.uiI18n.t('archive.bungieOffline'));
        return;
      }

      const players: PlayerSearchDisplay[] = manifest.accounts.map((acct) => ({
        membershipId: acct.membershipId,
        membershipType: acct.membershipType,
        displayName: acct.displayName,
        platform: acct.platform,
        game: acct.game,
        iconPath: acct.iconPath ? this.assetUrl.resolve(acct.iconPath) : undefined,
      }));

      let step = 0;
      for (const player of players) {
        step++;
        host.setArchiveProgressMessage(
          `${this.uiI18n.t('archive.syncingAccount')} ${player.displayName}…`
        );
        host.setArchiveProgressPercent(Math.round((step / (players.length + 2)) * 40));
        host.detectChanges();
        await host.loadCharacterHistory(player);
      }

      const hasNew = await this.archiveService.hasActivitiesSince(manifest.lastSyncedAt);
      if (!hasNew) {
        host.setArchiveProgressMessage(this.uiI18n.t('archive.upToDate'));
        host.setArchiveProgressPercent(100);
        return;
      }

      await this.archiveService.prepareDeviceForOffline(manifest.accounts, {
        includePgcr: manifest.includePgcr,
        onProgress: (message, percent) => {
          host.setArchiveProgressMessage(message);
          host.setArchiveProgressPercent(40 + Math.round(percent * 0.55));
          host.detectChanges();
        },
      });
      await this.archiveRuntime.preloadMedia();
      await this.hydrateFromOfflineArchive(host);
      host.setShowOfflineDeviceReady(true);
      host.setArchiveProgressMessage(this.uiI18n.t('archive.updateSuccess'));
      host.setArchiveProgressPercent(100);
    } catch (err) {
      console.error('[Archive] check for updates failed', err);
      host.setErrorMessage(this.uiI18n.t('archive.updateFailed'));
    } finally {
      this.archiveRuntime.endOnlineSyncSession();
      host.setArchiveExporting(false);
      host.detectChanges();
    }
  }
}
