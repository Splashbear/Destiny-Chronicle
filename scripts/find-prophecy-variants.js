// Find all Prophecy variants
const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';

async function findProphecyVariants() {
  try {
    const manifestResponse = await fetch('https://www.bungie.net/Platform/Destiny2/Manifest/', {
      headers: { 'X-API-Key': API_KEY }
    });
    const manifestData = await manifestResponse.json();
    
    const activityDefUrl = 'https://www.bungie.net' + manifestData.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition;
    const activityDefResponse = await fetch(activityDefUrl);
    const activityDefs = await activityDefResponse.json();
    
    console.log('=== PROPHECY VARIANTS ===\n');
    
    for (const [hash, def] of Object.entries(activityDefs)) {
      const name = def.displayProperties?.name || '';
      if (name.toLowerCase().includes('prophecy') && !name.toLowerCase().includes('test')) {
        console.log(`Hash: ${hash}`);
        console.log(`Name: ${name}`);
        console.log(`Type Hash: ${def.activityTypeHash}`);
        console.log(`Mode Types: ${(def.activityModeTypes || []).join(', ')}`);
        console.log('---');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

findProphecyVariants();
