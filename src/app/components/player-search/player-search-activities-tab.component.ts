import { CommonModule } from '@angular/common';
import { AccountStatsComponent } from '../account-stats/account-stats.component';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlayerSearchComponent } from './player-search.component';
import { AnniversaryCelebrationBannerComponent } from '../anniversary-celebration-banner/anniversary-celebration-banner.component';
import { TextViewService } from '../../services/text-view.service';
import { windowRows } from '../../utils/text-view-rows';

interface TextDaySection {
  year: string;
  game: 'D1' | 'D2';
  rows: any[];
}

@Component({
  selector: 'app-player-search-activities-tab',
  standalone: true,
  imports: [CommonModule, AccountStatsComponent, DestinyLoaderComponent, AnniversaryCelebrationBannerComponent],
  templateUrl: './player-search-activities-tab.component.html',
  styleUrls: ['./player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class PlayerSearchActivitiesTabComponent {
  readonly ps = inject(PlayerSearchComponent);
  readonly text = inject(TextViewService);
  readonly pageSize = 40;
  textPages = 1;
  private textDate = '';

  /** Same activities as the full On this Day panels, windowed so long lists stay small. */
  textDay(): { sections: TextDaySection[]; total: number; shown: number } {
    if (this.textDate !== this.ps.selectedDate) {
      this.textDate = this.ps.selectedDate;
      this.textPages = 1;
    }
    const flat: Array<{ year: string; game: 'D1' | 'D2'; row: any }> = [];
    for (const game of ['D2', 'D1'] as const) {
      for (const group of this.ps.getDisplayedAccountGroupsForGame(game)) {
        for (const yearGroup of group.yearGroups ?? []) {
          for (const row of this.ps.getChronologicalRowsForYear(yearGroup, game)) {
            flat.push({ year: String(yearGroup.year), game, row });
          }
        }
      }
    }
    const visible = windowRows(flat, this.pageSize, this.textPages);
    const sections: TextDaySection[] = [];
    for (const item of visible) {
      const last = sections[sections.length - 1];
      if (!last || last.year !== item.year || last.game !== item.game) {
        sections.push({ year: item.year, game: item.game, rows: [item.row] });
      } else {
        last.rows.push(item.row);
      }
    }
    return { sections, total: flat.length, shown: visible.length };
  }

  showMoreTextRows(): void {
    this.textPages += 1;
  }
}
