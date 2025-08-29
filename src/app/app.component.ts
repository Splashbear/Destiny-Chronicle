import { Component } from '@angular/core';
import { PlayerSearchComponent } from './components/player-search/player-search.component';
import { PerformanceMonitorComponent } from './components/performance-monitor/performance-monitor.component';
import { BrowserCompatibilityWarningComponent } from './components/browser-compatibility-warning/browser-compatibility-warning.component';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { DestinyManifestService } from './services/destiny-manifest.service';
import { ShareService } from './services/share.service';
import { SharedStateService } from './services/shared-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, PlayerSearchComponent, PerformanceMonitorComponent, BrowserCompatibilityWarningComponent, MatDialogModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Destiny Chronicle';

  constructor(
    private manifestService: DestinyManifestService,
    private shareService: ShareService,
    private sharedState: SharedStateService
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
  }
}
