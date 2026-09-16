// Script to verify all dungeon variants are mapped
const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';

const DUNGEON_NAMES = [
  'Shattered Throne',
  'Pit of Heresy',
  'Prophecy',
  'Grasp of Avarice',
  'Duality',
  'Spire of the Watcher',
  'Ghosts of the Deep',
  "Warlord's Ruin",
  "Vesper's Host",
  'Sundered Doctrine',
  'Equilibrium',
];

// Known hashes from codebase (activity-db.service.ts)
const KNOWN_DUNGEON_HASHES = new Set([
  // Shattered Throne
  '2032534090', '1347078175',
  // Pit of Heresy
  '1375089621', '785700673', '785700678', '2559374368', '2559374374', '2559374375', '2582501063',
  // Prophecy
  '1077850348', '3637651331', '1788465402', '715153594', '3193125350', '3193152350', '4148187374',
  // Grasp of Avarice
  '1112917203', '3774021532', '4078656646',
  // Duality
  '2823159265', '1668217731', '3012587626',
  // Spire of the Watcher
  '1262462921', '1225969316', '943878085', '4046934917', '3339002067', '2296818662', '1801496203',
  // Ghosts of the Deep
  '313828469', '1094262727', '4190119662', '2961030534', '124340010', '2716998124',
  // Warlord's Ruin
  '2004855007', '2534833093',
  // Vesper's Host
  '300092127', '1915770060', '3492566689', '4293676253',
  // Sundered Doctrine
  '247869137', '3834447244', '3521648250',
  // Equilibrium
  '1754635208', '2727361621',
]);

async function verifyDungeonVariants() {
  try {
    console.log('Fetching D2 manifest...');
    
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
    
    console.log('Searching for dungeon activities...\n');
    
    const dungeonsByName = new Map();
    
    for (const [hash, def] of Object.entries(activityDefs)) {
      const name = def.displayProperties?.name || '';
      const isDungeon = def.activityModeTypes?.includes(82) || def.activityTypeHash === 608898761;
      
      if (isDungeon) {
        for (const dungeonName of DUNGEON_NAMES) {
          if (name.includes(dungeonName)) {
            if (!dungeonsByName.has(dungeonName)) {
              dungeonsByName.set(dungeonName, []);
            }
            dungeonsByName.get(dungeonName).push({
              hash,
              name,
              activityTypeHash: def.activityTypeHash,
              activityModeTypes: def.activityModeTypes || [],
              isMapped: KNOWN_DUNGEON_HASHES.has(hash),
            });
            break;
          }
        }
      }
    }
    
    let hasUnmappedVariants = false;
    
    for (const [dungeonName, variants] of Array.from(dungeonsByName.entries()).sort()) {
      console.log(`\n=== ${dungeonName} ===`);
      
      const unmappedVariants = variants.filter(v => !v.isMapped);
      const mappedVariants = variants.filter(v => v.isMapped);
      
      console.log(`  Mapped variants: ${mappedVariants.length}`);
      mappedVariants.forEach(v => {
        console.log(`    ✅ ${v.hash}: ${v.name}`);
      });
      
      if (unmappedVariants.length > 0) {
        hasUnmappedVariants = true;
        console.log(`  ⚠️  Unmapped variants: ${unmappedVariants.length}`);
        unmappedVariants.forEach(v => {
          console.log(`    ❌ ${v.hash}: ${v.name}`);
          console.log(`       Type: ${v.activityTypeHash}, Modes: ${v.activityModeTypes.join(', ')}`);
        });
      }
    }
    
    if (hasUnmappedVariants) {
      console.log('\n⚠️  UNMAPPED VARIANTS FOUND! These should be added to ACTIVITY_FAMILY_MAP.');
    } else {
      console.log('\n✅ All dungeon variants are properly mapped!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

verifyDungeonVariants();
