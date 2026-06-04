#!/usr/bin/env node
/**
 * CLI helper: download Bungie CDN images listed in an asset-map.json into media/.
 * Used when building archives outside the browser (e.g. CI or desktop sync tools).
 *
 * Usage:
 *   node tools/archive-builder/download-images.mjs ./MyArchive/asset-map.json ./MyArchive
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hashAssetPath(p) {
  let h = 2166136261;
  for (let i = 0; i < p.length; i++) {
    h ^= p.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function extensionFromPath(p) {
  const q = p.split('?')[0];
  const dot = q.lastIndexOf('.');
  if (dot >= 0 && dot > q.lastIndexOf('/')) {
    const ext = q.slice(dot).toLowerCase();
    if (ext.length <= 5) return ext;
  }
  return '.jpg';
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          download(loc.startsWith('http') ? loc : `https://www.bungie.net${loc}`).then(resolve).catch(reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main() {
  const mapPath = process.argv[2];
  const outRoot = process.argv[3];
  if (!mapPath || !outRoot) {
    console.error('Usage: node download-images.mjs <asset-map.json> <archive-root>');
    process.exit(1);
  }
  const assetMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const entries = Object.entries(assetMap);
  let ok = 0;
  let fail = 0;
  for (const [bungiePath, rel] of entries) {
    const dest = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) {
      ok++;
      continue;
    }
    const url = bungiePath.startsWith('http') ? bungiePath : `https://www.bungie.net${bungiePath}`;
    try {
      const buf = await download(url);
      fs.writeFileSync(dest, buf);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      fail++;
      console.warn(`\nSkip ${bungiePath}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
}

main();
