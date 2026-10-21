import { Injectable } from '@angular/core';
import { SiteAnalyticsService } from './site-analytics.service';

export type PlayerSearchTab =
  | 'activities'
  | 'firsts'
  | 'titles'
  | 'accomplishments'
  | 'breakdown'
  | 'heatmap'
  | 'playedWith';

/** Host for tab-change side effects (CODE_CLEANUP_SPEC). */
export interface PlayerSearchTabChangeHost {
  setActiveTab(tab: PlayerSearchTab): void;
  detectChanges(): void;
  markForCheck(): void;
  getSelectedPlayersLength(): number;
  syncActiveFirstsGameWithPlayers(): void;
  updatePlatformTabs(): void;
  syncActiveAccomplishmentsGameWithPlayers(): void;
  loadActivityBreakdown(): Promise<void>;
  ensureTitlesLoadedForTab(): Promise<void>;
}

/**
 * Tab switch analytics + lazy loads (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class PlayerSearchTabChangeService {
  constructor(private siteAnalytics: SiteAnalyticsService) {}

  async onTabChange(
    host: PlayerSearchTabChangeHost,
    tab: PlayerSearchTab
  ): Promise<void> {
    host.setActiveTab(tab);
    host.detectChanges();
    if (
      tab === 'heatmap' ||
      tab === 'breakdown' ||
      tab === 'titles' ||
      tab === 'firsts' ||
      tab === 'activities' ||
      tab === 'accomplishments'
    ) {
      this.siteAnalytics.trackFeatureView(
        tab === 'accomplishments' ? 'accomplishments' : tab
      );
    } else if (tab === 'playedWith') {
      this.siteAnalytics.trackFeatureView('played_with');
    }
    if (tab === 'heatmap') {
      host.markForCheck();
    }
    if (tab === 'firsts' && host.getSelectedPlayersLength() > 0) {
      host.syncActiveFirstsGameWithPlayers();
      host.updatePlatformTabs();
    }
    if (tab === 'accomplishments' && host.getSelectedPlayersLength() > 0) {
      host.syncActiveAccomplishmentsGameWithPlayers();
    }
    if (tab === 'breakdown' && host.getSelectedPlayersLength() > 0) {
      await host.loadActivityBreakdown();
    }
    if (tab === 'titles' && host.getSelectedPlayersLength() > 0) {
      await host.ensureTitlesLoadedForTab();
    }
  }
}
