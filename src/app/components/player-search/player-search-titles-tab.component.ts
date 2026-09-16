import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { PlayerSearchComponent } from './player-search.component';
import { SealPosterStudioComponent } from '../seal-poster-studio/seal-poster-studio.component';

@Component({
  selector: 'app-player-search-titles-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DestinyLoaderComponent, SealPosterStudioComponent],
  templateUrl: './player-search-titles-tab.component.html',
  styleUrls: ['./player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class PlayerSearchTitlesTabComponent {
  readonly ps = inject(PlayerSearchComponent);
  showPosterStudio = false;

  openPosterStudio() {
    this.showPosterStudio = true;
  }

  closePosterStudio() {
    this.showPosterStudio = false;
  }
}
