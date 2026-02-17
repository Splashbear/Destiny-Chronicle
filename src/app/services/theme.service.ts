import { Injectable } from '@angular/core';

const STORAGE_KEY = 'destiny-chronicle-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _isLight = false;

  get isLight(): boolean {
    return this._isLight;
  }

  constructor() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light') {
        this._isLight = true;
        document.documentElement.classList.add('light');
      } else if (stored === 'dark') {
        this._isLight = false;
        document.documentElement.classList.remove('light');
      }
    }
  }

  toggle(): void {
    this._isLight = !this._isLight;
    this.apply();
    localStorage.setItem(STORAGE_KEY, this._isLight ? 'light' : 'dark');
  }

  setLight(value: boolean): void {
    this._isLight = value;
    this.apply();
    localStorage.setItem(STORAGE_KEY, value ? 'light' : 'dark');
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    if (this._isLight) {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }
}
