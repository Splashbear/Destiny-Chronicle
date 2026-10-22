import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { PlayerSearchComponent } from './player-search.component';
import { SealPosterStudioComponent } from '../seal-poster-studio/seal-poster-studio.component';
import { TextViewService } from '../../services/text-view.service';
import { pageSections, splitTitles } from '../../utils/text-tab-rows';

@Component({
  selector: 'app-player-search-titles-tab',
  standalone: true,
  imports: [CommonModule, DestinyLoaderComponent, SealPosterStudioComponent],
  templateUrl: './player-search-titles-tab.component.html',
  styleUrls: ['./player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class PlayerSearchTitlesTabComponent {
  readonly ps = inject(PlayerSearchComponent);
  readonly text = inject(TextViewService);
  readonly pageSize = 40;
  textPages = 1;

  showMoreTextRows(): void {
    this.textPages += 1;
  }

  textTitles(): { sections: Array<{ title: string; rows: { name: string; owned: boolean }[] }>; total: number; shown: number } {
    const split = splitTitles(this.ps.aggregatedTitles || []);
    const total = split.owned.length + split.missing.length;
    const sections: Array<{ title: string; rows: { name: string; owned: boolean }[] }> = [
      { title: `Owned (${split.owned.length} of ${total})`, rows: split.owned.map(title => ({ name: title.name, owned: true })) },
      { title: `Missing (${split.missing.length} of ${total})`, rows: split.missing.map(title => ({ name: title.name, owned: false })) },
    ];
    return pageSections(sections, this.pageSize, this.textPages);
  }
}
