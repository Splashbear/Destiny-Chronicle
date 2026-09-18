import { CommonModule } from '@angular/common';
import { AccountStatsComponent } from '../account-stats/account-stats.component';
import { DestinyLoaderComponent } from '../destiny-loader/destiny-loader.component';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlayerSearchComponent } from './player-search.component';
import { AnniversaryCelebrationBannerComponent } from '../anniversary-celebration-banner/anniversary-celebration-banner.component';

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
}
