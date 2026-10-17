import { CommonModule } from '@angular/common';
import { AccountStatsComponent } from '../account-stats/account-stats.component';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlayerSearchComponent } from './player-search.component';
import { AnniversaryCelebrationBannerComponent } from '../anniversary-celebration-banner/anniversary-celebration-banner.component';
import { TextViewService } from '../../services/text-view.service';
import { pageSections, textViewShouldBuild } from '../../utils/text-tab-rows';

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
  private textSig = '';
  private textCache: { sections: TextDaySection[]; total: number; shown: number } | null = null;

  /**
   * Same activities as the full On this Day panels, windowed so long lists stay small.
   * Cached, and skipped while a profile load is in progress, so naming every row
   * cannot block the other accounts from loading.
   */
  textDay(): { sections: TextDaySection[]; total: number; shown: number } {
    if (this.textDate !== this.ps.selectedDate) {
      this.textDate = this.ps.selectedDate;
      this.textPages = 1;
      this.textSig = '';
      this.textCache = null;
    }
    const empty = { sections: [], total: 0, shown: 0 };
    if (!textViewShouldBuild(!!this.ps.loadingActivities[this.ps.selectedDate], this.ps.profileLoadInProgress)) {
      return this.textCache ?? empty;
    }
    const list = this.ps.filteredActivitiesForDate || [];
    const tail = list.length ? String(list[list.length - 1]?.activityDetails?.instanceId ?? '') : '';
    const sig = `${this.ps.selectedDate}|${this.textPages}|${list.length}|${tail}`;
    if (this.textCache && sig === this.textSig) {
      return this.textCache;
    }
    const built: Array<{ title: string; rows: any[] }> = [];
    for (const game of ['D2', 'D1'] as const) {
      for (const group of this.ps.getDisplayedAccountGroupsForGame(game)) {
        for (const yearGroup of group.yearGroups ?? []) {
          const rows = this.ps.getChronologicalRowsForYear(yearGroup, game);
          if (rows.length) {
            built.push({
              title: `${yearGroup.year}|${game}`,
              rows,
            });
          }
        }
      }
    }
    const paged = pageSections(built, this.pageSize, this.textPages);
    const sections: TextDaySection[] = paged.sections.map(section => {
      const [year, game] = section.title.split('|');
      return { year, game: game as 'D1' | 'D2', rows: section.rows };
    });
    this.textSig = sig;
    this.textCache = { sections, total: paged.total, shown: paged.shown };
    return this.textCache;
  }

  showMoreTextRows(): void {
    this.textPages += 1;
  }
}
