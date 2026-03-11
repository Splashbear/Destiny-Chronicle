import { Routes } from '@angular/router';
import { PlayerSearchComponent } from './components/player-search/player-search.component';
import { SeoLandingComponent } from './components/seo-landing/seo-landing.component';

export const routes: Routes = [
  { path: '', component: PlayerSearchComponent },
  // SEO-focused marketing/landing page that explains Destiny activity history
  { path: 'destiny-2-activity-history', component: SeoLandingComponent },
  { path: 'date/:date', component: PlayerSearchComponent },
  { path: 'date/:date/players/:players', component: PlayerSearchComponent },
  { path: 'share', component: PlayerSearchComponent }
];
