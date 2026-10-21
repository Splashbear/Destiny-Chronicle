import { CommonModule } from '@angular/common';
import { AccountStatsComponent } from '../../components/account-stats/account-stats.component';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnniversaryCelebrationBannerComponent } from '../../components/anniversary-celebration-banner/anniversary-celebration-banner.component';
import { TextViewService } from '../../services/text-view.service';
import { textDaySections, textViewShouldBuild } from '../../utils/text-tab-rows';
import { ActivityStore } from '../../core/state/activity.store';
import { CoverageChipComponent } from '../../shared/ui/coverage-chip.component';
import { LoadEngramComponent } from '../../shared/ui/load-engram.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ACTIVITIES_HOST } from './activities-host.token';

interface TextDaySection {
  year: string;
  game: 'D1' | 'D2';
  rows: any[];
}

@Component({
  selector: 'app-activities-tab',
  standalone: true,
  imports: [
    CommonModule,
    AccountStatsComponent,
    CoverageChipComponent,
    LoadEngramComponent,
    EmptyStateComponent,
    AnniversaryCelebrationBannerComponent,
  ],
  templateUrl: './activities-tab.component.html',
  styleUrls: ['../../components/player-search/player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class ActivitiesTabComponent {
  /** Host is PlayerSearchComponent today (CODE_CLEANUP_SPEC Step 4). */
  readonly ps = inject(ACTIVITIES_HOST);
  readonly text = inject(TextViewService);
  /** Text Account Summary reads the same store as glass Summary (CODE_CLEANUP_SPEC Step 6). */
  readonly activityStore = inject(ActivityStore);
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
      this.textSig = '';
      this.textCache = null;
    }
    const empty = { sections: [], total: 0, shown: 0 };
    if (!textViewShouldBuild(!!this.ps.loadingActivities[this.ps.selectedDate], this.ps.profileLoadInProgress)) {
      return this.textCache ?? empty;
    }
    const sig = `${this.ps.selectedDate}|${this.displayedRowSig()}`;
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
    const paged = textDaySections(built);
    const sections: TextDaySection[] = paged.sections.map((section: { title: string; rows: any[] }) => {
      const [year, game] = section.title.split('|');
      return { year, game: game as 'D1' | 'D2', rows: section.rows };
    });
    this.textSig = sig;
    this.textCache = { sections, total: paged.total, shown: paged.shown };
    return this.textCache;
  }

  /** Changes when any account's rows change, so a list built before the last account arrived cannot stick. */
  private displayedRowSig(): string {
    const parts: string[] = [];
    for (const game of ['D2', 'D1'] as const) {
      for (const group of this.ps.getDisplayedAccountGroupsForGame(game)) {
        for (const yearGroup of group.yearGroups ?? []) {
          for (const typeGroup of yearGroup.typeGroups ?? []) {
            for (const activity of typeGroup.activities ?? []) {
              parts.push(String(activity?.membershipId ?? ''));
            }
          }
        }
      }
    }
    return `${parts.length}|${parts.join(',')}`;
  }
}
