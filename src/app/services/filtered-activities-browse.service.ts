import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ActivityWithMembership } from '../models/activity-with-membership.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { ProfileLoadPhase } from './profile-character-loader.service';

/** Account status snapshot for browse-complete marking. */
export interface BrowseAccountStatus {
  status: ProfileLoadPhase | string;
  displayName: string;
  platform: string;
  game: 'D1' | 'D2';
  membershipType: number;
}

/**
 * Host UI / session callbacks for the date browse pipeline.
 * PlayerSearchComponent implements this; the service owns phase/timing orchestration.
 */
export interface FilteredActivitiesBrowseHost {
  beginLoadToken(markAccountsComplete: boolean): number;
  getCurrentLoadToken(): number;
  getSelectedPlayers(): PlayerSearchDisplay[];
  getSelectedDate(): string;
  getPlayerKey(player: { membershipId: string; game?: 'D1' | 'D2' }): string;
  isD1Player(player: PlayerSearchDisplay): boolean;
  getPlatformName(membershipType: number | undefined): string;
  updateAccountLoadingStatus(
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    status: ProfileLoadPhase,
    message: string
  ): void;
  getAccountLoadingStatus(accountKey: string): BrowseAccountStatus | undefined;
  updateLoadingProgress(
    phase: 'fetch' | 'pgcr' | 'process' | 'render',
    current: number,
    total: number,
    message: string
  ): void;
  clearLoadingProgress(): void;
  detectChanges(): void;
  fetchFilteredActivities(forceRefresh: boolean): Promise<ActivityWithMembership[]>;
  buildReportCountMessage(activities: ActivityWithMembership[]): string;
  getReportSummaryLine(activities: ActivityWithMembership[]): string;
  enrichActivitiesWithCharacterClass(activities: ActivityWithMembership[]): Promise<void>;
  setFilteredActivitiesForDate(activities: ActivityWithMembership[]): void;
  /** Length after setFilteredActivitiesForDate (used for RAF slice count). */
  getFilteredActivitiesForDateLength(): number;
  scheduleBatchedUpdate(): void;
  ensureManifestLoaded(): Promise<void>;
  processAndGroupActivities(message?: string): void | Promise<void>;
  startBackgroundProcessing(activities: ActivityWithMembership[]): void;
  updateActivityDisplay(): void;
  setDateActivityLoading(loading: boolean): void;
  checkAndShowAnniversaryBanner(): void;
}

/**
 * Browse-ready date load: fetch → progress → process → sliced render (CODE_CLEANUP_SPEC).
 * Extracted from PlayerSearchComponent.loadAllFilteredActivities — behavior identical.
 */
@Injectable({ providedIn: 'root' })
export class FilteredActivitiesBrowseService {
  async loadAllFilteredActivities(
    host: FilteredActivitiesBrowseHost,
    forceRefresh = false,
    markAccountsComplete = true
  ): Promise<void> {
    // W26: Incremental mid-sync refreshes (markAccountsComplete=false) must NOT bump
    // currentLoadToken. Favorites load captures the token and aborts queued accounts when
    // it changes — that was cancelling D1 + later D2 profiles after the first 1–2 finished.
    // Final / user-facing loads still mint a new token so stale renders abort correctly.
    const loadToken = host.beginLoadToken(markAccountsComplete);
    const playerNames = (host.getSelectedPlayers() || []).map(p => p.displayName).join(', ');
    if (environment.debug) {
      console.log('[Load] Start', { forceRefresh, markAccountsComplete, players: playerNames });
    }

    if (markAccountsComplete) {
      host.getSelectedPlayers().forEach(player => {
        const accountKey = host.getPlayerKey(player);
        const isD1 = host.isD1Player(player);
        const game = isD1 ? 'D1' : 'D2';
        const platform = host.getPlatformName(player.membershipType);
        host.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'displaying-activities',
          `Displaying ${game} activities for ${player.displayName}...`
        );
      });
    }

    host.updateLoadingProgress('fetch', 0, 1, 'Loading activities for selected date…');

    try {
      const activities = await host.fetchFilteredActivities(forceRefresh);
      if (environment.debug) {
        console.log('[Load] Fetch done', { activityCount: activities?.length ?? 0 });
      }
      if (loadToken !== host.getCurrentLoadToken()) {
        host.clearLoadingProgress();
        host.detectChanges();
        return;
      }

      const reportCountMessage = host.buildReportCountMessage(activities);
      host.updateLoadingProgress('fetch', 1, 1, reportCountMessage);
      await new Promise(r => setTimeout(r, 800));
      if (loadToken !== host.getCurrentLoadToken()) {
        host.clearLoadingProgress();
        host.detectChanges();
        return;
      }

      const totalReports = activities.length;
      const reportSummary = host.getReportSummaryLine(activities);
      const organizeMessage =
        totalReports === 0
          ? 'No reports for selected date. Organizing and displaying….'
          : `Total number of reports for ${reportSummary} is ${totalReports}. Organizing and displaying….`;
      host.updateLoadingProgress('pgcr', 0, 1, organizeMessage);
      // Class-icon PGCR enrich is best-effort and MUST NOT block browse-ready / overlay clear.
      void host.enrichActivitiesWithCharacterClass(activities).then(() => {
        if (environment.debug) {
          console.log('[Load] PGCR enrich done (background)');
        }
        host.detectChanges();
      }).catch(() => { /* non-fatal */ });
      if (loadToken !== host.getCurrentLoadToken()) {
        host.clearLoadingProgress();
        host.detectChanges();
        return;
      }
      host.updateLoadingProgress('process', 0, 1, organizeMessage);

      host.setFilteredActivitiesForDate(activities);
      if (activities.length > 0) {
        host.scheduleBatchedUpdate();
      }

      await host.ensureManifestLoaded();

      // PROCESS phase — fire-and-forget like the component (do not await; keeps UI responsive).
      if (environment.debug) {
        console.log('[Load] Process start');
      }
      host.processAndGroupActivities(organizeMessage);
      if (environment.debug) {
        console.log('[Load] Process done');
      }

      host.startBackgroundProcessing(activities);

      // ---------- RENDER PHASE ----------
      // Slice + rAF so weaker machines can paint between batches (do not tighten).
      const sliceSize = 250;
      const totalSlices = Math.max(1, Math.ceil(host.getFilteredActivitiesForDateLength() / sliceSize));
      if (environment.debug) {
        console.log('[Load] Render start', { totalSlices });
      }
      for (let i = 0; i < totalSlices; i++) {
        if (loadToken !== host.getCurrentLoadToken()) return; // Abort if newer load started

        host.updateActivityDisplay();

        host.updateLoadingProgress(
          'render',
          i + 1,
          totalSlices,
          totalReports === 0
            ? `Organizing and displaying… (${Math.round(((i + 1) / totalSlices) * 100)}%)`
            : `Total ${totalReports} reports. Organizing and displaying… (${Math.round(((i + 1) / totalSlices) * 100)}%)`
        );

        await new Promise(requestAnimationFrame);
      }

      if (loadToken === host.getCurrentLoadToken()) {
        const doneMessage =
          totalReports === 0
            ? 'No reports for selected date. Organizing and displaying…. Done!'
            : `Total number of reports for ${reportSummary} is ${totalReports}. Organizing and displaying…. Done!`;
        host.updateLoadingProgress('render', totalSlices, totalSlices, doneMessage);
        host.detectChanges();
        if (environment.debug) {
          console.log('[Load] Complete');
        }
        setTimeout(() => {
          host.clearLoadingProgress();
          host.detectChanges();
        }, 1200);
      }
    } catch (error) {
      if (environment.debug) {
        console.warn('[Load] Error', error);
      }
      if (loadToken === host.getCurrentLoadToken()) {
        host.clearLoadingProgress();
        host.detectChanges();
      }
    } finally {
      if (loadToken === host.getCurrentLoadToken()) {
        host.setDateActivityLoading(false);
        console.log('[🎯 CALLING] checkAndShowAnniversaryBanner from loadAllFilteredActivities');
        host.checkAndShowAnniversaryBanner();

        if (markAccountsComplete) {
          this.markAccountsComplete(host);
        }

        host.detectChanges();
      }
    }
  }

  private markAccountsComplete(host: FilteredActivitiesBrowseHost): void {
    host.getSelectedPlayers().forEach(player => {
      const accountKey = host.getPlayerKey(player);
      const isD1 = host.isD1Player(player);
      const game = isD1 ? 'D1' : 'D2';
      const platform = host.getPlatformName(player.membershipType);
      const existing = host.getAccountLoadingStatus(accountKey);

      if (existing?.status === 'error') {
        return;
      }
      if (existing?.status === 'fetching-profile' || existing?.status === 'loading-characters') {
        host.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'error',
          `Skipped or failed to load ${game} profile for ${player.displayName}`
        );
        return;
      }

      host.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        game,
        player.membershipType,
        'complete',
        `${game} data loaded and displayed successfully for ${player.displayName}`
      );
    });
  }
}
