// list-unmapped-activity-modes.js
// Usage: node list-unmapped-activity-modes.js
// Lists all Destiny 2 activity modes in the manifest that are not mapped in ACTIVITY_MODE_MAP

const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'src/assets/activity-images/DestinyActivityModeDefinition.json');
const mappingPath = path.join(__dirname, 'src/app/models/activity-types.ts');

// Load manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Parse ACTIVITY_MODE_MAP from the TypeScript file as text
const mappingText = fs.readFileSync(mappingPath, 'utf8');
const mapMatch = mappingText.match(/ACTIVITY_MODE_MAP: \{([\s\S]*?)\};/);
if (!mapMatch) {
  console.error('Could not find ACTIVITY_MODE_MAP in activity-types.ts');
  process.exit(1);
}
const mapBody = mapMatch[1];
const mappedModes = new Set();
const modeRegex = /([0-9]+):/g;
let match;
while ((match = modeRegex.exec(mapBody)) !== null) {
  mappedModes.add(Number(match[1]));
}

// Find unmapped modes
const unmapped = [];
for (const [hash, def] of Object.entries(manifest)) {
  const modeType = def.modeType;
  if (modeType !== undefined && !mappedModes.has(modeType)) {
    unmapped.push({
      modeType,
      name: def.displayProperties?.name || '',
      hash
    });
  }
}

// Remove duplicates by modeType
const uniqueUnmapped = Array.from(new Map(unmapped.map(u => [u.modeType, u])).values());

console.log('Unmapped activity modes:');
uniqueUnmapped.forEach(u => {
  console.log(`modeType: ${u.modeType}, name: ${u.name}, hash: ${u.hash}`);
}); 