/**
 * Simplified measurement: Verify loading continues in hidden tabs.
 * Measures progress over a fixed time period rather than waiting for completion.
 */

import { test, expect } from '@playwright/test';

const DEV_SERVER_URL = 'http://localhost:4200';
const TEST_ACCOUNT = 'splashbear';
const MEASUREMENT_DURATION = 60000; // Measure for 60 seconds

test.describe('Hidden Tab Loading Verification', () => {
  
  test('verify loading continues in hidden tab', async ({ page, context }) => {
    console.log('\n=== Hidden Tab Loading Verification ===\n');
    
    const logs: string[] = [];
    let progressUpdates = 0;

    // Capture console logs
    page.on('console', (msg) => {
      const text = msg.text();
      logs.push(text);
      
      // Count progress-related log messages
      if (text.includes('[Load]') || text.includes('Sync') || text.includes('activities') || text.includes('PGCR')) {
        progressUpdates++;
      }
    });

    try {
      // Navigate
      console.log('Navigating to app...');
      await page.goto(DEV_SERVER_URL, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });

      // Search
      console.log('Searching for account...');
      const searchInput = page.getByLabel(/Destiny username/i);
      await searchInput.fill(TEST_ACCOUNT);
      await page.getByRole('button', { name: /Search/i }).click();

      // Wait for modal
      await page.waitForSelector('text=Select Accounts', { timeout: 20000 });
      console.log('Search completed, account selector visible');

      // Check if account is in modal (verify API is working)
      const hasAccount = await page.locator('text=Splashbear').count() > 0;
      expect(hasAccount).toBe(true);
      console.log('✓ Account found in results (Bungie API accessible)');

      // Select first PlayStation account by clicking its Select button
      const selectButton = page.getByRole('button', { name: /PlayStation.*Select/i }).first();
      await selectButton.click({ timeout: 10000 });
      await page.waitForTimeout(1000); // Wait for selection to register
      console.log('Account selected');

      // Click Load button
      const loadButton = page.getByRole('button', { name: /Load Selected/i });
      await loadButton.click();
      console.log('Loading started...');

      // Wait a moment for loading to begin
      await page.waitForTimeout(5000);
      const logsBeforeHiding = logs.length;
      const progressBeforeHiding = progressUpdates;
      
      console.log(`\nLogs before hiding: ${logsBeforeHiding}`);
      console.log(`Progress updates before hiding: ${progressBeforeHiding}`);

      // Hide the page using CDP
      console.log('\nHiding page...');
      const cdpSession = await context.newCDPSession(page);
      await cdpSession.send('Emulation.setIdleOverride', {
        isUserActive: false,
        isScreenUnlocked: false
      });
      
      // Also set visibility state via page evaluation
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => true
        });
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden' as DocumentVisibilityState
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Wait and measure progress while hidden
      console.log(`Measuring progress for ${MEASUREMENT_DURATION / 1000} seconds while hidden...`);
      await page.waitForTimeout(MEASUREMENT_DURATION);

      const logsAfterHiding = logs.length;
      const progressAfterHiding = progressUpdates;
      const logsWhileHidden = logsAfterHiding - logsBeforeHiding;
      const progressWhileHidden = progressAfterHiding - progressBeforeHiding;

      console.log(`\nLogs after hiding: ${logsAfterHiding}`);
      console.log(`Progress updates after hiding: ${progressAfterHiding}`);
      console.log(`\nProgress made while hidden:`);
      console.log(`  New logs: ${logsWhileHidden}`);
      console.log(`  New progress updates: ${progressWhileHidden}`);

      // Write results
      const resultsContent = `# Hidden Tab Loading Verification

## Test Configuration
- Test Account: ${TEST_ACCOUNT}
- Browser: Chrome (headless)
- Measurement Duration: ${MEASUREMENT_DURATION / 1000} seconds while hidden
- Hidden Method: CDP Emulation.setIdleOverride + visibility API

## Results

### Before Hiding Tab
- **Total Logs**: ${logsBeforeHiding}
- **Progress Updates**: ${progressBeforeHiding}

### After ${MEASUREMENT_DURATION / 1000}s Hidden
- **Total Logs**: ${logsAfterHiding}
- **Progress Updates**: ${progressAfterHiding}

### Progress While Hidden
- **New Logs**: ${logsWhileHidden}
- **New Progress Updates**: ${progressWhileHidden}
- **Rate**: ${(progressWhileHidden / (MEASUREMENT_DURATION / 1000)).toFixed(2)} updates/second

## Conclusion
${progressWhileHidden > 0 ? '✅ PASS: Loading continued in hidden tab' : '❌ FAIL: No progress observed in hidden tab'}

${progressWhileHidden > 0 
  ? `The fix successfully allows loading to continue in hidden tabs. ${progressWhileHidden} progress updates were made during the ${MEASUREMENT_DURATION / 1000}s measurement period.` 
  : 'Loading appears to have stalled in the hidden tab. Further investigation needed.'}

## Sample Progress Logs
${logs.filter(log => log.includes('[Load]') || log.includes('Sync') || log.includes('activities')).slice(-10).join('\n')}
`;

      const fs = require('fs');
      const path = require('path');
      fs.writeFileSync(
        path.join(process.cwd(), 'MEASUREMENT_RESULTS.md'),
        resultsContent
      );
      
      console.log('\n✓ Results written to MEASUREMENT_RESULTS.md');
      console.log('===============================\n');

      // Assertions
      expect(progressWhileHidden).toBeGreaterThan(0); // Loading must continue in hidden tab
      
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  });
});
