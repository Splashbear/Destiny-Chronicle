import { Routes } from '@angular/router';
import { PlayerSearchComponent } from './components/player-search/player-search.component';

export const routes: Routes = [
  { path: '', component: PlayerSearchComponent },
  { path: 'date/:date', component: PlayerSearchComponent },
  { path: 'date/:date/players/:players', component: PlayerSearchComponent },
  { path: 'share', component: PlayerSearchComponent }
];
