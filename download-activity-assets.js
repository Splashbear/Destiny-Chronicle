// download-activity-assets.js
// Usage: node download-activity-assets.js
// Requires: node-fetch, fs-extra

const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');

const API_KEY = 'e55082388d014a79b9f5da4be0063d1c';
const MANIFEST_URL = 'https://www.bungie.net/Platform/Destiny2/Manifest/';
const ASSET_DIR = path.join(__dirname, 'src/assets/activity-images');
const ACTIVITY_MODE_MAP_PATH = path.join(__dirname, 'src/app/models/activity-types.ts');
const ACTIVITY_TYPES_PATH = path.join(__dirname, 'src/app/models/activity-types.ts');
const ACTIVITY_JSONS_PATH = 'C:/Users/travis.volle/Documents/Activity JSONs.txt';

async function getManifestIndex() {
  const res = await fetch(MANIFEST_URL, { headers: { 'X-API-Key': API_KEY } });
  if (!res.ok) throw new Error('Failed to fetch manifest index');
  return res.json();
}

async function downloadJson(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to download ' + url);
  const json = await res.json();
  await fs.writeJson(outPath, json, { spaces: 2 });
  return json;
}

function parseActivityModeMap(tsFile) {
  const content = fs.readFileSync(tsFile, 'utf8');
  const mapMatch = content.match(/export const ACTIVITY_MODE_MAP: \{ \[mode: number\]: ActivityMode \} = ([^;]+);/);
  if (!mapMatch) throw new Error('Could not find ACTIVITY_MODE_MAP in activity-types.ts');
  // This is a quick-and-dirty parse, assumes the map is a JS object literal
  const mapObj = eval('(' + mapMatch[1] + ')');
  return Object.keys(mapObj).map(Number);
}

async function downloadImage(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to download image: ' + url);
  const buffer = await res.buffer();
  await fs.outputFile(outPath, buffer);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_\.]/g, '_');
}

async function processCustomActivities() {
  const activityJsonRaw = await fs.readFile(ACTIVITY_JSONS_PATH, 'utf8');
  const activityJsons = activityJsonRaw
    .split(/}\s*\n\s*{/) // crude split, assumes each object is separated by a newline
    .map((s, i, arr) => {
      if (i === 0) return s + '}';
      if (i === arr.length - 1) return '{' + s;
      return '{' + s + '}';
    })
    .map(j => {
      try { return JSON.parse(j); } catch { return null; }
    })
    .filter(Boolean);

  const activityTypesTs = await fs.readFile(ACTIVITY_TYPES_PATH, 'utf8');
  let updatedTs = activityTypesTs;
  let summary = [];

  for (const activity of activityJsons) {
    const { name, modeType, icon, pgcrImage, friendlyName } = {
      name: activity.displayProperties?.name,
      modeType: activity.modeType,
      icon: activity.displayProperties?.icon,
      pgcrImage: activity.pgcrImage,
      friendlyName: activity.friendlyName || (activity.displayProperties?.name || '').toLowerCase().replace(/\s+/g, '-'),
    };
    if (!name || !modeType || !icon || !pgcrImage) continue;
    // 1. Add mapping if not present
    const modeMapRegex = new RegExp(`${modeType}: [^,]+,`);
    if (!modeMapRegex.test(updatedTs)) {
      updatedTs = updatedTs.replace(
        /(\s*77: [^,]+,\s*\/\/ The Menagerie\s*)/,
        `$1  ${modeType}: '${name}',  // ${name}\n`
      );
      // Add to ActivityMode type if not present
      if (!updatedTs.includes(`| '${name}'`)) {
        updatedTs = updatedTs.replace(
          /(\| 'Other'[^;]*;)/,
          `$1\n  | '${name}'`
        );
      }
      summary.push(`Mapped modeType ${modeType} as '${name}'`);
    }
    // 2. Download icon
    const iconUrl = `https://www.bungie.net${icon}`;
    const iconPath = path.join(ASSET_DIR, '..', 'icons', 'activities', 'd2', `${friendlyName}.png`);
    if (!(await fs.pathExists(iconPath))) {
      try {
        const res = await fetch(iconUrl);
        if (res.ok) {
          await fs.outputFile(iconPath, Buffer.from(await res.arrayBuffer()));
          summary.push(`Downloaded icon for ${name}`);
        }
      } catch (e) { summary.push(`Failed to download icon for ${name}`); }
    }
    // 3. Download pgcrImage
    const pgcrUrl = `https://www.bungie.net${pgcrImage}`;
    const pgcrPath = path.join(ASSET_DIR, `${friendlyName}.jpg`);
    if (!(await fs.pathExists(pgcrPath))) {
      try {
        const res = await fetch(pgcrUrl);
        if (res.ok) {
          await fs.outputFile(pgcrPath, Buffer.from(await res.arrayBuffer()));
          summary.push(`Downloaded PGCR image for ${name}`);
        }
      } catch (e) { summary.push(`Failed to download PGCR image for ${name}`); }
    }
  }
  // Write updated activity-types.ts
  if (updatedTs !== activityTypesTs) {
    await fs.writeFile(ACTIVITY_TYPES_PATH, updatedTs, 'utf8');
    summary.push('Updated activity-types.ts with new mappings.');
  }
  // Output summary
  console.log('Custom Activity Mapping & Asset Download Summary:');
  summary.forEach(s => console.log(s));
}

async function main() {
  await fs.ensureDir(ASSET_DIR);
  console.log('Fetching manifest index...');
  const manifest = await getManifestIndex();
  const enPaths = manifest.Response.jsonWorldComponentContentPaths.en;
  const modeDefPath = enPaths.DestinyActivityModeDefinition;
  const activityDefPath = enPaths.DestinyActivityDefinition;
  const modeDefUrl = 'https://www.bungie.net' + modeDefPath;
  const activityDefUrl = 'https://www.bungie.net' + activityDefPath;

  console.log('Downloading DestinyActivityModeDefinition...');
  const modeDefs = await downloadJson(modeDefUrl, path.join(ASSET_DIR, 'DestinyActivityModeDefinition.json'));
  console.log('Downloading DestinyActivityDefinition...');
  const activityDefs = await downloadJson(activityDefUrl, path.join(ASSET_DIR, 'DestinyActivityDefinition.json'));

  // Get mapped mode numbers
  const mappedModes = parseActivityModeMap(ACTIVITY_MODE_MAP_PATH);

  // Find unmapped modes
  const allModeHashes = Object.keys(modeDefs);
  const unmapped = allModeHashes.filter(h => !mappedModes.includes(Number(h)));
  console.log('\nUnmapped activity modes:');
  unmapped.forEach(h => {
    const m = modeDefs[h];
    console.log(`- ${h}: ${m.displayProperties?.name || 'Unknown'}`);
  });

  // Download images for all activity modes
  console.log('\nChecking activity mode icons...');
  for (const h of allModeHashes) {
    const m = modeDefs[h];
    if (!m.displayProperties?.icon) continue;
    const iconUrl = 'https://www.bungie.net' + m.displayProperties.icon;
    const outName = `mode-${h}${path.extname(m.displayProperties.icon)}`;
    const outPath = path.join(ASSET_DIR, outName);
    if (fs.existsSync(outPath)) {
      // console.log(`Already have ${outName}`);
      continue;
    }
    try {
      await downloadImage(iconUrl, outPath);
      console.log(`Downloaded mode icon: ${outName}`);
    } catch (e) {
      console.warn(`Failed to download mode icon for ${h}: ${e.message}`);
    }
  }

  // Download images for all activities (PGCR images)
  console.log('\nChecking activity PGCR images...');
  for (const h of Object.keys(activityDefs)) {
    const a = activityDefs[h];
    if (!a.pgcrImage) continue;
    const imgUrl = a.pgcrImage.startsWith('http') ? a.pgcrImage : 'https://www.bungie.net' + a.pgcrImage;
    const outName = `activity-${h}${path.extname(a.pgcrImage)}`;
    const outPath = path.join(ASSET_DIR, outName);
    if (fs.existsSync(outPath)) {
      // console.log(`Already have ${outName}`);
      continue;
    }
    try {
      await downloadImage(imgUrl, outPath);
      console.log(`Downloaded activity image: ${outName}`);
    } catch (e) {
      console.warn(`Failed to download activity image for ${h}: ${e.message}`);
    }
  }

  processCustomActivities();

  console.log('\nAll done!');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
}); 