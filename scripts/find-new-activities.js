// Script to find new raid and dungeon hashes from the Bungie API manifest
// Specifically looks for "Desert Perpetual" raid and "Equilibrium" dungeon

const fetch = require('node-fetch');

// You'll need to set your Bungie API key here
const API_KEY = process.env.BUNGIE_API_KEY || 'YOUR_BUNGIE_API_KEY';

async function fetchManifest() {
  console.log('Fetching manifest metadata...');
  const manifestMeta = await fetch('https://www.bungie.net/Platform/Destiny2/Manifest/', {
    headers: { 'X-API-Key': API_KEY }
  }).then(res => res.json());
  
  const enPath = manifestMeta.Response.jsonWorldComponentContentPaths.en;
  console.log('Fetching activity definitions...');
  
  const activityDefs = await fetch('https://www.bungie.net' + enPath.DestinyActivityDefinition, {
    headers: { 'X-API-Key': API_KEY }
  }).then(res => res.json());
  
  return activityDefs.DestinyActivityDefinition || activityDefs;
}

function isRaid(def) {
  const RAID_TYPE_HASH = 2043403989;
  const modeTypes = def.activityModeTypes || [];
  return def.activityTypeHash === RAID_TYPE_HASH || modeTypes.includes(4);
}

function isDungeon(def) {
  const DUNGEON_TYPE_HASH = 1375089621;
  const DUNGEON_TYPE_HASH_ALT = 608898761;
  const modeTypes = def.activityModeTypes || [];
  return def.activityTypeHash === DUNGEON_TYPE_HASH || 
         def.activityTypeHash === DUNGEON_TYPE_HASH_ALT ||
         modeTypes.includes(82);
}

function normalizeName(name) {
  if (!name) return '';
  // Remove variant suffixes to get base name
  return name.split(':')[0].trim();
}

(async () => {
  try {
    if (API_KEY === 'YOUR_BUNGIE_API_KEY') {
      console.error('ERROR: Please set BUNGIE_API_KEY environment variable or update the script with your API key');
      console.error('Example: set BUNGIE_API_KEY=your_key_here && node scripts/find-new-activities.js');
      process.exit(1);
    }

    const defs = await fetchManifest();
    
    console.log('\n=== Searching for Desert Perpetual Raid ===\n');
    const desertPerpetual = Object.entries(defs)
      .filter(([hash, def]) => {
        const name = def.displayProperties?.name || '';
        return isRaid(def) && (
          name.toLowerCase().includes('desert') ||
          name.toLowerCase().includes('perpetual')
        );
      })
      .map(([hash, def]) => ({
        hash,
        name: def.displayProperties?.name || 'Unknown',
        variant: def.displayProperties?.name?.includes(':') 
          ? def.displayProperties.name.split(':')[1].trim() 
          : 'Base',
        activityTypeHash: def.activityTypeHash,
        modeTypes: def.activityModeTypes || [],
        pgcrImage: def.pgcrImage
      }));

    if (desertPerpetual.length > 0) {
      console.log('Found Desert Perpetual variants:');
      desertPerpetual.forEach(a => {
        console.log(`  '${a.hash}': '${a.name}',`);
      });
      console.log('\nAdd these to ACTIVITY_FAMILY_MAP in activity-db.service.ts');
    } else {
      console.log('⚠️  Desert Perpetual Raid not found in manifest');
      console.log('   It may not be released yet, or the name may be different.');
    }

    console.log('\n=== Searching for Equilibrium Dungeon ===\n');
    const equilibrium = Object.entries(defs)
      .filter(([hash, def]) => {
        const name = def.displayProperties?.name || '';
        return isDungeon(def) && (
          name.toLowerCase().includes('equilibrium') ||
          name.toLowerCase().includes('cosmic equilibrium')
        );
      })
      .map(([hash, def]) => ({
        hash,
        name: def.displayProperties?.name || 'Unknown',
        variant: def.displayProperties?.name?.includes(':') 
          ? def.displayProperties.name.split(':')[1].trim() 
          : 'Base',
        activityTypeHash: def.activityTypeHash,
        modeTypes: def.activityModeTypes || [],
        pgcrImage: def.pgcrImage
      }));

    if (equilibrium.length > 0) {
      console.log('Found Equilibrium variants:');
      equilibrium.forEach(a => {
        console.log(`  '${a.hash}': '${a.name}',`);
      });
      console.log('\nAdd these to ACTIVITY_FAMILY_MAP in activity-db.service.ts');
    } else {
      console.log('⚠️  Equilibrium Dungeon not found in manifest');
      console.log('   It may not be released yet, or the name may be different.');
    }

    // Also list all raids and dungeons for reference
    console.log('\n=== All Recent Raids (for reference) ===\n');
    const allRaids = Object.entries(defs)
      .filter(([hash, def]) => isRaid(def))
      .map(([hash, def]) => ({
        hash,
        name: def.displayProperties?.name || 'Unknown',
        baseName: normalizeName(def.displayProperties?.name)
      }))
      .filter(a => {
        const name = a.baseName.toLowerCase();
        // Filter to recent/important raids
        return name.includes('salvation') || 
               name.includes('desert') || 
               name.includes('perpetual') ||
               name.includes('crota') ||
               name.includes('vow') ||
               name.includes('root') ||
               name.includes('kings fall') ||
               name.includes('vault of glass');
      })
      .sort((a, b) => a.baseName.localeCompare(b.baseName));

    const uniqueRaids = new Map();
    allRaids.forEach(r => {
      if (!uniqueRaids.has(r.baseName)) {
        uniqueRaids.set(r.baseName, []);
      }
      uniqueRaids.get(r.baseName).push(r);
    });

    for (const [baseName, variants] of uniqueRaids) {
      console.log(`${baseName}:`);
      variants.forEach(v => console.log(`  ${v.hash} - ${v.name}`));
    }

    console.log('\n=== All Recent Dungeons (for reference) ===\n');
    const allDungeons = Object.entries(defs)
      .filter(([hash, def]) => isDungeon(def))
      .map(([hash, def]) => ({
        hash,
        name: def.displayProperties?.name || 'Unknown',
        baseName: normalizeName(def.displayProperties?.name)
      }))
      .filter(a => {
        const name = a.baseName.toLowerCase();
        // Filter to recent/important dungeons
        return name.includes('equilibrium') || 
               name.includes('sundered') ||
               name.includes('vesper') ||
               name.includes('warlord') ||
               name.includes('ghosts') ||
               name.includes('spire of the watcher') ||
               name.includes('duality');
      })
      .sort((a, b) => a.baseName.localeCompare(b.baseName));

    const uniqueDungeons = new Map();
    allDungeons.forEach(d => {
      if (!uniqueDungeons.has(d.baseName)) {
        uniqueDungeons.set(d.baseName, []);
      }
      uniqueDungeons.get(d.baseName).push(d);
    });

    for (const [baseName, variants] of uniqueDungeons) {
      console.log(`${baseName}:`);
      variants.forEach(v => console.log(`  ${v.hash} - ${v.name}`));
    }

  } catch (err) {
    console.error('Error:', err.message);
    if (err.message.includes('API')) {
      console.error('\nMake sure you have set your BUNGIE_API_KEY environment variable');
    }
  }
})();

