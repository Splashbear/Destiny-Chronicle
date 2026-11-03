// GitHub Pages answers unknown paths with 404.html (status 404). For every static
// (parameter-free) route in src/app/app.routes.ts, copy the built index.html to
// <browser-dir>/<route>/index.html so the route is served with HTTP 200.
// Parameterised routes (date/:date, ...) cannot be pre-rendered and keep the 404.html fallback.
// Usage: node scripts/generate-route-pages.mjs [browserDir]   (default dist/destiny-chronicle/browser)
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserDir = resolve(process.argv[2] || join(root, 'dist/destiny-chronicle/browser'));
const routesSrc = readFileSync(join(root, 'src/app/app.routes.ts'), 'utf8');

const paths = [...routesSrc.matchAll(/\bpath:\s*['"]([^'"]*)['"]/g)].map(m => m[1]);
if (paths.length === 0) {
  console.error('generate-route-pages: no routes found in src/app/app.routes.ts');
  process.exit(1);
}
const staticRoutes = [...new Set(paths)].filter(
  p => p !== '' && !p.includes(':') && !p.includes('*')
);

const indexHtml = join(browserDir, 'index.html');
if (!existsSync(indexHtml)) {
  console.error(`generate-route-pages: ${indexHtml} not found (run the build first)`);
  process.exit(1);
}
for (const route of staticRoutes) {
  const dir = join(browserDir, route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(indexHtml, join(dir, 'index.html'));
  console.log(`generate-route-pages: /${route}/index.html`);
}
const skipped = [...new Set(paths)].filter(p => p.includes(':') || p.includes('*'));
console.log(
  `generate-route-pages: ${staticRoutes.length} static route(s); ` +
    `${skipped.length} parameterised route(s) keep the 404.html fallback: ${skipped.join(', ') || 'none'}`
);
