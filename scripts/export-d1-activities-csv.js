// Usage: node scripts/export-d1-activities-csv.js
// Exports all D1 activities and their types to a CSV file for cross-checking

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '../src/assets/manifest/d1-activity-definitions.json');
const OUTPUT_CSV = path.join(__dirname, 'd1-activities.csv');

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const activities = manifest.DestinyActivityDefinition;
  const types = manifest.DestinyActivityTypeDefinition;

  const rows = [
    ['activityHash', 'activityName', 'activityTypeName', 'activityTypeIdentifier']
  ];

  for (const [hash, def] of Object.entries(activities)) {
    const name = def.activityName || def.displayProperties?.name || '';
    const typeHash = def.activityTypeHash;
    let typeName = '';
    let typeIdentifier = '';
    if (typeHash && types[typeHash]) {
      typeName = types[typeHash].activityTypeName || '';
      typeIdentifier = types[typeHash].identifier || '';
    }
    rows.push([hash, name, typeName, typeIdentifier]);
  }

  const csv = rows.map(row => row.map(field => '"' + String(field).replace(/"/g, '""') + '"').join(',')).join('\n');
  fs.writeFileSync(OUTPUT_CSV, csv);
  console.log('Exported D1 activities to', OUTPUT_CSV);
}

main(); 