// Usage: node scripts/audit-d1-manifest.js
// Scans the D1 manifest for missing activity names/types

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '../src/assets/manifest/d1-activity-definitions.json');

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const activities = manifest.DestinyActivityDefinition;
  const types = manifest.DestinyActivityTypeDefinition;
  const modes = manifest.DestinyActivityModeDefinition;

  let missingNames = [];
  let missingTypes = [];
  let unknownTypes = new Set();

  for (const [hash, def] of Object.entries(activities)) {
    // Check for missing name
    const name = def.activityName || def.displayProperties?.name;
    if (!name || name === 'Unknown Activity') {
      missingNames.push({ hash, name });
    }
    // Check for missing or unknown type
    const typeHash = def.activityTypeHash;
    if (!typeHash || !types[typeHash]) {
      missingTypes.push({ hash, name: name || 'Unknown', typeHash });
    } else {
      const typeName = types[typeHash].identifier || types[typeHash].activityTypeName;
      if (!typeName || typeName === 'unknown') {
        unknownTypes.add(typeHash);
      }
    }
  }

  console.log('--- D1 Manifest Audit ---');
  console.log('Activities missing names:', missingNames.length);
  if (missingNames.length) console.table(missingNames);
  console.log('Activities missing types:', missingTypes.length);
  if (missingTypes.length) console.table(missingTypes);
  console.log('Unknown type hashes:', Array.from(unknownTypes));
}

main(); 