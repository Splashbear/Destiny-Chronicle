const fetch = require('node-fetch');
const API_KEY = 'YOUR_BUNGIE_API_KEY';

async function fetchManifest() {
  const manifestMeta = await fetch('https://www.bungie.net/Platform/Destiny2/Manifest/', {
    headers: { 'X-API-Key': API_KEY }
  }).then(res => res.json());
  const enPath = manifestMeta.Response.jsonWorldComponentContentPaths.en;
  const activityDefs = await fetch('https://www.bungie.net' + enPath.DestinyActivityDefinition, {
    headers: { 'X-API-Key': API_KEY }
  }).then(res => res.json());
  return activityDefs;
}

function isRaidOrDungeon(def) {
  // Known type hashes for raids/dungeons
  const RAID_TYPE_HASH = 2043403989;
  const DUNGEON_TYPE_HASH = 1375089621;
  const modeTypes = def.activityModeTypes || [];
  return (
    def.activityTypeHash === RAID_TYPE_HASH ||
    def.activityTypeHash === DUNGEON_TYPE_HASH ||
    modeTypes.includes(4) || // Raid
    modeTypes.includes(82)   // Dungeon
  );
}

(async () => {
  try {
    const defs = await fetchManifest();
    const raidsAndDungeons = Object.entries(defs)
      .filter(([hash, def]) => isRaidOrDungeon(def))
      .map(([hash, def]) => ({
        hash,
        name: def.displayProperties?.name,
        type: def.activityTypeHash === 2043403989 ? 'raid'
             : def.activityTypeHash === 1375089621 ? 'dungeon'
             : (def.activityModeTypes || []).includes(4) ? 'raid'
             : (def.activityModeTypes || []).includes(82) ? 'dungeon'
             : 'unknown',
        modeTypes: def.activityModeTypes,
      }));

    console.log('--- Destiny 2 Raids and Dungeons (hash, name, type) ---');
    raidsAndDungeons.forEach(a => {
      console.log(`${a.hash}: ${a.name} [${a.type}]`);
    });
    console.log(`\nTotal found: ${raidsAndDungeons.length}`);
  } catch (err) {
    console.error('Error fetching or processing data:', err);
  }
})();