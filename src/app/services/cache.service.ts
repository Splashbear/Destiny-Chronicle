import { Injectable, Inject } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class Cache<T> {
  private cache: Map<string, { data: T; expiry: number }> = new Map();

  constructor(
    @Inject('STORAGE_KEY') private readonly storageKey: string,
    @Inject('EXPIRY_TIME') private readonly expiryTime: number = 24 * 60 * 60 * 1000 // Default 24 hours
  ) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([key, value]: [string, any]) => {
          if (value.expiry > Date.now()) {
            this.cache.set(key, value);
          }
        });
      }
    } catch (error) {
      console.error(`Error loading cache from storage for ${this.storageKey}:`, error);
    }
  }

  private saveToStorage(): void {
    try {
      const toStore = Object.fromEntries(this.cache);
      localStorage.setItem(this.storageKey, JSON.stringify(toStore));
    } catch (error) {
      console.error(`Error saving cache to storage for ${this.storageKey}:`, error);
    }
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.expiryTime
    });
    this.saveToStorage();
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (item.expiry < Date.now()) {
      this.cache.delete(key);
      this.saveToStorage();
      return undefined;
    }

    return item.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.saveToStorage();
  }

  clear(): void {
    this.cache.clear();
    localStorage.removeItem(this.storageKey);
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    if (item.expiry < Date.now()) {
      this.cache.delete(key);
      this.saveToStorage();
      return false;
    }

    return true;
  }
} 