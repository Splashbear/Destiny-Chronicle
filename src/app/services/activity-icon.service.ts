import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ActivityIconService {
  private readonly ACCENT_COLORS: Record<string, string> = {
    raid: '#f59e0b',
    strike: '#10b981',
    crucible: '#ef4444',
    gambit: '#22c55e',
    dungeon: '#8b5cf6',
    nightfall: '#f97316',
    story: '#60a5fa',
    patrol: '#c8d8e8',
    'public-event': '#eab308',
    'lost-sector': '#a855f7',
    seasonal: '#14b8a6',
    'exotic-mission': '#f472b6',
    'sparrow-racing-league': '#06b6d4',
    other: '#f5c542',
  };

  /** Original Bungie-style game badge (tricorn, with "2" on D2). */
  getGameIconPath(game: 'D1' | 'D2' | string): string {
    return game === 'D1'
      ? 'assets/icons/destiny/Destiny 1 icon.jpg'
      : 'assets/icons/destiny/Destiny 2 icon.png';
  }

  getActivityTypeAccent(type: string): string {
    const key = type.toLowerCase().replace(/\s+/g, '-');
    return this.ACCENT_COLORS[key] ?? this.ACCENT_COLORS['other'];
  }
}
