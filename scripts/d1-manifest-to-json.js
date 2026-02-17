// d1-manifest-to-json.js
// Fetches the full D1 manifest from the Bungie API and writes activity/type/mode
// definitions to src/assets/manifest/d1-activity-definitions.json (same format the app loads).
// Usage: BUNGIE_API_KEY=your_key node scripts/d1-manifest-to-json.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const AdmZip = require('adm-zip');

const API_KEY = process.env.BUNGIE_API_KEY || process.env.API_KEY;
const MANIFEST_META_URL = 'https://www.bungie.net/d1/Platform/Destiny/Manifest/';
const OUTPUT_PATH = path.join(__dirname, '../src/assets/manifest/d1-activity-definitions.json');
const MANIFEST_ZIP_PATH = path.join(__dirname, 'd1-manifest.zip');
const SCRIPTS_DIR = __dirname;

async function downloadManifest() {
  if (!API_KEY) {
    console.error('Error: Set BUNGIE_API_KEY (or API_KEY) when running this script.');
    process.exit(1);
  }
  const metaRes = await fetch(MANIFEST_META_URL, {
    headers: { 'X-API-Key': API_KEY }
  });
  const metaData = await metaRes.json();
  if (!metaData.Response?.mobileWorldContentPaths?.en) {
    console.error('Error: Unexpected manifest metadata response:', metaData);
    process.exit(1);
  }
  const enPath = metaData.Response.mobileWorldContentPaths.en;
  const manifestUrl = 'https://www.bungie.net' + enPath;
  const manifestRes = await fetch(manifestUrl);
  const arrayBuffer = await manifestRes.arrayBuffer();
  fs.writeFileSync(MANIFEST_ZIP_PATH, Buffer.from(arrayBuffer));
  const stats = fs.statSync(MANIFEST_ZIP_PATH);
  console.log('Manifest ZIP saved:', MANIFEST_ZIP_PATH, 'Size:', stats.size, 'bytes');

  const zip = new AdmZip(MANIFEST_ZIP_PATH);
  const zipEntries = zip.getEntries();
  const contentEntry = zipEntries.find(e => e.entryName.endsWith('.content'));
  if (!contentEntry) {
    console.error('Error: No .content file found in manifest ZIP');
    process.exit(1);
  }
  zip.extractEntryTo(contentEntry, SCRIPTS_DIR, false, true);
  const extractedPath = path.join(SCRIPTS_DIR, contentEntry.entryName);
  console.log('Extracted SQLite DB to:', extractedPath);
  return extractedPath;
}

function extractTable(db, tableName, hashKey) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT json FROM ${tableName}`, (err, rows) => {
      if (err) return reject(err);
      const defs = {};
      for (const row of rows) {
        try {
          const def = JSON.parse(row.json);
          if (def && def[hashKey] !== undefined) {
            defs[String(def[hashKey])] = def;
          }
        } catch (e) {
          // skip malformed rows
        }
      }
      resolve(defs);
    });
  });
}

async function main() {
  try {
    console.log('Downloading D1 manifest...');
    const sqlitePath = await downloadManifest();
    const db = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
    const tables = [
      { name: 'DestinyActivityDefinition', hash: 'activityHash' },
      { name: 'DestinyActivityTypeDefinition', hash: 'activityTypeHash' },
      { name: 'DestinyActivityModeDefinition', hash: 'activityModeHash' },
      { name: 'DestinyActivityCategoryDefinition', hash: 'activityCategoryHash' }
    ];
    const manifest = {};
    for (const t of tables) {
      console.log(`Extracting ${t.name}...`);
      manifest[t.name] = await extractTable(db, t.name, t.hash);
    }
    db.close();
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
    if (fs.existsSync(MANIFEST_ZIP_PATH)) fs.unlinkSync(MANIFEST_ZIP_PATH);
    console.log('Done! Full D1 manifest written to:', OUTPUT_PATH);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main(); 