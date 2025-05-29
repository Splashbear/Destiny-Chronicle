const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';
const manifestDir = path.join(__dirname, '../src/assets/manifest');
const outputFile = path.join(manifestDir, 'd2-title-definitions.json');

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

function filterTitles(defs) {
  const titles = {};
  for (const [hash, def] of Object.entries(defs)) {
    if (def.titleInfo) {
      titles[hash] = {
        displayProperties: def.displayProperties,
        titleInfo: def.titleInfo,
        hash: def.hash,
        gildedTitleImage: def.titleInfo.gildedTitleImage,
      };
    }
  }
  return titles;
}

(async () => {
  try {
    if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });

    console.log('Fetching Destiny 2 manifest index...');
    const defPath = await fetchManifestIndex();
    console.log('DestinyRecordDefinition path:', defPath);

    console.log('Downloading DestinyRecordDefinition...');
    const defs = await fetchRecordDefinitions(defPath);

    console.log('Filtering for titles/seals...');
    const titles = filterTitles(defs);

    fs.writeFileSync(outputFile, JSON.stringify(titles, null, 2));
    console.log(`Done! Saved ${Object.keys(titles).length} title definitions to ${outputFile}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
})(); 