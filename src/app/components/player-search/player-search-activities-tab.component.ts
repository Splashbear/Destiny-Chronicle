import { CommonModule } from '@angular/common';
import { AccountStatsComponent } from '../account-stats/account-stats.component';
import { Component, inject } from '@angular/core';
import { PlayerSearchComponent } from './player-search.component';

@Component({
  selector: 'app-player-search-activities-tab',
  standalone: true,
  imports: [CommonModule, AccountStatsComponent],
  templateUrl: './player-search-activities-tab.component.html',
})
export class PlayerSearchActivitiesTabComponent {
  readonly ps = inject(PlayerSearchComponent, { host: true });
}
