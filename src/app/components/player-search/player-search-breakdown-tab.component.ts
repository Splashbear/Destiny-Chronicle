import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { BaseChartDirective } from 'ng2-charts';
import { ChangeDetectionStrategy, Component, Directive, inject, Input, OnInit } from '@angular/core';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { PlayerSearchComponent } from './player-search.component';
import { environment } from '../../../environments/environment';
import { breakdownCreateCounts, breakdownCreatesInLastSecond, noteBreakdownCreate } from '../../utils/breakdown-view';

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
  selector: 'app-player-search-breakdown-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, AccountCardGridComponent, BaseChartDirective, DestinyLoaderComponent, BreakdownCreateProbe],
  templateUrl: './player-search-breakdown-tab.component.html',
  styleUrls: ['./player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class PlayerSearchBreakdownTabComponent {
  readonly ps = inject(PlayerSearchComponent);
}
