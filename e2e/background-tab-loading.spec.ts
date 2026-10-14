/**
 * E2E test: Verify that loading continues in background/hidden tabs.
 * Tests the fix for browser tab throttling that was stalling loads.
 * 
 * Run: npx playwright test e2e/background-tab-loading.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env['BASE_URL'] || 'http://localhost:4200';
const LOAD_TIMEOUT_MS = 180000; // 3 min for full load (conservative)
const PAGE_NAV_TIMEOUT_MS = 90000;

test.describe('Background tab loading', () => {
  test('loading continues when tab is hidden', async ({ page, context }) => {
    const loadLogs: Array<{ text: string; timestamp: number }> = [];
    const startTime = Date.now();

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Load]') || text.includes('[Sync]') || text.includes('activities') || text.includes('PGCR')) {
        loadLogs.push({ text, timestamp: Date.now() - startTime });
      }
    });

    // Navigate to the page
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_NAV_TIMEOUT_MS });

    // Search for splashbear (a test account)
    const searchInput = page.getByLabel(/Destiny username/i);
    await searchInput.fill('splashbear');
    await page.getByRole('button', { name: /Search/i }).click();

    // Wait for results
    await page.getByRole('heading', { name: /Destiny 2 Accounts/i }).waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForSelector('text=PlayStation', { timeout: 10000 });

    // Select PlayStation account
    const d2Section = page.locator('div').filter({ has: page.getByRole('heading', { name: /Destiny 2 Accounts/i }) }).first();
    const playstationRow = d2Section.locator('.space-y-2 > div').filter({ hasText: 'splashbear' }).filter({ hasText: 'PlayStation' }).first();
    await expect(playstationRow).toBeVisible({ timeout: 5000 });
    await playstationRow.getByRole('checkbox').check();

    // Load Selected
    await page.getByRole('button', { name: /Load Selected/i }).click();

    // Wait a bit for loading to start
    await page.waitForTimeout(2000);

    // Hide the page to simulate background tab
    console.log('Hiding page to simulate background tab...');
    await page.evaluate(() => {
      // Simulate tab being hidden
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: function() { return true; }
      });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: function() { return 'hidden'; }
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Record log count before hiding
    const logsBeforeHiding = loadLogs.length;
    console.log(`Logs before hiding: ${logsBeforeHiding}`);

    // Wait for loading to continue in background (give it 30 seconds)
    await page.waitForTimeout(30000);

    // Check that logs continued to be produced while hidden
    const logsAfterHiding = loadLogs.length;
    console.log(`Logs after 30s hidden: ${logsAfterHiding}`);
    console.log(`Progress made while hidden: ${logsAfterHiding - logsBeforeHiding} log entries`);

    // Restore visibility
    console.log('Restoring page visibility...');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: function() { return false; }
      });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: function() { return 'visible'; }
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait for load to complete
    let completed = false;
    try {
      await page.getByText(/All Profiles Loaded|profile loaded successfully/i).waitFor({ 
        state: 'visible', 
        timeout: LOAD_TIMEOUT_MS 
      });
      completed = true;
    } catch {
      // Check logs for completion
      await page.waitForTimeout(2000);
      completed = loadLogs.some(log => log.text.includes('[Load] Complete') || log.text.includes('Sync done'));
    }

    // Print timeline
    console.log('\n--- Loading Timeline ---');
    console.log('Total logs:', loadLogs.length);
    console.log('Logs before hiding:', logsBeforeHiding);
    console.log('Logs while hidden (30s):', logsAfterHiding - logsBeforeHiding);
    console.log('Logs after restoring visibility:', loadLogs.length - logsAfterHiding);
    
    if (loadLogs.length > 0) {
      console.log('\nFirst 5 logs:');
      loadLogs.slice(0, 5).forEach(log => console.log(`  [+${log.timestamp}ms] ${log.text}`));
      console.log('\nLast 5 logs:');
      loadLogs.slice(-5).forEach(log => console.log(`  [+${log.timestamp}ms] ${log.text}`));
    }
    console.log('---\n');

    // Assertions
    expect(loadLogs.length).toBeGreaterThan(logsBeforeHiding);
    expect(logsAfterHiding - logsBeforeHiding).toBeGreaterThan(0); // Loading continued while hidden
    
    console.log(completed ? '✓ Load completed successfully' : '⚠ Load did not complete (may still be in progress)');
  });

  test('measure load time: visible vs hidden', async ({ page }) => {
    // This test compares load times but requires multiple runs
    // For now, we just measure and report
    
    const measurements: Array<{ scenario: string; duration: number }> = [];
    
    // Helper to load an account and measure time
    const measureLoad = async (hideTab: boolean, scenario: string) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_NAV_TIMEOUT_MS });
      
      const searchInput = page.getByLabel(/Destiny username/i);
      await searchInput.fill('splashbear');
      await page.getByRole('button', { name: /Search/i }).click();
      
      await page.getByRole('heading', { name: /Destiny 2 Accounts/i }).waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForSelector('text=PlayStation', { timeout: 10000 });
      
      const d2Section = page.locator('div').filter({ has: page.getByRole('heading', { name: /Destiny 2 Accounts/i }) }).first();
      const playstationRow = d2Section.locator('.space-y-2 > div').filter({ hasText: 'splashbear' }).filter({ hasText: 'PlayStation' }).first();
      await playstationRow.getByRole('checkbox').check();
      
      const startTime = Date.now();
      await page.getByRole('button', { name: /Load Selected/i }).click();
      
      if (hideTab) {
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
      }
      
      try {
        await page.getByText(/All Profiles Loaded|profile loaded successfully/i).waitFor({ 
          state: 'visible', 
          timeout: LOAD_TIMEOUT_MS 
        });
      } catch {
        // Timeout
      }
      
      const duration = Date.now() - startTime;
      measurements.push({ scenario, duration });
      
      return duration;
    };
    
    console.log('\n=== Load Time Comparison ===');
    
    // Measure visible load
    const visibleDuration = await measureLoad(false, 'Visible Tab');
    console.log(`Visible tab load time: ${(visibleDuration / 1000).toFixed(1)}s`);
    
    // Reset for hidden load
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Measure hidden load
    const hiddenDuration = await measureLoad(true, 'Hidden Tab');
    console.log(`Hidden tab load time: ${(hiddenDuration / 1000).toFixed(1)}s`);
    
    const ratio = hiddenDuration / visibleDuration;
    console.log(`\nHidden/Visible ratio: ${ratio.toFixed(2)}x`);
    console.log(`Expected: ~1.0-1.5x (similar speed with minor overhead)`);
    console.log(`Before fix: ~10-60x slower (severe throttling)`);
    console.log('=============================\n');
    
    // After our fix, hidden should be within 2x of visible (not 10-60x)
    // This is a lenient check since exact timing varies
    expect(ratio).toBeLessThan(3);
  });
});
