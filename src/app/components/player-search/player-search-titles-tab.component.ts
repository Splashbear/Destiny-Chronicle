import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { PlayerSearchComponent } from './player-search.component';
import { SealPosterStudioComponent } from '../seal-poster-studio/seal-poster-studio.component';
import { groupTitlesByCategory, TitleCategoryGroup } from '../../config/title-categories';

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

  get showCategoryGroups(): boolean {
    return this.ps.titleSort === 'category';
  }

  get earnedGroups(): TitleCategoryGroup<any>[] {
    return groupTitlesByCategory(this.ps.unlockedTitlesDisplay);
  }

  get lockedGroups(): TitleCategoryGroup<any>[] {
    return groupTitlesByCategory(this.ps.lockedTitlesDisplay);
  }

  openPosterStudio() {
    this.showPosterStudio = true;
  }

  closePosterStudio() {
    this.showPosterStudio = false;
  }
}
