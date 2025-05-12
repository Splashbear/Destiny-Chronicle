import { Component } from '@angular/core';
import { PlayerSearchComponent } from './components/player-search/player-search.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PlayerSearchComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'destiny-chronicle';
}
