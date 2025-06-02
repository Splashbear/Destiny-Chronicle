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
      raid: 'assets/icons/activities/d1/raid.png',
      strike: 'assets/icons/activities/d1/strike.png',
      crucible: 'assets/icons/activities/d1/crucible.png',
      nightfall: 'assets/icons/activities/d1/nightfall.png',
      story: 'assets/icons/activities/d1/story.png',
      patrol: 'assets/icons/activities/d1/patrol.png',
      'public-event': 'assets/icons/activities/d1/public-event.png',
    } as Record<string, string>,
    d2: {
      raid: 'assets/icons/activities/d2/raid.png',
      strike: 'assets/icons/activities/d2/strike.png',
      crucible: 'assets/icons/activities/d2/crucible.png',
      nightfall: 'assets/icons/activities/d2/nightfall.png',
      dungeon: 'assets/icons/activities/d2/dungeon.png',
      gambit: 'assets/icons/activities/d2/gambit.png',
      story: 'assets/icons/activities/d2/story.png',
      patrol: 'assets/icons/activities/d2/patrol.png',
      'public-event': 'assets/icons/activities/d2/public-event.png',
      'lost-sector': 'assets/icons/activities/d2/lost-sector.png',
    } as Record<string, string>,
    default: 'assets/icons/activities/ghost.png'
  };

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  getActivityIconPath(type: string, isD1: boolean): string {
    // Normalize D1 story/arena/PoE types to 'story' for icon mapping
    let normalizedType = type.toLowerCase().replace(/\s+/g, '-');
    if (isD1 && (normalizedType === 'arena' || normalizedType === 'prison-of-elders')) {
      normalizedType = 'story'; // Use the story icon for all PoE/arena/story types in D1
    }
    const game = isD1 ? 'd1' : 'd2';
    const pngPath = `assets/icons/activities/${game}/${normalizedType}.png`;
    // Check if PNG exists (if iconFileExists is available in window)
    if ((window as any).iconFileExists?.(pngPath)) {
      return pngPath;
    }
    // Fallback to ghost icon
    return this.ICON_PATHS.default;
  }
} 