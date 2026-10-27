/**
 * Build PLAYED_WITH_NAME_SEARCH_ROOT from PLAYED_WITH_NAME_TABLE.
 *
 * Usage (from api-server/):
 *   node scripts/build-username-search-index.mjs
 *
 * Env:
 *   PLAYED_WITH_NAME_TABLE          source parquet / glob (required)
 *   PLAYED_WITH_NAME_SEARCH_ROOT    output root (required)
 *
 * Gate: do not run the full ChronicleServer build until Splashbear approves
 * the 20-mid validation in BOT_DECISIONS.md.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prefer compiled JS; fall back guidance if not built.
let UsernameSearchService;
try {
  ({ UsernameSearchService } = require('../dist/services/username-search.service.js'));
} catch {
  console.error('Build api-server first: npm run build');
  process.exit(1);
}

const src = (process.env.PLAYED_WITH_NAME_TABLE || '').trim();
const root = (process.env.PLAYED_WITH_NAME_SEARCH_ROOT || '').trim();
if (!src || !root) {
  console.error('Set PLAYED_WITH_NAME_TABLE and PLAYED_WITH_NAME_SEARCH_ROOT');
  process.exit(1);
}

const svc = new UsernameSearchService(root);
const summary = await svc.buildFromNameTable(src, {
  threads: Number(process.env.USERNAME_SEARCH_BUILD_THREADS || 4),
  memoryLimit: process.env.USERNAME_SEARCH_BUILD_MEMORY || '4GB',
});
console.log(JSON.stringify({ ok: true, root, ...summary }, null, 2));
