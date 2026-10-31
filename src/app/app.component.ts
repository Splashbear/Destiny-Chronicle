import { Component, effect, inject } from '@angular/core';
import { TextViewService } from './services/text-view.service';
import { PlayerSearchComponent } from './components/player-search/player-search.component';
import { PerformanceMonitorComponent } from './components/performance-monitor/performance-monitor.component';
import { BrowserCompatibilityWarningComponent } from './components/browser-compatibility-warning/browser-compatibility-warning.component';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { DestinyManifestService } from './services/destiny-manifest.service';
import { ShareService } from './services/share.service';
import { SharedStateService } from './services/shared-state.service';
import { ThemeService } from './services/theme.service';
import { SiteAnalyticsService } from './services/site-analytics.service';
import { DecryptLandingService } from './services/decrypt-landing.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, PlayerSearchComponent, PerformanceMonitorComponent, BrowserCompatibilityWarningComponent, MatDialogModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Destiny Chronicle';
  readonly textView = inject(TextViewService);
  readonly decryptLanding = inject(DecryptLandingService);

  constructor(
    public theme: ThemeService,
    private manifestService: DestinyManifestService,
    private shareService: ShareService,
    private sharedState: SharedStateService,
    _siteAnalytics: SiteAnalyticsService  // Injects to initialize GA4 + Cloudflare (production only)
  ) {
    // Expose manifest service globally for debugging
    (window as any).manifestService = this.manifestService;

    // Check URL hash for share link
    const hash = location.hash;
    if (hash.startsWith('#share=')) {
      const encoded = hash.slice(7);
      const state = this.shareService.parseHash(encoded);
      if (state) {
        this.sharedState.pendingShare = state;
      }
    }

    // Hard-light dossier + text-view mute (ENGRAM_THEME_SPEC)
    effect(() => {
      const hard = this.decryptLanding.hardlightEnabled();
      const text = this.textView.enabled();
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      root.classList.toggle('dc-hardlight', hard);
      root.classList.toggle('dc-text-view', text);
    });
  }
}
