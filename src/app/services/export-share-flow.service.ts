import { Injectable } from '@angular/core';
import { ExportService, ExportRequest } from './export.service';
import { ShareService } from './share.service';
import { TitleService } from './title.service';
import { ActivityDbService } from './activity-db.service';
import { DestinyManifestService } from '../core/data/manifest.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { normalizeExportFromDate } from '../utils/export-options-date';
import { copyTextToClipboard } from '../utils/clipboard-text';
import { capturePageScreenshot } from '../utils/capture-page-screenshot';

export interface BreakdownExportGroup {
  label: string;
  rows: Array<{
    baseName: string;
    variantName?: string;
    game: string;
    runs: number;
    clears: number;
    fails: number;
    timeSeconds: number;
  }>;
}

export interface BreakdownExportSummaryCard {
  label: string;
  runs: number;
  clears: number;
  timeSeconds: number;
  clearRate: number;
}

/** Host for export / share clipboard / screenshot (CODE_CLEANUP_SPEC). */
export interface ExportShareFlowHost {
  getSelectedPlayers(): PlayerSearchDisplay[];
  getSelectedDate(): string | null | undefined;
  getPlayerKey(player: PlayerSearchDisplay): string;
  getCharacters(): Record<string, unknown>;
  getFilteredBreakdownSummaryCards(): BreakdownExportSummaryCard[];
  getFilteredBreakdownGroups(): BreakdownExportGroup[];
  getBreakdownSummaryCards(): BreakdownExportSummaryCard[];
  getBreakdownGroups(): BreakdownExportGroup[];
  formatSecondsToHoursMinutes(seconds: number): string;
  getFilteredActivitiesForDate(): unknown;
  getAccountStats(): unknown;
  getActivityBreakdownSnapshot(): {
    summaryCards: unknown;
    groups: unknown;
    filters: {
      selectedAccountKeys: string[];
      selectedCardLabels: string[];
      chartGame: string;
      chartCategory: string;
    };
  };
  setShowExportDialog(show: boolean): void;
  setShowShareDropdown(show: boolean): void;
  detectChanges(): void;
  getActiveTab(): string;
  onTabChange(tab: string): Promise<void>;
  isD1Player(player: PlayerSearchDisplay): boolean;
  clearPlayerTitlesCache(): void;
  setLoadingTitlesOverall(loading: boolean): void;
  markTitlesLoadingForPlayers(): void;
}

/**
 * Excel export, share link, clipboard snapshot, screenshot (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class ExportShareFlowService {
  constructor(
    private exportService: ExportService,
    private shareService: ShareService,
    private titleService: TitleService,
    private activityDb: ActivityDbService,
    private manifest: DestinyManifestService
  ) {}

  private exportContext(host: ExportShareFlowHost) {
    return {
      selectedPlayers: host.getSelectedPlayers(),
      activityDb: this.activityDb,
      manifestService: this.manifest,
      characters: host.getCharacters(),
      getPlayerKey: (p: PlayerSearchDisplay) => host.getPlayerKey(p),
      titleService: this.titleService,
    };
  }

  private mapBreakdownGroups(groups: BreakdownExportGroup[]) {
    return groups.map((g) => ({
      label: g.label,
      rows: g.rows.map((r) => ({
        baseName: r.baseName,
        variantName: r.variantName || '',
        game: r.game,
        runs: r.runs,
        clears: r.clears,
        fails: r.fails,
        timeSeconds: r.timeSeconds,
      })),
    }));
  }

  async exportBreakdownToExcel(host: ExportShareFlowHost): Promise<void> {
    const summary = host.getFilteredBreakdownSummaryCards();
    const groups = host.getFilteredBreakdownGroups();
    if (!summary?.length || !groups?.length) {
      console.warn('[Export] No breakdown data to export');
      return;
    }
    try {
      await this.exportService.exportActivityBreakdownToExcel({
        summaryCards: summary,
        groups: this.mapBreakdownGroups(groups),
        formatTime: (s: number) => host.formatSecondsToHoursMinutes(s),
      });
    } catch (err) {
      console.error('Failed to export activity breakdown:', err);
      alert('Failed to export. Please try again.');
    }
  }

  async exportActivities(host: ExportShareFlowHost): Promise<void> {
    const selectedDate = host.getSelectedDate();
    if (!selectedDate) {
      console.warn('[Export] No date selected');
      return;
    }
    const dateParts = selectedDate.split('-');
    if (dateParts.length !== 3) {
      console.warn('[Export] Invalid selectedDate format:', selectedDate);
      return;
    }
    const [year, month, day] = dateParts.map(Number);
    const fromDate = new Date(Date.UTC(year, month - 1, day));
    const req: ExportRequest = {
      from: fromDate,
      to: fromDate,
      types: [],
      platforms: [],
      includeSummaries: false,
      includeFirsts: false,
      includeActivities: true,
    } as const;
    await this.exportService.exportMultiSheet(req, this.exportContext(host));
  }

  openExportOptionsDialog(host: ExportShareFlowHost): void {
    host.setShowExportDialog(true);
  }

  async handleExportOptions(host: ExportShareFlowHost, options: any): Promise<void> {
    console.log('Received export options:', options);
    host.setShowExportDialog(false);
    options.from = normalizeExportFromDate(options.from);
    await this.exportService.exportMultiSheet(options, {
      ...this.exportContext(host),
      breakdownSummary: host.getBreakdownSummaryCards(),
      breakdownGroups: this.mapBreakdownGroups(host.getBreakdownGroups()),
    });
  }

  async refreshTitles(host: ExportShareFlowHost): Promise<void> {
    try {
      host.setLoadingTitlesOverall(true);
      const result = await this.titleService.refreshTitles();
      console.log(`[Titles] Refresh complete. Found ${result.totalTitles} total titles.`);
      host.clearPlayerTitlesCache();
      if (host.getActiveTab() === 'titles' && host.getSelectedPlayers().length > 0) {
        host.markTitlesLoadingForPlayers();
        await host.onTabChange('titles');
      }
      host.detectChanges();
    } catch (error) {
      console.error('[Titles] Error refreshing titles:', error);
    } finally {
      host.setLoadingTitlesOverall(false);
      host.detectChanges();
    }
  }

  async shareDailyView(host: ExportShareFlowHost): Promise<void> {
    const players = host.getSelectedPlayers();
    if (!players.length) return;
    const state = this.shareService.buildDailyShareState(
      players,
      host.getSelectedDate() as string
    );
    const link = this.shareService.buildLink(state);
    try {
      await copyTextToClipboard(link);
      alert('Share link copied to clipboard!');
    } catch {
      prompt('Copy link', link);
    }
  }

  async copyDataToClipboard(host: ExportShareFlowHost): Promise<void> {
    try {
      const snapshotData = {
        date: host.getSelectedDate(),
        players: host.getSelectedPlayers().map((player) => ({
          displayName: player.displayName,
          membershipId: player.membershipId,
          membershipType: player.membershipType,
          game: player.game,
          platform: player.platform,
        })),
        activities: host.getFilteredActivitiesForDate(),
        accountStats: host.getAccountStats(),
        activityBreakdown: host.getActivityBreakdownSnapshot(),
        timestamp: new Date().toISOString(),
      };
      await copyTextToClipboard(JSON.stringify(snapshotData, null, 2));
      alert('Data copied to clipboard!');
      console.log('[SHARE] Data successfully copied to clipboard');
    } catch (error) {
      console.error('Failed to copy data to clipboard:', error);
      alert('Failed to copy data to clipboard');
    }
  }

  async exportCurrentDate(host: ExportShareFlowHost): Promise<void> {
    try {
      const selectedDate = host.getSelectedDate();
      if (!selectedDate) {
        alert('No date selected');
        return;
      }
      const dateParts = selectedDate.split('-').map(Number);
      const fromDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
      const exportOptions = {
        from: fromDate,
        includeActivities: true,
        includeFirsts: true,
        includeTitles: true,
        includeSummary: true,
        includeBreakdown: true,
        showIconsInline: false,
      };
      await this.exportService.exportMultiSheet(exportOptions, {
        ...this.exportContext(host),
        breakdownSummary: host.getBreakdownSummaryCards(),
        breakdownGroups: this.mapBreakdownGroups(host.getBreakdownGroups()),
      });
      console.log('[SHARE] Current date exported successfully');
    } catch (error) {
      console.error('Failed to export current date:', error);
      alert('Failed to export data');
    }
  }

  async captureScreenshot(host: ExportShareFlowHost): Promise<void> {
    try {
      host.setShowShareDropdown(false);
      host.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await capturePageScreenshot(
        `destiny-chronicle-${host.getSelectedDate() || 'screenshot'}`
      );
      console.log('[SHARE] Screenshot captured successfully');
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      alert(
        'Failed to capture screenshot. Make sure you have a stable internet connection.'
      );
    }
  }
}
