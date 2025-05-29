const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Icon definitions for all activity types
const ICONS = {
  d1: {
    raid: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/raid.svg',
    strike: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/strike.svg',
    crucible: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/factions/faction_crucible.svg',
    nightfall: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/factions/faction_vanguard.svg',
    story: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg',
    patrol: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/patrol.svg',
    'public-event': 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/flashpoint.svg'
  },
  d2: {
    raid: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/raid.svg',
    strike: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/strike.svg',
    crucible: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/factions/faction_crucible.svg',
    nightfall: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/factions/faction_vanguard.svg',
    story: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg',
    patrol: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/patrol.svg',
    'public-event': 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/flashpoint.svg',
    dungeon: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/raid_complex.svg',
    'lost-sector': 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/lost_sector.svg',
    seasonal: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg',
    'seasonal-event': 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg',
    'exotic-mission': 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg',
    gambit: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg'
  },
  special: {
    trials: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg',
    'iron-banner': 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/quest.svg',
    ghost: 'https://raw.githubusercontent.com/justrealmilk/destiny-icons/master/explore/ghost.svg'
  }
};

// Function to download a file
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, response => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    }).on('error', err => {
      fs.unlink(filepath, () => {}); // Delete the file if there's an error
      reject(err);
    });
  });
}

// Function to convert SVG to PNG using Inkscape
async function convertSvgToPng(svgPath, pngPath) {
  try {
    const inkscapePath = 'C:\\Program Files\\Inkscape\\bin\\inkscape.exe';
    await execPromise(`"${inkscapePath}" --export-filename="${pngPath}" "${svgPath}"`);
    console.log(`✓ Converted ${svgPath} to ${pngPath}`);
  } catch (err) {
    console.error(`✗ Failed to convert ${svgPath} to PNG:`, err.message);
    throw err;
  }
}

// Main function to download all icons
async function downloadIcons() {
  const baseDir = path.join(__dirname, '..', 'src', 'assets', 'icons', 'activities');

  // Create directories if they don't exist
  fs.mkdirSync(path.join(baseDir, 'd1'), { recursive: true });
  fs.mkdirSync(path.join(baseDir, 'd2'), { recursive: true });

  // Download D1 icons
  for (const [name, url] of Object.entries(ICONS.d1)) {
    const svgPath = path.join(baseDir, 'd1', `${name}.svg`);
    const pngPath = path.join(baseDir, 'd1', `${name}.png`);
    console.log(`Downloading D1 ${name} icon...`);
    try {
      await downloadFile(url, svgPath);
      console.log(`✓ Downloaded D1 ${name} icon`);
      await convertSvgToPng(svgPath, pngPath);
      // Keep SVG file after conversion
    } catch (err) {
      console.error(`✗ Failed to download/convert D1 ${name} icon:`, err.message);
    }
  }

  // Download D2 icons
  for (const [name, url] of Object.entries(ICONS.d2)) {
    const svgPath = path.join(baseDir, 'd2', `${name}.svg`);
    const pngPath = path.join(baseDir, 'd2', `${name}.png`);
    console.log(`Downloading D2 ${name} icon...`);
    try {
      await downloadFile(url, svgPath);
      console.log(`✓ Downloaded D2 ${name} icon`);
      await convertSvgToPng(svgPath, pngPath);
      // Keep SVG file after conversion
    } catch (err) {
      console.error(`✗ Failed to download/convert D2 ${name} icon:`, err.message);
    }
  }

  // Download special icons
  for (const [name, url] of Object.entries(ICONS.special)) {
    const svgPath = path.join(baseDir, `${name}.svg`);
    const pngPath = path.join(baseDir, `${name}.png`);
    console.log(`Downloading special ${name} icon...`);
    try {
      await downloadFile(url, svgPath);
      console.log(`✓ Downloaded special ${name} icon`);
      await convertSvgToPng(svgPath, pngPath);
      // Keep SVG file after conversion
    } catch (err) {
      console.error(`✗ Failed to download/convert special ${name} icon:`, err.message);
    }
  }
}

// Run the download
downloadIcons().catch(console.error); 