// d1-manifest-to-json.js
// Usage: node scripts/d1-manifest-to-json.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const AdmZip = require('adm-zip');

const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';
const MANIFEST_META_URL = 'https://www.bungie.net/d1/platform/Destiny/Manifest/';
const OUTPUT_PATH = path.join(__dirname, '../src/assets/manifest/d1-activity-definitions.json');
const MANIFEST_ZIP_PATH = path.join(__dirname, '../d1-manifest.zip');
const MANIFEST_SQLITE_PATH = path.join(__dirname, '../d1-manifest.content');

async function downloadManifest() {
  const metaRes = await axios.get(MANIFEST_META_URL, {
    headers: { 'X-API-Key': API_KEY }
  });
  if (!metaRes.data.Response || !metaRes.data.Response.mobileWorldContentPaths || !metaRes.data.Response.mobileWorldContentPaths.en) {
    console.error('Error: Unexpected manifest metadata response:', metaRes.data);
    process.exit(1);
  }
  const enPath = metaRes.data.Response.mobileWorldContentPaths.en;
  const manifestUrl = 'https://www.bungie.net' + enPath;
  const manifestRes = await axios.get(manifestUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(MANIFEST_ZIP_PATH, manifestRes.data);
  const stats = fs.statSync(MANIFEST_ZIP_PATH);
  console.log('Manifest ZIP saved to:', MANIFEST_ZIP_PATH, 'Size:', stats.size, 'bytes');

  // Unzip the manifest
  const zip = new AdmZip(MANIFEST_ZIP_PATH);
  const zipEntries = zip.getEntries();
  console.log('ZIP entries:');
  zipEntries.forEach(e => console.log(' -', e.entryName, e.header.size, 'bytes'));
  const contentEntry = zipEntries.find(e => e.entryName.endsWith('.content'));
  if (!contentEntry) {
    console.error('Error: No .content file found in manifest ZIP');
    process.exit(1);
  }
  zip.extractEntryTo(contentEntry, path.dirname(MANIFEST_SQLITE_PATH), false, true);
  const extractedPath = path.join(path.dirname(MANIFEST_SQLITE_PATH), contentEntry.entryName);
  const extractedStats = fs.statSync(extractedPath);
  console.log('Extracted SQLite DB to:', extractedPath, 'Size:', extractedStats.size, 'bytes');
  return extractedPath;
}

function extractActivityDefinitions(sqlitePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });
    db.all('SELECT json FROM DestinyActivityDefinition', (err, rows) => {
      if (err) return reject(err);
      const defs = {};
      for (const row of rows) {
        try {
          const def = JSON.parse(row.json);
          if (def && def.activityHash !== undefined) {
            defs[String(def.activityHash)] = def;
          }
        } catch (e) {
          // skip malformed rows
        }
      }
      db.close();
      resolve(defs);
    });
  });
}

async function main() {
  try {
    console.log('Downloading D1 manifest...');
    const sqlitePath = await downloadManifest();
    console.log('Extracting DestinyActivityDefinition...');
    const defs = await extractActivityDefinitions(sqlitePath);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(defs, null, 2));
    fs.unlinkSync(sqlitePath);
    console.log('Done! Output at:', OUTPUT_PATH);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main(); 