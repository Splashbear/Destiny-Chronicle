/**
 * Lazy access to the large static medal / record-book catalogs (~215 KB source).
 * They are pulled in with dynamic import() so they stay out of the initial bundle.
 *
 * Call `await loadMedalCatalogs()` (cheap and idempotent) before using any sync accessor.
 * Accessors return empty data (and warn once) if called before the catalogs are loaded;
 * all callers in this repo await the loader first.
 */
import type { D1MedalCatalogEntry } from './d1-medals-catalog';
import type { D2MedalCatalogEntry } from './d2-medals-catalog';
import type { D1RecordBookCatalog, D1RecordCatalogEntry } from './d1-record-books-catalog';

let d2Medals: D2MedalCatalogEntry[] | null = null;
let d1MedalsByStat: Record<string, D1MedalCatalogEntry> | null = null;
let d1Books: D1RecordBookCatalog[] | null = null;
let d1RecordsByName: Record<string, D1RecordCatalogEntry> | null = null;
let pending: Promise<void> | null = null;
let warned = false;

export function loadMedalCatalogs(): Promise<void> {
  if (d2Medals && d1MedalsByStat && d1Books && d1RecordsByName) return Promise.resolve();
  if (!pending) {
    pending = Promise.all([
      import('./d2-medals-catalog'),
      import('./d1-medals-catalog'),
      import('./d1-record-books-catalog'),
    ])
      .then(([d2, d1m, d1r]) => {
        d2Medals = d2.D2_MEDALS_ORDER;
        d1MedalsByStat = d1m.D1_MEDALS_BY_STAT_ID;
        d1Books = d1r.D1_RECORD_BOOKS;
        d1RecordsByName = d1r.D1_RECORDS_BY_NAME;
      })
      .catch((err) => {
        pending = null; // allow retry on the next call (e.g. transient chunk load failure)
        throw err;
      });
  }
  return pending;
}

function warnNotLoaded(): void {
  if (warned) return;
  warned = true;
  console.warn('[medal-catalogs] accessed before loadMedalCatalogs() resolved');
}

export function getD2MedalsOrder(): D2MedalCatalogEntry[] {
  if (!d2Medals) warnNotLoaded();
  return d2Medals ?? [];
}

export function getD1MedalsByStatId(): Record<string, D1MedalCatalogEntry> {
  if (!d1MedalsByStat) warnNotLoaded();
  return d1MedalsByStat ?? {};
}

export function getD1RecordBooks(): D1RecordBookCatalog[] {
  if (!d1Books) warnNotLoaded();
  return d1Books ?? [];
}

export function normalizeD1RecordName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/['`']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function lookupD1RecordCatalog(name: string): D1RecordCatalogEntry | null {
  if (!d1RecordsByName) warnNotLoaded();
  return d1RecordsByName?.[normalizeD1RecordName(name)] || null;
}
