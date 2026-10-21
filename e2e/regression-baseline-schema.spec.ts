/**
 * Fast gate: committed baseline JSON is present and structurally valid.
 * Does not hit Bungie / archive (see regression-baseline.spec.ts for live compare).
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  REGRESSION_BASELINE_FILENAME,
  REGRESSION_FIXTURE_ACCOUNTS,
  buildRegressionBaseline,
  diffRegressionBaselines,
  type RegressionBaseline
} from '../src/app/utils/regression-baseline';

const BASELINE_PATH = path.join(__dirname, 'baselines', REGRESSION_BASELINE_FILENAME);

test.describe('Regression baseline schema', () => {
  test('committed splashbear+puddlecubs baseline exists and matches fixture accounts', () => {
    expect(fs.existsSync(BASELINE_PATH), `missing ${BASELINE_PATH}`).toBe(true);
    const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as RegressionBaseline;
    const baseline = buildRegressionBaseline({
      accounts: raw.accounts,
      activityCount: raw.totals.activityCount,
      activityTimeSeconds: raw.totals.activityTimeSeconds,
      sealCount: raw.totals.sealCount,
      firsts: raw.firsts,
      playedWithTop10: raw.playedWithTop10
    });

    expect(baseline.version).toBe(1);
    expect(baseline.totals.activityCount).toBeGreaterThan(0);
    expect(baseline.totals.activityTimeSeconds).toBeGreaterThan(0);
    expect(baseline.firsts.length).toBeGreaterThan(0);
    expect(baseline.playedWithTop10.length).toBe(10);

    for (const want of REGRESSION_FIXTURE_ACCOUNTS) {
      const hit = baseline.accounts.find(
        (a) =>
          a.game === want.game &&
          a.membershipId === want.membershipId &&
          a.membershipType === want.membershipType
      );
      expect(hit, `missing ${want.game}|${want.membershipId}`).toBeTruthy();
    }

    // Idempotent normalize
    expect(diffRegressionBaselines(baseline, baseline)).toEqual([]);
  });
});
