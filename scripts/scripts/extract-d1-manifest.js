// Usage: node scripts/extract-d1-manifest.js
// Requires: sqlite3 (npm install sqlite3)

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const SQLITE_PATH = path.join(__dirname, '../src/assets/data/d1-manifest.content');
const OUTPUT_PATH = path.join(__dirname, '../src/assets/data/d1-manifest.json');

// List the tables you want to extract
const TABLES = [
  'DestinyActivityDefinition',
  'DestinyActivityTypeDefinition',
  'DestinyActivityModeDefinition',
  'DestinyActivityCategoryDefinition'
];

function extractTables(sqliteFile, outputFile, tables) {
  const db = new sqlite3.Database(sqliteFile);
  const manifest = {};
  let completed = 0;

  tables.forEach(table => {
    db.all(`SELECT id, json FROM ${table}`, [], (err, rows) => {
      if (err) throw err;
      manifest[table] = {};
      rows.forEach(row => {
        manifest[table][row.id] = JSON.parse(row.json);
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

extractTables(SQLITE_PATH, OUTPUT_PATH, TABLES);