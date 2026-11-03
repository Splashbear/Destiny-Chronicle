// GitHub Pages answers unknown paths with 404.html (status 404). For every static
// (parameter-free) route in src/app/app.routes.ts, copy the built index.html to
// <browser-dir>/<route>/index.html so the route is served with HTTP 200.
// Parameterised routes (date/:date, ...) cannot be pre-rendered and keep the 404.html fallback.
// Usage: node scripts/generate-route-pages.mjs [browserDir]   (default dist/destiny-chronicle/browser)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
// GitHub Pages serves <route>/index.html at <route>/ and 301-redirects <route> to <route>/, so
// every canonical tag and sitemap entry for a prerendered route uses the trailing-slash URL.
const ORIGIN = 'https://destinychronicle.com';
const CANONICAL_RE = /<link rel="canonical" href="[^"]*">/;
const html = readFileSync(indexHtml, 'utf8');
if (!CANONICAL_RE.test(html)) {
  console.error('generate-route-pages: src/index.html has no <link rel="canonical"> to rewrite');
  process.exit(1);
}
for (const route of staticRoutes) {
  const dir = join(browserDir, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    html.replace(CANONICAL_RE, `<link rel="canonical" href="${ORIGIN}/${route}/">`)
  );
  console.log(`generate-route-pages: /${route}/index.html`);
}

// Sitemap: the home page plus prerendered routes that are real landing pages. /share is a
// per-user permalink view (state lives in the query string), so it is canonical-tagged but not listed.
const SITEMAP_EXCLUDE = new Set(['share']);
const sitemapUrls = [`${ORIGIN}/`, ...staticRoutes.filter(r => !SITEMAP_EXCLUDE.has(r)).map(r => `${ORIGIN}/${r}/`)];
writeFileSync(
  join(browserDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapUrls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') +
    `\n</urlset>\n`
);
console.log(`generate-route-pages: sitemap.xml (${sitemapUrls.length} url(s))`);
const skipped = [...new Set(paths)].filter(p => p.includes(':') || p.includes('*'));
console.log(
  `generate-route-pages: ${staticRoutes.length} static route(s); ` +
    `${skipped.length} parameterised route(s) keep the 404.html fallback: ${skipped.join(', ') || 'none'}`
);
