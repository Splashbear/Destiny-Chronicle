import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlayerSearchComponent } from './components/player-search/player-search.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PlayerSearchComponent],
  template: `
    <router-outlet></router-outlet>
  `,
  styles: []
})
export class AppComponent {
  title = 'destiny-chronicle';
}
