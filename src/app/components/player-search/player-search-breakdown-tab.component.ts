import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { BaseChartDirective } from 'ng2-charts';
import { Component, inject } from '@angular/core';
import { PlayerSearchComponent } from './player-search.component';

@Component({
  selector: 'app-player-search-breakdown-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, AccountCardGridComponent, BaseChartDirective],
  templateUrl: './player-search-breakdown-tab.component.html',
})
export class PlayerSearchBreakdownTabComponent {
  readonly ps = inject(PlayerSearchComponent, { host: true });
}
