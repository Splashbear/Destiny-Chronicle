import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, map } from 'rxjs';

export type ActivityIconType = 
  | 'raid-d1' | 'raid-d2'
  | 'dungeon'
  | 'strike'
  | 'nightfall'
  | 'crucible'
  | 'gambit'
  | 'story'
  | 'patrol'
  | 'public-event'
  | 'lost-sector'
  | 'seasonal'
  | 'exotic-mission'
  | 'other';

@Injectable({
  providedIn: 'root'
})
export class ActivityIconService {
  private readonly ICON_PATHS = {
    d1: {
      raid: 'assets/icons/activities/d1/raid.svg',
      strike: 'assets/icons/activities/d1/strike.svg',
      crucible: 'assets/icons/activities/d1/crucible.svg',
      nightfall: 'assets/icons/activities/d1/nightfall.svg',
      dungeon: 'assets/icons/activities/d1/dungeon.svg',
      gambit: 'assets/icons/activities/d1/gambit.svg',
      story: 'assets/icons/activities/d1/story.svg',
      patrol: 'assets/icons/activities/d1/patrol.svg',
      'public-event': 'assets/icons/activities/d1/public-event.svg',
      'lost-sector': 'assets/icons/activities/d1/lost-sector.svg',
      seasonal: 'assets/icons/activities/d1/seasonal.svg',
      'seasonal-event': 'assets/icons/activities/d1/seasonal-event.svg',
      'exotic-mission': 'assets/icons/activities/d1/exotic-mission.svg'
    } as Record<string, string>,
    d2: {
      raid: 'assets/icons/activities/d2/raid.svg',
      strike: 'assets/icons/activities/d2/strike.svg',
      crucible: 'assets/icons/activities/d2/crucible.svg',
      nightfall: 'assets/icons/activities/d2/nightfall.svg',
      dungeon: 'assets/icons/activities/d2/dungeon.svg',
      gambit: 'assets/icons/activities/d2/gambit.svg',
      story: 'assets/icons/activities/d2/story.svg',
      patrol: 'assets/icons/activities/d2/patrol.svg',
      'public-event': 'assets/icons/activities/d2/public-event.svg',
      'lost-sector': 'assets/icons/activities/d2/lost-sector.svg',
      seasonal: 'assets/icons/activities/d2/seasonal.svg',
      'seasonal-event': 'assets/icons/activities/d2/seasonal-event.svg',
      'exotic-mission': 'assets/icons/activities/d2/exotic-mission.svg'
    } as Record<string, string>,
    default: 'assets/icons/activities/ghost.svg'
  };

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  getActivityIconPath(type: string, isD1: boolean): string {
    const game = isD1 ? 'd1' : 'd2';
    const normalizedType = type.toLowerCase().replace(/\s+/g, '-');
    const iconPath = this.ICON_PATHS[game][normalizedType];
    return iconPath || this.ICON_PATHS.default;
  }

  getActivityIconSvg(type: string, isD1: boolean): Observable<SafeHtml> {
    const path = this.getActivityIconPath(type, isD1);
    return this.http.get(path, { responseType: 'text' }).pipe(
      map(svg => this.sanitizer.bypassSecurityTrustHtml(svg))
    );
  }
} 