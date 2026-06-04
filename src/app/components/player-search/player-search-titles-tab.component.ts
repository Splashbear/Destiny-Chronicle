import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, inject } from '@angular/core';
import { PlayerSearchComponent } from './player-search.component';

@Component({
  selector: 'app-player-search-titles-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './player-search-titles-tab.component.html',
})
export class PlayerSearchTitlesTabComponent {
  readonly ps = inject(PlayerSearchComponent, { host: true });
}
