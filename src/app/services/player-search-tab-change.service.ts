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
    // MOBILE_SPEC bug 3: keep tab bar in view; don't jump to bottom of heatmap.
    this.stabilizeTabScroll();
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
    // Heatmap mounts async content — re-stabilize after paint.
    if (tab === 'heatmap' && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.stabilizeTabScroll());
    }
  }

  private stabilizeTabScroll(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const nav = document.querySelector(
      '.destiny-tab-nav[data-dc-engram-target="tabs"]'
    ) as HTMLElement | null;
    if (!nav) {
      return;
    }
    nav.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
    const active = nav.querySelector(
      '.main-tab[aria-selected="true"]'
    ) as HTMLElement | null;
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'instant' as ScrollBehavior,
      });
    }
    const panel = document.getElementById('dc-tab-panel-top');
    panel?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant' as ScrollBehavior,
    });
  }
}
