// Runs pure-util *.spec.ts files under Node (esbuild + jasmine-core), no browser.
// Usage: node scripts/run-util-specs.mjs [src/app/utils/destiny-game.spec.ts ...]
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const files = process.argv.slice(2);
if (files.length === 0) files.push('src/app/utils/destiny-game.spec.ts');

const dir = mkdtempSync(join(tmpdir(), 'dc-specs-'));
const out = join(dir, 'specs.cjs');
await build({
  entryPoints: files.map(f => resolve(f)),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: dir,
  entryNames: '[name]',
  logLevel: 'error',
});

const jasmineCore = require('jasmine-core');
const jasmine = jasmineCore.boot ? jasmineCore.boot() : jasmineCore.core(jasmineCore);
const env = jasmine.getEnv();
Object.assign(globalThis, jasmineCore.interface(jasmine, env));
let failed = 0;
env.addReporter({
  specDone(r) {
    if (r.status === 'failed') {
      failed++;
      console.log(`FAIL ${r.fullName}`);
      for (const f of r.failedExpectations) console.log('  ' + f.message);
    } else if (r.status === 'passed') console.log(`ok   ${r.fullName}`);
  },
  jasmineDone(r) {
    console.log(`\n${r.overallStatus} (${failed} failed)`);
    process.exitCode = failed ? 1 : 0;
  },
});
for (const f of files) {
  const name = f.split('/').pop().replace(/\.ts$/, '.js');
  require(join(dir, name));
}
await env.execute();
