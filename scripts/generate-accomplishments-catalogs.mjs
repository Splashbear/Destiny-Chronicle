/**
 * One-shot: handoff MEDALS_LIST / D1_MEDALS_LIST / TRIUMPHS_LIST → src/app/data/*.ts
 * Usage: node scripts/generate-accomplishments-catalogs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handoff = path.resolve('C:/Users/knigh/agent-tools/cursor-handoff');
const outDir = path.resolve(__dirname, '../src/app/data');

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

fs.mkdirSync(outDir, { recursive: true });

// --- D2 medals ---
const medalsMd = fs.readFileSync(path.join(handoff, 'MEDALS_LIST.md'), 'utf8');
let mode = '';
let subtype = '';
/** name → one or more entries (a few medals share display names across modes). */
const d2ByName = {};
const d2Order = [];
let order = 0;
for (const line of medalsMd.split(/\r?\n/)) {
  const modeM = line.match(/^## (.+?) \((\d+)\)\s*$/);
  if (modeM) {
    mode = modeM[1].trim();
    subtype = '';
    continue;
  }
  const subM = line.match(/^### (.+?) \((\d+)\)\s*$/);
  if (subM) {
    subtype = subM[1].trim();
    continue;
  }
  const leaf = line.match(/^- (.+?) \((\d+)\):\s*(.*)$/);
  if (leaf && mode && subtype) {
    const name = leaf[1].trim();
    const entry = {
      hash: leaf[2],
      name,
      description: (leaf[3] || '').trim(),
      mode,
      subtype,
      order: order++,
    };
    const key = normName(name);
    if (!d2ByName[key]) d2ByName[key] = [];
    d2ByName[key].push(entry);
    d2Order.push(entry);
  }
}

// --- D1 medals ---
const d1Md = fs.readFileSync(path.join(handoff, 'D1_MEDALS_LIST.md'), 'utf8');
let tier = '';
const d1ByStatId = {};
const d1Order = [];
order = 0;
const tierLabel = {
  'No tier': 'Other',
  PVP_TIER_1: 'Tier 1',
  PVP_TIER_2: 'Tier 2',
  PVP_TIER_3: 'Tier 3',
  PVP_TIER_4: 'Tier 4',
  PVP_TIER_5: 'Tier 5',
  PVP_TIER_6: 'Tier 6',
  PVP_TIER_7: 'Tier 7',
  STRIKE_ABILITY_MEDALS: 'Ability',
  STRIKE_COMPLETE_MEDALS: 'Completions',
  STRIKE_MULTIKILL_MEDALS: 'Multi-kill',
  STRIKE_SUPER_MEDALS: 'Super',
};
function d1Mode(t) {
  if (t.startsWith('PVP_')) return 'Crucible';
  if (t.startsWith('STRIKE_')) return 'Vanguard';
  return 'Other';
}
for (const line of d1Md.split(/\r?\n/)) {
  const tierM = line.match(/^## (.+?) \(\d+\)\s*$/);
  if (tierM) {
    tier = tierM[1].trim();
    continue;
  }
  const leaf = line.match(/^- (.+?) \(([^)]+)\):\s*(.*)$/);
  if (leaf && tier) {
    const name = leaf[1].trim();
    const statId = leaf[2].trim();
    const entry = {
      statId,
      name,
      description: (leaf[3] || '').trim(),
      mode: d1Mode(tier),
      subtype: tierLabel[tier] || tier,
      tier,
      order: order++,
    };
    d1ByStatId[statId.toLowerCase()] = entry;
    d1Order.push(entry);
  }
}

// --- Triumphs ---
const triumphsMd = fs.readFileSync(path.join(handoff, 'TRIUMPHS_LIST.md'), 'utf8');
let cat1 = '';
let cat2 = '';
let cat3 = '';
const triumphsByHash = {};
order = 0;
for (const line of triumphsMd.split(/\r?\n/)) {
  const m1 = line.match(/^## (.+?) \((\d+)\)\s*$/);
  if (m1) {
    cat1 = m1[1].trim();
    cat2 = '';
    cat3 = '';
    continue;
  }
  const m2 = line.match(/^### (.+?) \((\d+)\)\s*$/);
  if (m2) {
    cat2 = m2[1].trim();
    cat3 = '';
    continue;
  }
  const m3 = line.match(/^#### (.+?) \((\d+)\)\s*$/);
  if (m3) {
    cat3 = m3[1].trim();
    continue;
  }
  const leaf = line.match(/^- (.+?) \((\d+)\):\s*(.*)$/);
  if (leaf && cat1) {
    const name = leaf[1].trim();
    const hash = leaf[2];
    const pathParts = [cat1, cat2, cat3].filter(Boolean);
    triumphsByHash[hash] = {
      hash,
      name,
      description: (leaf[3] || '').trim(),
      category: pathParts.join(' · '),
      path: pathParts,
      order: order++,
    };
  }
}

function writeTs(file, banner, types, exports) {
  fs.writeFileSync(path.join(outDir, file), `${banner}\n${types}\n${exports}\n`, 'utf8');
}

writeTs(
  'd2-medals-catalog.ts',
  '/** Auto-generated from handoff MEDALS_LIST.md. Do not edit by hand. */',
  `export type D2MedalCatalogEntry = {
  hash: string;
  name: string;
  description: string;
  mode: string;
  subtype: string;
  order: number;
};`,
  `export const D2_MEDALS_BY_NAME: Record<string, D2MedalCatalogEntry[]> = ${JSON.stringify(d2ByName, null, 2)};

export const D2_MEDALS_ORDER: D2MedalCatalogEntry[] = ${JSON.stringify(d2Order, null, 2)};`
);

writeTs(
  'd1-medals-catalog.ts',
  '/** Auto-generated from handoff D1_MEDALS_LIST.md. Do not edit by hand. */',
  `export type D1MedalCatalogEntry = {
  statId: string;
  name: string;
  description: string;
  mode: string;
  subtype: string;
  tier: string;
  order: number;
};`,
  `export const D1_MEDALS_BY_STAT_ID: Record<string, D1MedalCatalogEntry> = ${JSON.stringify(d1ByStatId, null, 2)};

export const D1_MEDALS_ORDER: D1MedalCatalogEntry[] = ${JSON.stringify(d1Order, null, 2)};`
);

writeTs(
  'triumphs-catalog.ts',
  '/** Auto-generated from handoff TRIUMPHS_LIST.md. Do not edit by hand. */',
  `export type TriumphCatalogEntry = {
  hash: string;
  name: string;
  description: string;
  category: string;
  path: string[];
  order: number;
};`,
  `export const TRIUMPHS_BY_HASH: Record<string, TriumphCatalogEntry> = ${JSON.stringify(triumphsByHash, null, 2)};`
);

console.log(
  'Wrote catalogs:',
  d2Order.length,
  'D2 medals (',
  Object.keys(d2ByName).length,
  'unique names),',
  Object.keys(d1ByStatId).length,
  'D1 medals,',
  Object.keys(triumphsByHash).length,
  'triumphs'
);
