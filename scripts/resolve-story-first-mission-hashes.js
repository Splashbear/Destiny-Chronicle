/**
 * Resolves Destinypedia "first story mission" names to Bungie activity hashes.
 *
 * D1: reads src/assets/manifest/d1-activity-definitions.json (checked in).
 * D2: fetches DestinyActivityDefinition from live manifest (needs network + X-API-Key).
 *
 * Usage: node scripts/resolve-story-first-mission-hashes.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.BUNGIE_API_KEY || 'e55082388d014a79b9f5da4be0063d1c';
const D1_PATH = path.join(__dirname, '../src/assets/manifest/d1-activity-definitions.json');

function httpsGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/** D1: exact activityName match, all hashes */
function d1ExactNames(names) {
  const raw = JSON.parse(fs.readFileSync(D1_PATH, 'utf8'));
  const defs = raw.DestinyActivityDefinition || raw;
  const out = [];
  for (const name of names) {
    const hashes = [];
    for (const [h, def] of Object.entries(defs)) {
      if ((def.activityName || '') === name) hashes.push(h);
    }
    out.push({ name, hashes });
  }
  return out;
}

/**
 * D2: match displayProperties.name — prefer exact, else substring.
 * For ambiguous short strings, list first few matches for manual review.
 */
function d2Resolve(defs, queries) {
  const entries = Object.entries(defs);
  return queries.map(({ label, exact, contains }) => {
    const exactHits = [];
    const subHits = [];
    for (const [h, def] of entries) {
      const n = (def.displayProperties && def.displayProperties.name) || '';
      if (exact && n === exact) exactHits.push({ h, n });
      else if (contains && n.includes(contains)) subHits.push({ h, n });
    }
    const picks = exactHits.length ? exactHits : subHits;
    return { label, exact, contains, count: picks.length, samples: picks.slice(0, 12) };
  });
}

const D1_NAMES = [
  'A Guardian Rises',
  'Fist of Crota',
  'A Kell Rising',
  'The Coming War',
  'King of the Mountain',
];

const D2_QUERIES = [
  { label: 'Red War — Homecoming', exact: 'Homecoming', contains: null },
  { label: 'CoO — The Gateway', exact: 'The Gateway', contains: null },
  { label: 'Warmind — Ice and Shadow', exact: 'Ice and Shadow', contains: null },
  { label: 'Forsaken — Last Call', exact: 'Last Call', contains: null },
  { label: 'Shadowkeep — A Mysterious Disturbance', exact: 'A Mysterious Disturbance', contains: null },
  { label: "Beyond Light — Darkness's Doorstep", exact: null, contains: "Darkness's Doorstep" },
  { label: 'Witch Queen — The Arrival', exact: 'The Arrival', contains: null },
  { label: 'Lightfall — First Contact', exact: 'First Contact', contains: null },
  { label: 'Final Shape — Transmigration', exact: null, contains: 'Transmigration' },
  { label: 'Edge of Fate — Mission: The Invitation', exact: 'Mission: The Invitation', contains: null },
  { label: 'Renegades — Imperium', exact: 'Imperium', contains: null },
  { label: 'Forge — Scourge of the Armory', exact: null, contains: 'Scourge of the Armory' },
  { label: 'Dawn — Corridors of Time Part 1', exact: 'Corridors of Time Part 1', contains: null },
  // Season of the Worthy: Destinypedia lists "Into the Mindlab" first; no matching display name
  // found in DestinyActivityDefinition via common substrings (Mindlab, Boot Sector, Lunar, Tyrant).
  // Resolve manually (e.g. from a PGCR or light.gg) before adding to story-first-missions config.
  { label: 'Arrivals — A Shadow Overhead', exact: 'A Shadow Overhead', contains: null },
  { label: 'Hunt — Trail of the Hunted', exact: 'Trail of the Hunted', contains: null },
  { label: 'Chosen — Battleground: Behemoth', exact: null, contains: 'Battleground: Behemoth' },
  { label: 'Splicer — The Lost Splicer', exact: 'The Lost Splicer', contains: null },
  { label: 'Lost — Cocoon', exact: null, contains: 'Cocoon' },
  { label: 'Haunted — Operation: Midas', exact: 'Operation: Midas', contains: null },
  { label: 'Plunder — Salvage and Salvation', exact: 'Salvage and Salvation', contains: null },
  { label: 'Seraph — Hierarchy', exact: 'Hierarchy', contains: null },
  { label: 'Defiance — Mission: Jailbreak', exact: null, contains: 'Jailbreak' },
  { label: 'Deep — The Descent', exact: 'The Descent', contains: null },
  { label: 'Witch (season) — Way of the Witch', exact: null, contains: 'Way of the Witch' },
  { label: 'Wish (season) — Final Wish', exact: null, contains: 'Final Wish' },
  { label: 'Reclamation — Ash & Iron: Initialize', exact: null, contains: 'Ash & Iron' },
  { label: 'Echoes — Mission: Meteoric', exact: null, contains: 'Meteoric' },
  { label: 'Revenant — Na-Veskirisk', exact: 'Na-Veskirisk', contains: null },
  { label: 'Heresy — Espial', exact: 'Espial', contains: null },
];

async function main() {
  console.log('=== D1 (local d1-activity-definitions.json) ===\n');
  for (const row of d1ExactNames(D1_NAMES)) {
    console.log(row.name);
    console.log('  hashes:', row.hashes.join(', ') || '(none)');
    console.log('');
  }

  console.log('=== D2 (live manifest DestinyActivityDefinition) ===\n');
  const idx = await httpsGetJson('https://www.bungie.net/Platform/Destiny2/Manifest/', {
    'X-API-Key': API_KEY,
  });
  if (idx.ErrorCode !== 1) {
    console.error('Manifest index error:', idx.Message || idx);
    process.exit(1);
  }
  const compPath = idx.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition;
  const full = await httpsGetJson('https://www.bungie.net' + compPath, { 'X-API-Key': API_KEY });
  const defs = full.DestinyActivityDefinition || full;
  if (!defs || typeof defs !== 'object') {
    console.error('Unexpected D2 activity payload');
    process.exit(1);
  }

  console.log(
    'Note: Season of the Worthy (wiki: Into the Mindlab) — no reliable DestinyActivityDefinition name match in automated scan; add hashes manually after verifying from a PGCR.\n'
  );

  for (const r of d2Resolve(defs, D2_QUERIES)) {
    console.log(r.label);
    console.log('  match count:', r.count);
    if (r.samples.length) {
      for (const s of r.samples) {
        console.log('   ', s.h, '\t', JSON.stringify(s.n));
      }
    } else {
      console.log('   (no matches — adjust exact/contains string)');
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
