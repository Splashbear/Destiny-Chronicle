// Script to verify Leviathan raid hashes against the Bungie API manifest
const https = require('https');

const API_KEY = process.env.BUNGIE_API_KEY || 'YOUR_BUNGIE_API_KEY';

// Leviathan hashes to verify
const LEVIATHAN_HASHES = {
  'Leviathan (Base)': [
    '89727599', '287649202', '417231112', '508802457', '757116822', '771164842',
    '1685065161', '1699948563', '1800508819', '1875726950',
    '2693136600', '2693136601', '2693136602', '2693136603', '2693136604', '2693136605',
    '3916343513', '4039317196', '2449714930', '3857338478', '3446541099'
  ],
  'Leviathan, Eater of Worlds': [
    '2164432138', '809170886', '3089205900'
  ],
  'Leviathan, Spire of Stars': [
    '119944200', '3004605630', '3213556450'
  ]
};

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function fetchManifest() {
  console.log('Fetching manifest metadata...');
  const manifestMeta = await httpsGet('https://www.bungie.net/Platform/Destiny2/Manifest/', {
    'X-API-Key': API_KEY
  });
  
  const enPath = manifestMeta.Response.jsonWorldComponentContentPaths.en;
  console.log('Fetching activity definitions...');
  
  const activityDefs = await httpsGet('https://www.bungie.net' + enPath.DestinyActivityDefinition, {
    'X-API-Key': API_KEY
  });
  
  return activityDefs;
}

function isRaid(def) {
  const typeHash = def.activityTypeHash;
  const modeTypes = def.activityModeTypes || [];
  return typeHash === 2043403989 || modeTypes.includes(4);
}

(async () => {
  try {
    if (API_KEY === 'YOUR_BUNGIE_API_KEY') {
      console.error('ERROR: Please set BUNGIE_API_KEY environment variable');
      console.error('Example: set BUNGIE_API_KEY=your_key_here && node scripts/verify-leviathan-hashes.js');
      process.exit(1);
    }

    const defs = await fetchManifest();
    
    console.log('=== VERIFYING LEVIATHAN HASHES ===\n');
    
    let foundCount = 0;
    let notFoundCount = 0;
    const notFound = [];
    const invalid = [];
    
    for (const [raidName, hashes] of Object.entries(LEVIATHAN_HASHES)) {
      console.log(`\n--- ${raidName} ---`);
      for (const hash of hashes) {
        const def = defs[hash];
        if (!def) {
          console.log(`  ❌ ${hash}: NOT FOUND in manifest`);
          notFound.push({ raidName, hash });
          notFoundCount++;
        } else {
          const name = def.displayProperties?.name || 'Unknown';
          const isRaidType = isRaid(def);
          const activityTypeHash = def.activityTypeHash;
          const modeTypes = def.activityModeTypes || [];
          
          if (!isRaidType) {
            console.log(`  ⚠️  ${hash}: Found but NOT a raid (name: "${name}", typeHash: ${activityTypeHash}, modes: ${modeTypes.join(',')})`);
            invalid.push({ raidName, hash, name, activityTypeHash, modeTypes });
          } else {
            const nameMatch = name.toLowerCase().includes('leviathan') || 
                            name.toLowerCase().includes('eater') ||
                            name.toLowerCase().includes('spire');
            if (nameMatch) {
              console.log(`  ✅ ${hash}: "${name}" (TypeHash: ${activityTypeHash}, Modes: ${modeTypes.join(',')})`);
              foundCount++;
            } else {
              console.log(`  ⚠️  ${hash}: Found but name doesn't match: "${name}"`);
              invalid.push({ raidName, hash, name, activityTypeHash, modeTypes });
            }
          }
        }
      }
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`✅ Found and valid: ${foundCount}`);
    console.log(`❌ Not found: ${notFoundCount}`);
    console.log(`⚠️  Found but invalid/mismatched: ${invalid.length}`);
    
    if (notFound.length > 0) {
      console.log('\n=== NOT FOUND HASHES ===');
      notFound.forEach(item => {
        console.log(`${item.raidName}: ${item.hash}`);
      });
    }
    
    if (invalid.length > 0) {
      console.log('\n=== INVALID/MISMATCHED HASHES ===');
      invalid.forEach(item => {
        console.log(`${item.raidName}: ${item.hash} - "${item.name}" (typeHash: ${item.activityTypeHash}, modes: [${item.modeTypes.join(', ')}])`);
      });
    }
    
    // Also search for any Leviathan raids we might have missed
    console.log('\n=== SEARCHING FOR ALL LEVIATHAN-RELATED ACTIVITIES IN MANIFEST ===');
    const allLeviathan = Object.entries(defs)
      .filter(([hash, def]) => {
        const name = (def.displayProperties?.name || '').toLowerCase();
        return (name.includes('leviathan') || name.includes('eater of worlds') || name.includes('spire of stars')) && isRaid(def);
      })
      .map(([hash, def]) => ({
        hash,
        name: def.displayProperties?.name || 'Unknown',
        activityTypeHash: def.activityTypeHash,
        modeTypes: def.activityModeTypes || []
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    if (allLeviathan.length > 0) {
      console.log(`\nFound ${allLeviathan.length} Leviathan-related raids in manifest:`);
      allLeviathan.forEach(a => {
        const inOurList = Object.values(LEVIATHAN_HASHES).flat().includes(a.hash);
        const marker = inOurList ? '✅' : '🆕';
        console.log(`  ${marker} ${a.hash}: "${a.name}"`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();

