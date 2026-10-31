import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../../components/destiny-loader/destiny-loader.component';
import { SealPosterStudioComponent } from '../../components/seal-poster-studio/seal-poster-studio.component';
import { TextViewService } from '../../services/text-view.service';
import { pageSections, splitTitles } from '../../utils/text-tab-rows';
import { TITLES_HOST } from './titles-host.token';

@Component({
  selector: 'app-titles-tab',
  standalone: true,
  imports: [CommonModule, DestinyLoaderComponent, SealPosterStudioComponent],
  templateUrl: './titles-tab.component.html',
  styleUrls: ['../../components/player-search/player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class TitlesTabComponent {
  /** Host is PlayerSearchComponent today; TitlesStore later (CODE_CLEANUP_SPEC Step 4). */
  readonly ps = inject(TITLES_HOST);
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
      { title: `Owned (${split.owned.length} of ${total})`, rows: split.owned.map((title: any) => ({ name: title.name, owned: true })) },
      { title: `Missing (${split.missing.length} of ${total})`, rows: split.missing.map((title: any) => ({ name: title.name, owned: false })) },
    ];
    return pageSections(sections, this.pageSize, this.textPages);
  }
}
