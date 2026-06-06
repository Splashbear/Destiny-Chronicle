import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { BaseChartDirective } from 'ng2-charts';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { PlayerSearchComponent } from './player-search.component';

@Component({
  selector: 'app-player-search-breakdown-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, AccountCardGridComponent, BaseChartDirective, DestinyLoaderComponent],
  templateUrl: './player-search-breakdown-tab.component.html',
  styleUrls: ['./player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class PlayerSearchBreakdownTabComponent {
  readonly ps = inject(PlayerSearchComponent);
}
