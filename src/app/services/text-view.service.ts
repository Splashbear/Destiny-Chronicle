import { Injectable } from '@angular/core';

const STORAGE_KEY = 'dc-text-view';

/** Header switch for the text-only On this Day layout. Default is the full site. */
@Injectable({ providedIn: 'root' })
export class TextViewService {
  enabled = false;

  constructor() {
    const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const view = params.get('view');
    if (view === 'text') {
      this.enabled = true;
    } else if (view === 'full') {
      this.enabled = false;
    } else {
      try {
        this.enabled = localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        this.enabled = false;
      }
    }
    this.persist();
    if (this.enabled) {
      this.writeQuery(true);
    }
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.persist();
    this.writeQuery(on);
  }

  /** Keep ?view=text when other code rewrites the query string. */
  queryParams(): { view?: string } {
    return this.enabled ? { view: 'text' } : {};
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? '1' : '0');
    } catch {
      // Private browsing can block storage; the query param still shares the choice.
    }
  }

  private writeQuery(on: boolean): void {
    if (typeof location === 'undefined' || typeof history === 'undefined') {
      return;
    }
    const url = new URL(location.href);
    if (on) {
      url.searchParams.set('view', 'text');
    } else {
      url.searchParams.delete('view');
    }
    const next = url.pathname + url.search + url.hash;
    const current = location.pathname + location.search + location.hash;
    if (next !== current) {
      history.replaceState(history.state, '', next);
    }
  }
}
