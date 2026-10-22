/**
 * Capture / refresh e2e/baselines/splashbear-psn-puddlecubs-d1.json
 * Usage: npm run e2e:regression:update
 */
import { spawnSync } from 'child_process';

process.env.UPDATE_BASELINE = '1';
const result = spawnSync(
  'npx',
  ['playwright', 'test', 'e2e/regression-baseline.spec.ts'],
  { stdio: 'inherit', env: process.env, shell: true }
);
process.exit(result.status ?? 1);
