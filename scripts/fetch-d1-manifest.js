// Usage: node scripts/fetch-d1-manifest.js
// Requires: node-fetch, sqlite3
// Place your Bungie API key below

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';
const MANIFEST_META_URL = 'https://www.bungie.net/Platform/Destiny/Manifest/';
const OUTPUT_PATH = path.join(__dirname, '../src/assets/data/d1-manifest.json');

async function fetchManifestMeta() {
  const res = await fetch(MANIFEST_META_URL, {
    headers: { 'X-API-Key': API_KEY }
  });
  const data = await res.json();
  return data.Response.mobileWorldContentPaths.en;
}

async function downloadManifestSqlite(sqlitePath) {
  const res = await fetch('https://www.bungie.net' + sqlitePath);
  const fileStream = fs.createWriteStream('d1-manifest.content');
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
  // No decompression needed for D1 manifest
}

function extractTablesFromSqlite(sqliteFile, outputFile) {
  const db = new sqlite3.Database(sqliteFile);
  const tables = [
    'DestinyActivityDefinition',
    'DestinyActivityTypeDefinition',
    'DestinyActivityModeDefinition',
    'DestinyActivityCategoryDefinition'
  ];
  const manifest = {};
  let completed = 0;
  tables.forEach(table => {
    db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
      if (err) throw err;
      manifest[table] = {};
      rows.forEach(row => {
        // Each row has a 'id' or 'hash' key
        const key = row.id || row.hash || row.activityHash || row.activityTypeHash || row.activityModeHash || row.activityCategoryHash;
        manifest[table][key] = row;
      });
      completed++;
      if (completed === tables.length) {
        fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
        db.close();
        console.log('Manifest extracted to', outputFile);
      }
    });
  });
}

async function main() {
  console.log('Fetching Destiny 1 manifest metadata...');
  const sqlitePath = await fetchManifestMeta();
  console.log('Downloading manifest SQLite file...');
  await downloadManifestSqlite(sqlitePath);
  console.log('Extracting tables to JSON...');
  extractTablesFromSqlite('d1-manifest.content', OUTPUT_PATH);
}

main().catch(err => {
  console.error('Error:', err);
}); 