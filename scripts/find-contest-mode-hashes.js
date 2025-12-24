const https = require('https');
const fs = require('fs');

// === CONFIGURATION ===
const API_KEY = process.env.BUNGIE_API_KEY || 'e55082388d014a79b9f5da4be0063d1c'; // Replace with your API key

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        ...headers
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
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

function isContestMode(def) {
  const name = def.displayProperties?.name || '';
  const nameLower = name.toLowerCase();
  return nameLower.includes('contest') || nameLower.includes('day one');
}

function isRaidOrDungeon(def) {
  const typeHash = def.activityTypeHash;
  const modeTypes = def.activityModeTypes || [];
  
  // Raid type hash: 2043403989, mode 4
  // Dungeon type hash: 608898761, mode 82
  const isRaid = typeHash === 2043403989 || modeTypes.includes(4);
  const isDungeon = typeHash === 608898761 || modeTypes.includes(82);
  
  return isRaid || isDungeon;
}

async function main() {
  try {
    console.log('Starting contest mode hash discovery...\n');
    
    const activityDefs = await fetchManifest();
    const activities = activityDefs.DestinyActivityDefinition || activityDefs;
    
    console.log(`Loaded ${Object.keys(activities).length} activity definitions\n`);
    
    const contestModeActivities = [];
    
    for (const [hash, def] of Object.entries(activities)) {
      if (isContestMode(def) && isRaidOrDungeon(def)) {
        const name = def.displayProperties?.name || 'Unknown';
        const typeHash = def.activityTypeHash;
        const modeTypes = def.activityModeTypes || [];
        const isRaid = typeHash === 2043403989 || modeTypes.includes(4);
        const isDungeon = typeHash === 608898761 || modeTypes.includes(82);
        const activityType = isRaid ? 'Raid' : isDungeon ? 'Dungeon' : 'Unknown';
        
        contestModeActivities.push({
          hash: parseInt(hash),
          name,
          activityType,
          modeTypes,
          typeHash
        });
      }
    }
    
    // Sort by hash for easier reading
    contestModeActivities.sort((a, b) => a.hash - b.hash);
    
    console.log(`Found ${contestModeActivities.length} contest mode activities:\n`);
    console.log('='.repeat(80));
    
    const contestHashes = [];
    const contestByType = { Raid: [], Dungeon: [] };
    
    for (const activity of contestModeActivities) {
      console.log(`Hash: ${activity.hash}`);
      console.log(`  Name: ${activity.name}`);
      console.log(`  Type: ${activity.activityType}`);
      console.log(`  Mode Types: [${activity.modeTypes.join(', ')}]`);
      console.log(`  Type Hash: ${activity.typeHash}`);
      console.log('');
      
      contestHashes.push(activity.hash);
      if (activity.activityType === 'Raid') {
        contestByType.Raid.push(activity);
      } else if (activity.activityType === 'Dungeon') {
        contestByType.Dungeon.push(activity);
      }
    }
    
    console.log('='.repeat(80));
    console.log(`\nSummary:`);
    console.log(`  Total Contest Mode Activities: ${contestModeActivities.length}`);
    console.log(`  Raids: ${contestByType.Raid.length}`);
    console.log(`  Dungeons: ${contestByType.Dungeon.length}`);
    
    console.log(`\nAll Contest Mode Hashes:`);
    console.log(contestHashes.map(h => `'${h}'`).join(', '));
    
    // Generate code snippet for ACTIVITY_FAMILY_MAP
    console.log(`\n\nCode snippet for ACTIVITY_FAMILY_MAP:`);
    console.log('// Contest Mode Activities');
    for (const activity of contestModeActivities) {
      const baseName = activity.name.split(':')[0].trim();
      const variant = activity.name.includes(':') ? activity.name.split(':')[1].trim() : 'Contest';
      console.log(`'${activity.hash}': '${baseName}: ${variant}',`);
    }
    
    // Save to file
    const output = {
      total: contestModeActivities.length,
      raids: contestByType.Raid.length,
      dungeons: contestByType.Dungeon.length,
      activities: contestModeActivities,
      hashes: contestHashes
    };
    
    fs.writeFileSync('contest-mode-hashes.json', JSON.stringify(output, null, 2));
    console.log('\n\nResults saved to contest-mode-hashes.json');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();





