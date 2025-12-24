// Script to verify all raid and dungeon hashes against the Bungie API manifest
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.BUNGIE_API_KEY || 'YOUR_BUNGIE_API_KEY';

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

function isDungeon(def) {
  const typeHash = def.activityTypeHash;
  const modeTypes = def.activityModeTypes || [];
  return typeHash === 1375089621 || modeTypes.includes(82);
}

function extractHashAndMapping(line) {
  const match = line.match(/'(\d+)':\s*'([^']+)'/);
  if (match) {
    return { hash: match[1], mapping: match[2] };
  }
  return null;
}

function parseActivityDbService() {
  const servicePath = path.join(__dirname, '../src/app/services/activity-db.service.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  const lines = content.split('\n');
  
  const raids = [];
  const dungeons = [];
  let inRaidSection = false;
  let inDungeonSection = false;
  let inD1Section = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track which section we're in
    if (line.includes('Destiny 2 Raids')) {
      inRaidSection = true;
      inDungeonSection = false;
      inD1Section = false;
      continue;
    }
    if (line.includes('Destiny 2 Dungeons')) {
      inRaidSection = false;
      inDungeonSection = true;
      inD1Section = false;
      continue;
    }
    if (line.includes('Destiny 1 Raids')) {
      inRaidSection = false;
      inDungeonSection = false;
      inD1Section = true;
      continue;
    }
    
    // Skip D1 section
    if (inD1Section) continue;
    
    // Extract hash and mapping
    const extracted = extractHashAndMapping(line);
    if (extracted) {
      if (inRaidSection) {
        raids.push(extracted);
      } else if (inDungeonSection) {
        dungeons.push(extracted);
      }
    }
  }
  
  return { raids, dungeons };
}

(async () => {
  try {
    if (API_KEY === 'YOUR_BUNGIE_API_KEY') {
      console.error('ERROR: Please set BUNGIE_API_KEY environment variable');
      console.error('Example: set BUNGIE_API_KEY=your_key_here && node scripts/verify-all-raids-dungeons.js');
      process.exit(1);
    }

    console.log('Parsing activity-db.service.ts...\n');
    const { raids, dungeons } = parseActivityDbService();
    console.log(`Found ${raids.length} raid hashes and ${dungeons.length} dungeon hashes in codebase\n`);
    
    const defs = await fetchManifest();
    
    console.log('=== VERIFYING RAIDS ===\n');
    
    const raidResults = {
      valid: [],
      notFound: [],
      wrongType: [],
      nameMismatch: []
    };
    
    for (const { hash, mapping } of raids) {
      const def = defs[hash];
      if (!def) {
        raidResults.notFound.push({ hash, mapping });
        console.log(`  ❌ ${hash}: NOT FOUND in manifest (mapped as: "${mapping}")`);
      } else {
        const name = def.displayProperties?.name || 'Unknown';
        const isRaidType = isRaid(def);
        const activityTypeHash = def.activityTypeHash;
        const modeTypes = def.activityModeTypes || [];
        
        if (!isRaidType) {
          raidResults.wrongType.push({ hash, mapping, name, activityTypeHash, modeTypes });
          console.log(`  ⚠️  ${hash}: NOT a raid (name: "${name}", typeHash: ${activityTypeHash}, modes: [${modeTypes.join(', ')}], mapped as: "${mapping}")`);
        } else {
          // Check if name roughly matches (allow for variant differences)
          const mappedName = mapping.split(':')[0].trim().toLowerCase();
          const actualName = name.split(':')[0].trim().toLowerCase();
          const nameMatch = actualName.includes(mappedName) || mappedName.includes(actualName) ||
                          (actualName.includes('leviathan') && mappedName.includes('leviathan')) ||
                          (actualName.includes('vault') && mappedName.includes('vault')) ||
                          (actualName.includes('king') && mappedName.includes('king')) ||
                          (actualName.includes('crota') && mappedName.includes('crota'));
          
          if (nameMatch) {
            raidResults.valid.push({ hash, mapping, name });
            console.log(`  ✅ ${hash}: "${name}" (mapped as: "${mapping}")`);
          } else {
            raidResults.nameMismatch.push({ hash, mapping, name, activityTypeHash, modeTypes });
            console.log(`  ⚠️  ${hash}: Name mismatch - mapped as "${mapping}" but manifest shows "${name}"`);
          }
        }
      }
    }
    
    console.log('\n=== VERIFYING DUNGEONS ===\n');
    
    const dungeonResults = {
      valid: [],
      notFound: [],
      wrongType: [],
      nameMismatch: []
    };
    
    for (const { hash, mapping } of dungeons) {
      const def = defs[hash];
      if (!def) {
        dungeonResults.notFound.push({ hash, mapping });
        console.log(`  ❌ ${hash}: NOT FOUND in manifest (mapped as: "${mapping}")`);
      } else {
        const name = def.displayProperties?.name || 'Unknown';
        const isDungeonType = isDungeon(def);
        const activityTypeHash = def.activityTypeHash;
        const modeTypes = def.activityModeTypes || [];
        
        if (!isDungeonType) {
          dungeonResults.wrongType.push({ hash, mapping, name, activityTypeHash, modeTypes });
          console.log(`  ⚠️  ${hash}: NOT a dungeon (name: "${name}", typeHash: ${activityTypeHash}, modes: [${modeTypes.join(', ')}], mapped as: "${mapping}")`);
        } else {
          // Check if name roughly matches (allow for variant differences)
          const mappedName = mapping.split(':')[0].trim().toLowerCase();
          const actualName = name.split(':')[0].trim().toLowerCase();
          const nameMatch = actualName.includes(mappedName) || mappedName.includes(actualName) ||
                          (actualName.includes('shattered') && mappedName.includes('shattered')) ||
                          (actualName.includes('pit') && mappedName.includes('pit')) ||
                          (actualName.includes('prophecy') && mappedName.includes('prophecy'));
          
          if (nameMatch) {
            dungeonResults.valid.push({ hash, mapping, name });
            console.log(`  ✅ ${hash}: "${name}" (mapped as: "${mapping}")`);
          } else {
            dungeonResults.nameMismatch.push({ hash, mapping, name, activityTypeHash, modeTypes });
            console.log(`  ⚠️  ${hash}: Name mismatch - mapped as "${mapping}" but manifest shows "${name}"`);
          }
        }
      }
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`\nRAIDS:`);
    console.log(`  ✅ Valid: ${raidResults.valid.length}`);
    console.log(`  ❌ Not found: ${raidResults.notFound.length}`);
    console.log(`  ⚠️  Wrong type: ${raidResults.wrongType.length}`);
    console.log(`  ⚠️  Name mismatch: ${raidResults.nameMismatch.length}`);
    
    console.log(`\nDUNGEONS:`);
    console.log(`  ✅ Valid: ${dungeonResults.valid.length}`);
    console.log(`  ❌ Not found: ${dungeonResults.notFound.length}`);
    console.log(`  ⚠️  Wrong type: ${dungeonResults.wrongType.length}`);
    console.log(`  ⚠️  Name mismatch: ${dungeonResults.nameMismatch.length}`);
    
    if (raidResults.notFound.length > 0) {
      console.log('\n=== RAIDS NOT FOUND ===');
      raidResults.notFound.forEach(item => {
        console.log(`  ${item.hash}: "${item.mapping}"`);
      });
    }
    
    if (raidResults.wrongType.length > 0) {
      console.log('\n=== RAIDS WITH WRONG TYPE ===');
      raidResults.wrongType.forEach(item => {
        console.log(`  ${item.hash}: mapped as "${item.mapping}", but manifest shows "${item.name}" (typeHash: ${item.activityTypeHash}, modes: [${item.modeTypes.join(', ')}])`);
      });
    }
    
    if (raidResults.nameMismatch.length > 0) {
      console.log('\n=== RAIDS WITH NAME MISMATCH ===');
      raidResults.nameMismatch.forEach(item => {
        console.log(`  ${item.hash}: mapped as "${item.mapping}", but manifest shows "${item.name}"`);
      });
    }
    
    if (dungeonResults.notFound.length > 0) {
      console.log('\n=== DUNGEONS NOT FOUND ===');
      dungeonResults.notFound.forEach(item => {
        console.log(`  ${item.hash}: "${item.mapping}"`);
      });
    }
    
    if (dungeonResults.wrongType.length > 0) {
      console.log('\n=== DUNGEONS WITH WRONG TYPE ===');
      dungeonResults.wrongType.forEach(item => {
        console.log(`  ${item.hash}: mapped as "${item.mapping}", but manifest shows "${item.name}" (typeHash: ${item.activityTypeHash}, modes: [${item.modeTypes.join(', ')}])`);
      });
    }
    
    if (dungeonResults.nameMismatch.length > 0) {
      console.log('\n=== DUNGEONS WITH NAME MISMATCH ===');
      dungeonResults.nameMismatch.forEach(item => {
        console.log(`  ${item.hash}: mapped as "${item.mapping}", but manifest shows "${item.name}"`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
















