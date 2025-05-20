const fs = require('fs');
const fetch = require('node-fetch');

// === CONFIGURATION ===
const API_KEY = e55082388d014a79b9f5da4be0063d1c; // <-- Replace with your Bungie API key
const missingIds = [
  3210106079,
  4163254808,
  // ...add more from your logs
];
const manifestPath = './src/assets/manifest/d1-activity-definitions.json';

// === HELPER: Fetch activity definition from Bungie API ===
async function fetchActivityDef(hash) {
  const url = `https://www.bungie.net/Platform/Destiny/Manifest/Activity/${hash}/`;
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY } });
  const data = await res.json();
  if (data.Response && data.Response.data && data.Response.data.activity) {
    return data.Response.data.activity;
  }
  return null;
}

// === MAIN ===
(async function main() {
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  for (const hash of missingIds) {
    if (manifest[hash]) {
      console.log(`Already present: ${hash}`);
      continue;
    }
    console.log(`Fetching: ${hash}`);
    try {
      const def = await fetchActivityDef(hash);
      if (def) {
        manifest[hash] = {
          activityHash: def.activityHash,
          activityName: def.activityName,
          activityDescription: def.activityDescription,
          icon: def.icon,
          pgcrImage: def.pgcrImage,
          activityLevel: def.activityLevel,
          minParty: def.minParty,
          maxParty: def.maxParty,
          maxPlayers: def.maxPlayers,
          destinationHash: def.destinationHash,
          placeHash: def.placeHash,
          activityTypeHash: def.activityTypeHash,
          tier: def.tier,
          isPlaylist: def.isPlaylist,
          isMatchmade: def.isMatchmade,
        };
        console.log(`Added: ${hash} - ${def.activityName}`);
      } else {
        console.warn(`Not found: ${hash}`);
      }
    } catch (err) {
      console.error(`Error fetching ${hash}:`, err.message);
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('Manifest updated!');
})();