import { Component } from '@angular/core';
import { PlayerSearchComponent } from './components/player-search/player-search.component';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { DestinyManifestService } from './services/destiny-manifest.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, PlayerSearchComponent, MatDialogModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Destiny Chronicle';

  constructor(private manifestService: DestinyManifestService) {
    // Expose the manifest service globally for debugging
    (window as any).manifestService = this.manifestService;
  }
}
