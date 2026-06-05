import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountCardGridComponent } from '../account-card-grid/account-card-grid.component';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlayerSearchComponent } from './player-search.component';

@Component({
  selector: 'app-player-search-firsts-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, AccountCardGridComponent],
  templateUrl: './player-search-firsts-tab.component.html',
  styleUrls: ['./player-search-tab-shared.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class PlayerSearchFirstsTabComponent {
  readonly ps = inject(PlayerSearchComponent);
}
