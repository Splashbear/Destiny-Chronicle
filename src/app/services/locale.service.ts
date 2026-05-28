import { Injectable } from '@angular/core';

/** Bungie manifest culture keys from `jsonWorldComponentContentPaths`. */
export type BungieCulture = string;

const LOCALE_OVERRIDE_KEY = 'destiny-chronicle-locale';

/** Map browser language prefixes to Bungie culture keys when Bungie has no exact match. */
const BROWSER_TO_BUNGIE: Record<string, BungieCulture> = {
  pt: 'pt-br',
  'pt-pt': 'pt-br',
  zh: 'zh-chs',
  'zh-cn': 'zh-chs',
  'zh-sg': 'zh-chs',
  'zh-hans': 'zh-chs',
  'zh-tw': 'zh-cht',
  'zh-hk': 'zh-cht',
  'zh-mo': 'zh-cht',
  'zh-hant': 'zh-cht',
  es: 'es',
  'es-es': 'es',
  'es-419': 'es-mx',
  'es-mx': 'es-mx',
  'es-us': 'es-mx',
  en: 'en',
  fr: 'fr',
  de: 'de',
  it: 'it',
  ja: 'ja',
  ko: 'ko',
  pl: 'pl',
  ru: 'ru'
};

/** Intl / Accept-Language tag per Bungie culture. */
const CULTURE_TO_INTL: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  'es-mx': 'es-MX',
  de: 'de-DE',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  pl: 'pl-PL',
  ru: 'ru-RU',
  'pt-br': 'pt-BR',
  'zh-chs': 'zh-CN',
  'zh-cht': 'zh-TW'
};

@Injectable({
  providedIn: 'root'
})
export class LocaleService {
  private availableCultures: BungieCulture[] = ['en'];
  private _culture: BungieCulture = 'en';

  constructor() {
    this._culture = this.readOverride() ?? this.resolveFromBrowser(this.availableCultures);
  }

  /** Cultures reported by the latest D2 manifest metadata. */
  get supportedCultures(): readonly BungieCulture[] {
    return this.availableCultures;
  }

  /** Active Bungie manifest culture (e.g. `en`, `fr`, `pt-br`). */
  get culture(): BungieCulture {
    return this._culture;
  }

  /** BCP 47 tag for `Intl` and `toLocaleDateString`. */
  get intlLocale(): string {
    return CULTURE_TO_INTL[this._culture] ?? this._culture;
  }

  /** Value for the HTTP `Accept-Language` header. */
  get acceptLanguage(): string {
    const primary = this.intlLocale;
    if (this._culture === 'en') {
      return primary;
    }
    return `${primary},en-US;q=0.9,en;q=0.8`;
  }

  /**
   * Called after manifest metadata is fetched so culture resolution uses Bungie's supported set.
   */
  setAvailableCultures(cultures: BungieCulture[]): void {
    const normalized = cultures.map(c => c.toLowerCase()).filter(Boolean);
    if (normalized.length) {
      this.availableCultures = Array.from(new Set(normalized));
    }
    const override = this.readOverride();
    this._culture = override && this.availableCultures.includes(override)
      ? override
      : this.resolveFromBrowser(this.availableCultures);
  }

  /** Optional manual override (persisted); pass `null` to clear. */
  setCultureOverride(culture: BungieCulture | null): void {
    if (typeof localStorage === 'undefined') return;
    if (culture == null) {
      localStorage.removeItem(LOCALE_OVERRIDE_KEY);
      this._culture = this.resolveFromBrowser(this.availableCultures);
      return;
    }
    const key = culture.toLowerCase();
    if (!this.availableCultures.includes(key)) {
      return;
    }
    localStorage.setItem(LOCALE_OVERRIDE_KEY, key);
    this._culture = key;
  }

  resolveFromBrowser(available: BungieCulture[]): string {
    const set = new Set(available.map(c => c.toLowerCase()));
    if (!set.size) {
      return 'en';
    }

    const candidates: string[] = [];
    if (typeof navigator !== 'undefined') {
      if (navigator.languages?.length) {
        candidates.push(...navigator.languages);
      } else if (navigator.language) {
        candidates.push(navigator.language);
      }
    }
    candidates.push('en');

    for (const raw of candidates) {
      const tag = raw.toLowerCase().replace(/_/g, '-');
      if (set.has(tag)) {
        return tag;
      }
      const primary = tag.split('-')[0];
      if (BROWSER_TO_BUNGIE[tag] && set.has(BROWSER_TO_BUNGIE[tag])) {
        return BROWSER_TO_BUNGIE[tag];
      }
      if (BROWSER_TO_BUNGIE[primary] && set.has(BROWSER_TO_BUNGIE[primary])) {
        return BROWSER_TO_BUNGIE[primary];
      }
      if (set.has(primary)) {
        return primary;
      }
      // pt-BR style → pt-br
      const bungieStyle = tag.replace(/-([a-z]{2,4})$/, (_, r) => `-${r}`);
      if (set.has(bungieStyle)) {
        return bungieStyle;
      }
    }

    return set.has('en') ? 'en' : available[0];
  }

  private readOverride(): BungieCulture | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const v = localStorage.getItem(LOCALE_OVERRIDE_KEY)?.toLowerCase();
    return v || null;
  }
}
