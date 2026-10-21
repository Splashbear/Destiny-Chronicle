import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountCardGridComponent } from '../../components/account-card-grid/account-card-grid.component';
import { BaseChartDirective } from 'ng2-charts';
import { ChangeDetectionStrategy, Component, Directive, inject, Input, OnInit } from '@angular/core';
import { DestinyLoaderComponent } from '../../components/destiny-loader/destiny-loader.component';
import { environment } from '../../../environments/environment';
import { breakdownCreateCounts, breakdownCreatesInLastSecond, breakdownTextBars, noteBreakdownCreate } from '../../utils/breakdown-view';
import { TextViewService } from '../../services/text-view.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { BREAKDOWN_HOST } from './breakdown-host.token';

if (!environment.production && typeof window !== 'undefined') {
  (window as unknown as { __dcBreakdownCreates?: () => unknown }).__dcBreakdownCreates = () => ({
    rows: breakdownCreateCounts.rows,
    tiles: breakdownCreateCounts.tiles,
    perSecond: breakdownCreatesInLastSecond(),
  });
}

@Directive({
  selector: '[appBreakdownCreate]',
  standalone: true,
})
export class BreakdownCreateProbe implements OnInit {
  @Input() appBreakdownCreate: 'row' | 'tile' = 'row';

  ngOnInit(): void {
    if (!environment.production) {
      noteBreakdownCreate(this.appBreakdownCreate);
    }
  }
}

@Component({
  selector: 'app-breakdown-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, AccountCardGridComponent, BaseChartDirective, DestinyLoaderComponent, BreakdownCreateProbe, EmptyStateComponent],
  templateUrl: './breakdown-tab.component.html',
  styleUrls: ['../../components/player-search/player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class BreakdownTabComponent {
  /** Host is PlayerSearchComponent today (CODE_CLEANUP_SPEC Step 4). */
  readonly ps = inject(BREAKDOWN_HOST);
  readonly text = inject(TextViewService);

  textBars() {
    return breakdownTextBars(this.ps.activityBreakdownSummaryCards || []);
  }
}
