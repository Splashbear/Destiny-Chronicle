const fs = require('fs');
const path = require('path');
const https = require('https');

/** Map of local filename => raw GitHub URL in justrealmilk/destiny-icons */
const PLATFORM_ICONS = {
  xbox: 'https://www.bungie.net/img/theme/destiny/icons/icon_xbl.png',
  ps: 'https://www.bungie.net/img/theme/destiny/icons/icon_psn.png',
  steam: 'https://www.bungie.net/img/theme/destiny/icons/icon_steam.png',
  stadia: 'https://www.bungie.net/img/theme/destiny/icons/icon_stadia.png',
  egs: 'https://www.bungie.net/img/theme/destiny/icons/icon_egs.png'
};

/**
 * Download a file from `url` and save it to `dest`.
 * Resolves when finished. Rejects on error or non-200 response.
 */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download ${url} – Status ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

(async () => {
  const outDir = path.join(__dirname, '..', 'src', 'assets', 'icons', 'platforms');
  fs.mkdirSync(outDir, { recursive: true });

  for (const [name, url] of Object.entries(PLATFORM_ICONS)) {
    const filePath = path.join(outDir, `${name}.png`);
    try {
      console.log(`Downloading ${name} icon…`);
      await download(url, filePath);
      console.log(`✓ Saved ${name}.png`);
    } catch (err) {
      console.error(`✗ ${name}:`, err.message);
    }
  }
})(); 