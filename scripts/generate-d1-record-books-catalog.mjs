/**
 * Builds src/app/data/d1-record-books-catalog.ts from the handoff / pasted
 * D1 record-book triumph list (Markdown).
 *
 * Usage:
 *   node scripts/generate-d1-record-books-catalog.mjs [path-to.md]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../src/app/data/d1-record-books-catalog.ts');
const srcPath =
  process.argv[2] ||
  path.resolve('C:/Users/knigh/agent-tools/cursor-handoff/D1_RECORD_BOOKS_LIST.md');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Guess which record book a page belongs to (for grouping when Manifest is missing). */
function bookForPage(page) {
  const p = page.toLowerCase();
  // Rise of Iron Record Book is 4×8 = 32 records (DIM: 31/32). Vanguard Elite is separate.
  if (
    p === 'rise of iron' ||
    p === 'the plaguelands' ||
    p === 'wrath of the machine' ||
    p === 'the crucible'
  ) {
    return 'Rise of Iron';
  }
  if (p === 'vanguard elite') return 'Vanguard Elite';
  if (p.includes('age of triumph') || p === 'commemoration') return 'Age of Triumph';
  if (
    [
      'story',
      "titan's will",
      "hunter's way",
      "warlock's path",
      'strikes',
      'raids',
      'collections',
      'wanderer',
      'allegiances',
      'trials of osiris',
    ].includes(p)
  ) {
    return 'Age of Triumph';
  }
  if (p.startsWith('moments of triumph')) return 'Moments of Triumph';
  if (p.includes('sparrow')) return 'Sparrow Racing League';
  return page;
}

const md = fs.readFileSync(srcPath, 'utf8');
const pages = [];
let currentPage = null;
let order = 0;

for (const line of md.split(/\r?\n/)) {
  const pageM = line.match(/^###\s+(.+?)\s*$/);
  if (pageM) {
    currentPage = pageM[1].trim();
    pages.push({
      page: currentPage,
      book: bookForPage(currentPage),
      records: [],
    });
    continue;
  }
  // * **Name** — Description. *(progress)*
  const recM = line.match(/^\*\s+\*\*(.+?)\*\*\s+[—–-]\s+(.+?)(?:\s+\*\((.+?)\)\*)?\s*$/);
  if (recM && pages.length) {
    const name = recM[1].trim();
    let description = recM[2].trim();
    // Strip trailing period before progress marker if doubled
    description = description.replace(/\.\s*$/, '').trim();
    const progressHint = (recM[3] || '').trim();
    pages[pages.length - 1].records.push({
      name,
      description,
      progressHint,
      order: order++,
    });
  }
}

// Fix book assignment for "The Crucible (Age of Triumph)"
for (const p of pages) {
  if (/age of triumph/i.test(p.page)) {
    p.book = 'Age of Triumph';
    p.page = p.page.replace(/\s*\(Age of Triumph\)\s*/i, '').trim() || p.page;
  }
}

const byName = {};
for (const page of pages) {
  for (const r of page.records) {
    const key = norm(r.name);
    byName[key] = {
      name: r.name,
      description: r.description,
      page: page.page,
      book: page.book,
      order: r.order,
    };
  }
}

const books = {};
for (const page of pages) {
  if (!books[page.book]) books[page.book] = { name: page.book, pages: [] };
  books[page.book].pages.push({
    name: page.page,
    records: page.records.map((r) => ({
      name: r.name,
      description: r.description,
      order: r.order,
    })),
  });
}

const banner = `/** Auto-generated from D1 record-book triumph list. Do not edit by hand. */`;
const types = `export type D1RecordCatalogEntry = {
  name: string;
  description: string;
  page: string;
  book: string;
  order: number;
};

export type D1RecordBookPageCatalog = {
  name: string;
  records: Array<{ name: string; description: string; order: number }>;
};

export type D1RecordBookCatalog = {
  name: string;
  pages: D1RecordBookPageCatalog[];
};`;

const body = `export const D1_RECORDS_BY_NAME: Record<string, D1RecordCatalogEntry> = ${JSON.stringify(byName, null, 2)};

export const D1_RECORD_BOOKS: D1RecordBookCatalog[] = ${JSON.stringify(Object.values(books), null, 2)};

export function normalizeD1RecordName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/['\`']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function lookupD1RecordCatalog(name: string): D1RecordCatalogEntry | null {
  return D1_RECORDS_BY_NAME[normalizeD1RecordName(name)] || null;
}
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${banner}\n${types}\n\n${body}\n`, 'utf8');
console.log(
  'Wrote',
  outPath,
  '—',
  Object.keys(byName).length,
  'records across',
  Object.keys(books).length,
  'books /',
  pages.length,
  'pages'
);
