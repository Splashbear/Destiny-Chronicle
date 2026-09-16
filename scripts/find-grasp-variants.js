// Script to find all Grasp of Avarice activity variants
const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';

async function findGraspVariants() {
  try {
    console.log('Fetching D2 manifest...');
    
    // Get manifest URLs
    const manifestResponse = await fetch('https://www.bungie.net/Platform/Destiny2/Manifest/', {
      headers: { 'X-API-Key': API_KEY }
    });
    const manifestData = await manifestResponse.json();
    
    if (manifestData.ErrorStatus !== 'Success') {
      console.error('Failed to fetch manifest:', manifestData.Message);
      return;
    }
    
    const activityDefUrl = 'https://www.bungie.net' + manifestData.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition;
    
    console.log('Downloading DestinyActivityDefinition...');
    const activityDefResponse = await fetch(activityDefUrl);
    const activityDefs = await activityDefResponse.json();
    
    console.log('Searching for Grasp of Avarice activities...');
    
    const graspActivities = [];
    for (const [hash, def] of Object.entries(activityDefs)) {
      const name = def.displayProperties?.name || '';
      if (name.toLowerCase().includes('grasp') && name.toLowerCase().includes('avarice')) {
        graspActivities.push({
          hash,
          name,
          activityTypeHash: def.activityTypeHash,
          activityModeTypes: def.activityModeTypes || [],
          activityModeHashes: def.activityModeHashes || [],
        });
      }
    }
    
    console.log('\n=== GRASP OF AVARICE VARIANTS ===\n');
    graspActivities.forEach(activity => {
      console.log(`Hash: ${activity.hash}`);
      console.log(`Name: ${activity.name}`);
      console.log(`Type Hash: ${activity.activityTypeHash}`);
      console.log(`Mode Types: ${activity.activityModeTypes.join(', ')}`);
      console.log(`Mode Hashes: ${activity.activityModeHashes.join(', ')}`);
      console.log('---');
    });
    
    console.log(`\nTotal Grasp of Avarice variants found: ${graspActivities.length}`);
    
    // Check which ones are missing from our codebase
    const knownHashes = ['1112917203', '4078656646'];
    const missingActivities = graspActivities.filter(a => !knownHashes.includes(a.hash));
    
    if (missingActivities.length > 0) {
      console.log('\n⚠️  MISSING FROM CODEBASE:');
      missingActivities.forEach(activity => {
        console.log(`  '${activity.hash}': 'Grasp of Avarice: <VARIANT>',`);
      });
    } else {
      console.log('\n✅ All Grasp of Avarice variants are mapped in the codebase.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

findGraspVariants();
