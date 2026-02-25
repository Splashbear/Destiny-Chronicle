/**
 * E2E test: Load splashbear PlayStation account (Destiny 2) and observe loading phases.
 * Run: npm run e2e:splashbear (starts dev server if needed)
 * Captures [Load] console messages to identify where the page stalls.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env['BASE_URL'] || 'http://localhost:4200';
const LOAD_TIMEOUT_MS = 120000; // 2 min for full load
const PAGE_NAV_TIMEOUT_MS = 90000; // Angular can be slow to compile/serve

test.describe('Splashbear PlayStation (Destiny 2) load', () => {
  test('search splashbear, select D2 PlayStation, load and capture [Load] phases', async ({ page }) => {
    const loadLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Load]')) loadLogs.push(text);
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_NAV_TIMEOUT_MS });

    // Search: user "splashbear" (Bungie name)
    const searchInput = page.getByPlaceholder(/Bungie name/i);
    await searchInput.fill('splashbear');
    await page.getByRole('button', { name: /Search/i }).click();

    // Wait for results, then select the PlayStation account (Destiny 2 section)
    await page.getByRole('heading', { name: /Destiny 2 Accounts/i }).waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForSelector('text=PlayStation', { timeout: 10000 });
    await page.waitForSelector('text=splashbear', { timeout: 5000 });

    // Destiny 2 section -> row that has both splashbear and PlayStation
    const d2Section = page.locator('div').filter({ has: page.getByRole('heading', { name: /Destiny 2 Accounts/i }) }).first();
    const playstationRow = d2Section.locator('.space-y-2 > div').filter({ hasText: 'splashbear' }).filter({ hasText: 'PlayStation' }).first();
    await expect(playstationRow).toBeVisible({ timeout: 5000 });
    await playstationRow.getByRole('checkbox').check();

    // Load Selected
    await page.getByRole('button', { name: /Load Selected/i }).click();

    let completed = false;
    try {
      await page.getByText(/All Profiles Loaded|profile loaded successfully/i).waitFor({ state: 'visible', timeout: LOAD_TIMEOUT_MS });
      completed = true;
    } catch {
      // UI success text may be brief; we'll use [Load] Complete in logs as fallback
    }
    if (!completed && loadLogs.length > 0) {
      await new Promise(r => setTimeout(r, 2000));
      completed = loadLogs.some(line => line.includes('[Load] Complete'));
    }

    console.log('\n--- [Load] console messages (in order) ---');
    loadLogs.forEach((line, i) => console.log(`${i + 1}. ${line}`));
    if (loadLogs.length > 0) {
      console.log('\nLast [Load] message:', loadLogs[loadLogs.length - 1]);
    } else {
      console.log('(No [Load] messages captured)');
    }
    console.log('---\n');

    expect(loadLogs.length).toBeGreaterThan(0);
    if (!completed) {
      console.warn('Load did not complete within timeout. Last phase:', loadLogs[loadLogs.length - 1] || 'unknown');
    }
  });
});
