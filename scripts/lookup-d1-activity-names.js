// Usage: node scripts/lookup-d1-activity-names.js
// Make sure you have the D1 manifest JSON available (update the path as needed)

const fs = require('fs');
const path = require('path');

// Update this path to your D1 manifest JSON file
const D1_MANIFEST_PATH = path.join(__dirname, '../src/assets/data/d1-manifest.json');

// List of referenceIds to look up (add more as needed)
const referenceIds = [
  3817155567,
  2082069870,
  3101475152,
  2846352225,
  493857039,
  3393673804,
  4079642013
];

function loadManifest() {
  if (!fs.existsSync(D1_MANIFEST_PATH)) {
    console.error('D1 manifest not found at:', D1_MANIFEST_PATH);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(D1_MANIFEST_PATH, 'utf8'));
}

function lookupActivityNames(manifest, ids) {
  ids.forEach(id => {
    const activity = manifest.activities && manifest.activities[id];
    if (activity) {
      console.log(`referenceId=${id} name="${activity.name}"`);
    } else {
      console.log(`referenceId=${id} name=NOT_FOUND`);
    }
  });
}

function main() {
  const manifest = loadManifest();
  lookupActivityNames(manifest, referenceIds);
}

main(); 