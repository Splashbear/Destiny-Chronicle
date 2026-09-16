// Quick script to check which dungeon uses hash 2961030534
const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';

async function checkHash() {
  try {
    const manifestResponse = await fetch('https://www.bungie.net/Platform/Destiny2/Manifest/', {
      headers: { 'X-API-Key': API_KEY }
    });
    const manifestData = await manifestResponse.json();
    
    const activityDefUrl = 'https://www.bungie.net' + manifestData.Response.jsonWorldComponentContentPaths.en.DestinyActivityDefinition;
    const activityDefResponse = await fetch(activityDefUrl);
    const activityDefs = await activityDefResponse.json();
    
    const hash = '2961030534';
    const def = activityDefs[hash];
    
    if (def) {
      console.log(`Hash ${hash}:`);
      console.log(`  Name: ${def.displayProperties?.name || 'Unknown'}`);
      console.log(`  Type Hash: ${def.activityTypeHash}`);
      console.log(`  Mode Types: ${(def.activityModeTypes || []).join(', ')}`);
    } else {
      console.log(`Hash ${hash} not found in manifest`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkHash();
