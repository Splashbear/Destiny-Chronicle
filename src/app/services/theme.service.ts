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
        this.apply(true);
      } else if (stored === 'dark') {
        this._isLight = false;
        this.apply(false);
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
  }

  toggle(): void {
    this._isLight = !this._isLight;
    localStorage.setItem(STORAGE_KEY, this._isLight ? 'light' : 'dark');
    this.applyAsync();
  }

  setLight(value: boolean): void {
    this._isLight = value;
    localStorage.setItem(STORAGE_KEY, value ? 'light' : 'dark');
    this.applyAsync();
  }

  /** Applies theme to html and body. Runs in next tick so DOM updates are not reverted by Angular. */
  private applyAsync(): void {
    if (typeof window === 'undefined') return;
    const isLight = this._isLight;
    window.setTimeout(() => this.apply(isLight), 0);
  }

  /** Applies theme to both html and body so all CSS selectors (html.light and body.light-theme) take effect. */
  private apply(isLight?: boolean): void {
    if (typeof document === 'undefined') return;
    const useLight = isLight ?? this._isLight;
    const el = document.documentElement;
    const body = document.body;
    if (useLight) {
      el.classList.add('light');
      el.setAttribute('data-theme', 'light');
      body.classList.add('light-theme');
    } else {
      el.classList.remove('light');
      el.setAttribute('data-theme', 'dark');
      body.classList.remove('light-theme');
    }
  }
}
