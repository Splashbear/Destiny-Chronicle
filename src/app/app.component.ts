import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlayerSearchComponent } from './components/player-search/player-search.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PlayerSearchComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'destiny-chronicle';
}
