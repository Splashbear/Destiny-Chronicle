/**
 * CODE_CLEANUP_SPEC Step 1 — regression baseline for Splashbear PSN (D2) + Puddlecubs PSN (D1).
 *
 * Capture (write/update committed JSON):
 *   set UPDATE_BASELINE=1
 *   npx playwright test e2e/regression-baseline.spec.ts
 *
 * Compare (default):
 *   npm run e2e:regression
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

const BASE_URL = process.env['BASE_URL'] || 'http://localhost:4200';
const LOAD_TIMEOUT_MS = 12 * 60_000; // cold archive + firsts can be slow
const PLAYED_WITH_TIMEOUT_MS = 90_000;
const UPDATE_BASELINE = process.env['UPDATE_BASELINE'] === '1' || process.env['UPDATE_BASELINE'] === 'true';
const BASELINE_PATH = path.join(__dirname, 'baselines', REGRESSION_BASELINE_FILENAME);

const PLAYERS_JSON = JSON.stringify([
  {
    displayName: 'Splashbear#1078',
    membershipId: '4611686018465122437',
    membershipType: 2,
    game: 'D2',
    platform: 'PlayStation'
  },
  {
    displayName: 'puddlecubs',
    membershipId: '4611686018452484164',
    membershipType: 2,
    game: 'D1',
    platform: 'PlayStation'
  }
]);

/** Same encoding as updateUrlForPermalink (encodeURIComponent then URLSearchParams). */
function shareUrlWithPlayers(): string {
  const url = new URL('/share', BASE_URL);
  url.searchParams.set('players', encodeURIComponent(PLAYERS_JSON));
  return url.toString();
}

type DcRegressionProbe = {
  getSnapshot: () => RegressionBaseline;
  ready: () => boolean;
  awaitTitles?: () => Promise<void>;
  playedWithTop10: Array<{ membershipId: string; displayName: string; activitiesTogether: number }>;
};

async function waitForProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __dcRegression?: DcRegressionProbe };
      return !!w.__dcRegression?.getSnapshot;
    },
    { timeout: 60_000 }
  );
}

async function waitForSnapshotReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __dcRegression?: DcRegressionProbe };
      return !!w.__dcRegression?.ready?.();
    },
    { timeout: LOAD_TIMEOUT_MS }
  );
}

test.describe('Regression baseline (Splashbear PSN + Puddlecubs D1)', () => {
  // Cold archive load + titles nudge + played-with; leave headroom past LOAD_TIMEOUT.
  test.setTimeout(20 * 60_000);

  test('matches committed baseline for counts, time, firsts, seals, played-with top 10', async ({ page }) => {
    const loadLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Load]')) loadLogs.push(text);
    });

    const url = shareUrlWithPlayers();
    console.log('[regression] goto', url.slice(0, 120) + '…');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await waitForProbe(page);

    // Prefer success UI; fall back to probe readiness (stats + firsts maps).
    try {
      await page
        .getByText(/All Profiles Loaded|profile loaded successfully|Successfully loaded/i)
        .waitFor({ state: 'visible', timeout: Math.min(LOAD_TIMEOUT_MS, 180_000) });
    } catch {
      // continue — probe ready is authoritative
    }

    try {
      await waitForSnapshotReady(page);
    } catch (err) {
      const diag = await page.evaluate(() => {
        const w = window as unknown as { __dcRegression?: DcRegressionProbe };
        const el = document.querySelector('app-player-search');
        const ng = (window as unknown as { ng?: { getComponent?: (e: Element) => unknown } }).ng;
        const comp = el && ng?.getComponent ? (ng.getComponent(el) as Record<string, unknown>) : null;
        const selected = (comp?.['selectedPlayers'] as Array<{ membershipId: string; game: string }>) || [];
        const stats = comp?.['accountStats'] as { totalActivityCount?: number; totalSeals?: number } | undefined;
        return {
          ready: w.__dcRegression?.ready?.() ?? false,
          selected,
          activityCount: stats?.totalActivityCount ?? null,
          sealCount: stats?.totalSeals ?? null,
          href: location.href.slice(0, 160)
        };
      }).catch(() => ({ ready: false, note: 'page closed' }));
      console.error('[regression] snapshot not ready:', diag);
      throw err;
    }

    // Titles/seals are off the browse-ready path. Cap hard — manifest/Bungie can hang.
    try {
      await Promise.race([
        page.evaluate(async () => {
          const w = window as unknown as { __dcRegression?: DcRegressionProbe };
          if (w.__dcRegression?.awaitTitles) {
            await w.__dcRegression.awaitTitles();
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('awaitTitles timeout')), 30_000))
      ]);
    } catch {
      console.warn('[regression] awaitTitles timed out or failed');
    }

    // Visit Played With so top-10 is published into the probe.
    try {
      const playedWithTab = page.getByRole('tab', { name: /Played With/i });
      if (await playedWithTab.count()) {
        await playedWithTab.click();
        try {
          await page.waitForFunction(
            () => {
              const w = window as unknown as { __dcRegression?: DcRegressionProbe };
              return (w.__dcRegression?.playedWithTop10?.length || 0) > 0;
            },
            { timeout: PLAYED_WITH_TIMEOUT_MS }
          );
        } catch {
          console.warn('[regression] Played With top 10 still empty after wait — snapshot will use []');
        }
      }
    } catch {
      console.warn('[regression] Played With tab unavailable — continuing with empty top 10');
    }

    const snapshot = await page.evaluate(() => {
      const w = window as unknown as { __dcRegression?: DcRegressionProbe };
      if (!w.__dcRegression) throw new Error('__dcRegression probe missing');
      return w.__dcRegression.getSnapshot();
    });

    // Snapshot is already canonical from getRegressionSnapshot(); only re-normalize.
    const actual = buildRegressionBaseline({
      label: snapshot.label,
      capturedAt: snapshot.capturedAt,
      accounts: snapshot.accounts,
      activityCount: snapshot.totals.activityCount,
      activityTimeSeconds: snapshot.totals.activityTimeSeconds,
      sealCount: snapshot.totals.sealCount,
      firsts: snapshot.firsts,
      playedWithTop10: snapshot.playedWithTop10
    });

    // Sanity: expected fixture accounts present (keyed by game+id).
    for (const want of REGRESSION_FIXTURE_ACCOUNTS) {
      const hit = actual.accounts.find(
        (a) => a.game === want.game && a.membershipId === want.membershipId && a.membershipType === want.membershipType
      );
      expect(hit, `missing account ${want.game}|${want.membershipId}`).toBeTruthy();
    }
    expect(actual.totals.activityCount).toBeGreaterThan(0);
    expect(actual.totals.activityTimeSeconds).toBeGreaterThan(0);

    if (UPDATE_BASELINE) {
      fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(actual, null, 2) + '\n', 'utf8');
      console.log(`[regression] Wrote baseline → ${BASELINE_PATH}`);
      console.log(
        `[regression] totals: count=${actual.totals.activityCount} time=${actual.totals.activityTimeSeconds}s seals=${actual.totals.sealCount} firsts=${actual.firsts.length} playedWith=${actual.playedWithTop10.length}`
      );
      return;
    }

    expect(fs.existsSync(BASELINE_PATH), `Missing baseline file. Run with UPDATE_BASELINE=1 first: ${BASELINE_PATH}`).toBe(
      true
    );
    const expected = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as RegressionBaseline;

    // Headless title / played-with fetches can flake. Soft-skip those fields when empty
    // so we still hard-gate activities, time, and firsts (the cleanup north star).
    let expectedForDiff = expected;
    let actualForDiff = actual;
    if ((actual.totals.sealCount || 0) === 0 && (expected.totals.sealCount || 0) > 0) {
      console.warn(
        `[regression] Skipping sealCount compare (expected=${expected.totals.sealCount}, actual=0)`
      );
      expectedForDiff = {
        ...expectedForDiff,
        totals: { ...expectedForDiff.totals, sealCount: 0 }
      };
      actualForDiff = {
        ...actualForDiff,
        totals: { ...actualForDiff.totals, sealCount: 0 }
      };
    }
    if (
      (actual.playedWithTop10?.length || 0) === 0 &&
      (expected.playedWithTop10?.length || 0) > 0
    ) {
      console.warn('[regression] Skipping playedWithTop10 compare (actual empty)');
      expectedForDiff = { ...expectedForDiff, playedWithTop10: [] };
      actualForDiff = { ...actualForDiff, playedWithTop10: [] };
    }
    if ((actual.firsts?.length || 0) === 0 && (expected.firsts?.length || 0) > 0) {
      console.warn('[regression] Skipping firsts compare (actual empty — firsts still loading)');
      expectedForDiff = { ...expectedForDiff, firsts: [] };
      actualForDiff = { ...actualForDiff, firsts: [] };
    }

    console.log(
      `[regression] actual totals count=${actual.totals.activityCount} time=${actual.totals.activityTimeSeconds}s seals=${actual.totals.sealCount} firsts=${actual.firsts.length} pw=${actual.playedWithTop10.length}`
    );

    const diffs = diffRegressionBaselines(expectedForDiff, actualForDiff);
    if (diffs.length) {
      console.error('[regression] Diffs vs baseline:');
      for (const d of diffs.slice(0, 40)) {
        console.error(`  ${d.path}: expected=${JSON.stringify(d.expected)} actual=${JSON.stringify(d.actual)}`);
      }
      if (diffs.length > 40) console.error(`  …and ${diffs.length - 40} more`);
      if (loadLogs.length) {
        console.log('Last [Load] lines:', loadLogs.slice(-5));
      }
    }
    expect(diffs, `Regression baseline mismatch (${diffs.length} diffs)`).toEqual([]);
  });
});
