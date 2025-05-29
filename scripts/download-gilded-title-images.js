const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Path to your manifest file (update if needed)
const manifestPath = path.join(__dirname, '../src/assets/manifest/d2-title-definitions.json');
const outputDir = path.join(__dirname, 'gilded-title-images');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hashes = Object.keys(manifest);

(async () => {
  let count = 0;
  for (const hash of hashes) {
    const def = manifest[hash];
    const url = def?.titleInfo?.gildedTitleImage;
    if (url) {
      const fullUrl = url.startsWith('http') ? url : `https://www.bungie.net${url}`;
      const fileName = path.basename(url);
      const filePath = path.join(outputDir, fileName);
      if (fs.existsSync(filePath)) {
        console.log(`[SKIP] Already downloaded: ${fileName}`);
        continue;
      }
      try {
        const response = await axios.get(fullUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(filePath, response.data);
        console.log(`[OK] Downloaded: ${fileName}`);
        count++;
      } catch (err) {
        console.error(`[ERROR] Failed to download ${fullUrl}:`, err.message);
      }
    }
  }
  console.log(`Done. Downloaded ${count} gilded title images.`);
})(); 