import { Injectable } from '@angular/core';

const STORAGE_KEY = 'destiny-chronicle-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  get isLight(): boolean {
    return false;
  }

  constructor() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // Force dark mode: remove any light-theme classes/attributes that may exist
      try {
        document.documentElement.classList.remove('light');
        document.documentElement.removeAttribute('data-theme');
        if (document.body) {
          document.body.classList.remove('light-theme');
        }
      } catch {
        // no-op
      }
    }
  }

  toggle(): void {
    // Dark mode only – no-op to keep API stable
  }

  setLight(value: boolean): void {
    // Dark mode only – no-op to keep API stable
    void value;
  }
}
