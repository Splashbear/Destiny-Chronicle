const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICON_DIR = path.join(__dirname, '../src/assets/icons/activities');

// Ensure the directory exists
if (!fs.existsSync(ICON_DIR)) {
  fs.mkdirSync(ICON_DIR, { recursive: true });
}

// Bungie API configuration
const API_KEY = process.env.BUNGIE_API_KEY;
const BUNGIE_API_ROOT = 'https://www.bungie.net/Platform';
const BUNGIE_NET_ROOT = 'https://www.bungie.net';

if (!API_KEY) {
  console.error('Please set BUNGIE_API_KEY environment variable');
  process.exit(1);
}

// Activity mode hashes that have good icons
const ACTIVITY_MODES = {
  'raid-d2': 4,                // Raid
  'dungeon': 82,              // Dungeon
  'strike-d2': 3,             // Strike
  'story-d2': 2,              // Story
  'pvp-d2': 5,                // PvP
  'nightfall-d2': 46,         // Nightfall
  'gambit': 63,               // Gambit
  'iron-banner': 19,          // Iron Banner
  'trials': 84                // Trials of Osiris
};

async function getManifest() {
  try {
    const response = await axios.get(`${BUNGIE_API_ROOT}/Destiny2/Manifest/`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });
    return response.data.Response;
  } catch (error) {
    console.error('Error fetching manifest:', error.message);
    return null;
  }
}

async function getActivityModeDefinitions(manifest) {
  try {
    const response = await axios.get(`${BUNGIE_NET_ROOT}${manifest.jsonWorldComponentContentPaths.en.DestinyActivityModeDefinition}`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching activity mode definitions:', error.message);
    return null;
  }
}

async function downloadAndOptimizeIcon(name, iconPath) {
  try {
    const url = `${BUNGIE_NET_ROOT}${iconPath}`;
    console.log(`Downloading ${name} from ${url}`);
    
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    const buffer = Buffer.from(response.data);
    const outputPath = path.join(ICON_DIR, `${name}.png`);
    
    await sharp(buffer)
      .resize(128, 128) // Standardize size
      .png({ quality: 90 })
      .toFile(outputPath);
      
    console.log(`Successfully processed ${name}`);
  } catch (error) {
    console.error(`Error processing ${name}:`, error.message);
  }
}

async function downloadAllIcons() {
  try {
    const manifest = await getManifest();
    if (!manifest) {
      throw new Error('Failed to fetch manifest');
    }

    const definitions = await getActivityModeDefinitions(manifest);
    if (!definitions) {
      throw new Error('Failed to fetch activity mode definitions');
    }

    for (const [name, modeHash] of Object.entries(ACTIVITY_MODES)) {
      const definition = definitions[modeHash];
      if (definition?.displayProperties?.icon) {
        await downloadAndOptimizeIcon(name, definition.displayProperties.icon);
        // Add a small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.error(`No icon found for ${name}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

downloadAllIcons().then(() => {
  console.log('All icons processed');
}).catch(console.error); 