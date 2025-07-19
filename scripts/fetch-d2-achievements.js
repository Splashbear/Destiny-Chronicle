const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';
const manifestDir = path.join(__dirname, '../src/assets/manifest');
const outputFile = path.join(manifestDir, 'd2-achievements.json');

async function fetchManifestIndex() {
  const url = 'https://www.bungie.net/Platform/Destiny2/Manifest/';
  const res = await axios.get(url, { headers: { 'X-API-Key': API_KEY } });
  return res.data.Response.jsonWorldComponentContentPaths.en.DestinyRecordDefinition;
}

async function fetchRecordDefinitions(defUrl) {
  const url = `https://www.bungie.net${defUrl}`;
  const res = await axios.get(url);
  return res.data;
}

function filterAchievements(defs) {
  const achievements = {};
  let count = 0;
  
  for (const [hash, def] of Object.entries(defs)) {
    // Filter for meaningful achievements/triumphs
    if (def.displayProperties && 
        def.displayProperties.name && 
        def.displayProperties.name.trim() !== '' &&
        def.displayProperties.description &&
        def.displayProperties.description.trim() !== '' &&
        !def.redacted &&
        def.scope !== undefined) {
      
      // Skip certain categories we don't want
      const skipPatterns = [
        /^Classified$/i,
        /^Redacted$/i,
        /^\[Redacted\]$/i,
        /^$/, // Empty names
        /^Season \d+/i, // Season-specific that might be outdated
      ];
      
      const shouldSkip = skipPatterns.some(pattern => 
        pattern.test(def.displayProperties.name) || 
        pattern.test(def.displayProperties.description)
      );
      
      if (!shouldSkip) {
        achievements[hash] = {
          hash: parseInt(hash),
          name: def.displayProperties.name,
          description: def.displayProperties.description,
          icon: def.displayProperties.icon,
          hasIcon: def.displayProperties.hasIcon,
          scope: def.scope, // 0 = Account, 1 = Character
          presentationInfo: def.presentationInfo,
          rewardItems: def.rewardItems || [],
          titleInfo: def.titleInfo,
          completionInfo: def.completionInfo,
          // Add some categorization
          category: categorizeAchievement(def)
        };
        count++;
        
        // Limit to prevent huge file
        if (count >= 500) break;
      }
    }
  }
  
  return achievements;
}

function categorizeAchievement(def) {
  const name = def.displayProperties.name.toLowerCase();
  const desc = def.displayProperties.description.toLowerCase();
  
  if (name.includes('raid') || desc.includes('raid')) return 'raid';
  if (name.includes('dungeon') || desc.includes('dungeon')) return 'dungeon';
  if (name.includes('crucible') || desc.includes('crucible') || name.includes('pvp')) return 'crucible';
  if (name.includes('gambit') || desc.includes('gambit')) return 'gambit';
  if (name.includes('strike') || desc.includes('strike')) return 'strike';
  if (name.includes('nightfall') || desc.includes('nightfall')) return 'nightfall';
  if (name.includes('patrol') || desc.includes('patrol') || name.includes('explore')) return 'exploration';
  if (name.includes('season') || desc.includes('season')) return 'seasonal';
  if (def.titleInfo && def.titleInfo.hasTitle) return 'title';
  if (name.includes('triumph') || desc.includes('triumph')) return 'triumph';
  
  return 'general';
}

(async () => {
  try {
    if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });

    console.log('Fetching Destiny 2 manifest index...');
    const defPath = await fetchManifestIndex();
    console.log('DestinyRecordDefinition path:', defPath);

    console.log('Downloading DestinyRecordDefinition...');
    const defs = await fetchRecordDefinitions(defPath);

    console.log('Filtering for achievements/triumphs...');
    const achievements = filterAchievements(defs);

    fs.writeFileSync(outputFile, JSON.stringify(achievements, null, 2));
    console.log(`Done! Saved ${Object.keys(achievements).length} achievement definitions to ${outputFile}`);
    
    // Show some examples
    console.log('\nSample achievements:');
    const samples = Object.values(achievements).slice(0, 5);
    samples.forEach(ach => {
      console.log(`- ${ach.name} (${ach.category}): ${ach.description.substring(0, 60)}...`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  }
})();