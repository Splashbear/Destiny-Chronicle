/**
 * Capture screenshots of Activity Breakdown tiles before and after the firelight glow enhancement
 */

import { test } from '@playwright/test';
import { chromium } from '@playwright/test';

const DEV_SERVER_URL = 'http://localhost:4200';
const TEST_ACCOUNT = 'splashbear';

test('capture breakdown tile screenshots', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to app...');
    await page.goto(DEV_SERVER_URL, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    // Search for test account
    console.log('Searching for account...');
    const searchInput = page.getByLabel(/Destiny username/i);
    await searchInput.fill(TEST_ACCOUNT);
    await page.getByRole('button', { name: /Search/i }).click();

    // Wait for modal
    await page.waitForSelector('text=Select Accounts', { timeout: 20000 });
    
    // Select first PlayStation account
    const selectButton = page.getByRole('button', { name: /PlayStation.*Select/i }).first();
    await selectButton.click();
    await page.waitForTimeout(1000);
    
    // Click Load button
    const loadButton = page.getByRole('button', { name: /Load Selected/i });
    await loadButton.click();
    
    console.log('Waiting for some loading to occur...');
    await page.waitForTimeout(10000); // Wait a bit for some data to load
    
    // Navigate to Activity Breakdown tab
    console.log('Navigating to Activity Breakdown tab...');
    const breakdownTab = page.getByRole('tab', { name: /Activity Breakdown/i });
    await breakdownTab.click();
    await page.waitForTimeout(2000);
    
    // Check if breakdown tiles are visible
    const tilesVisible = await page.locator('.breakdown-tile').count() > 0;
    
    if (tilesVisible) {
      console.log('Breakdown tiles found!');
      
      // Take BEFORE screenshot (no tiles selected)
      console.log('Taking BEFORE screenshot...');
      const tilesContainer = page.locator('.grid').filter({ has: page.locator('.breakdown-tile') }).first();
      await tilesContainer.screenshot({ 
        path: '/opt/cursor/artifacts/breakdown-tiles-before.png',
        animations: 'disabled'
      });
      
      // Select one tile (e.g., the first one)
      console.log('Selecting a tile...');
      const firstTile = page.locator('.breakdown-tile').first();
      await firstTile.click();
      await page.waitForTimeout(1000); // Wait for selection to register and animation to show
      
      // Verify it's selected
      const isSelected = await firstTile.evaluate(el => el.classList.contains('breakdown-tile-selected'));
      console.log(`First tile selected: ${isSelected}`);
      
      // Take AFTER screenshot (with firelight glow on selected tile)
      console.log('Taking AFTER screenshot...');
      await tilesContainer.screenshot({ 
        path: '/opt/cursor/artifacts/breakdown-tiles-after.png'
      });
      
      // Take a close-up crop of the selected tile next to an unselected one
      console.log('Taking close-up comparison screenshot...');
      // Get the first two tiles for side-by-side comparison
      const firstTwoTiles = page.locator('.breakdown-tile').nth(0).locator('..').locator('.breakdown-tile').nth(0).locator('..');
      // Actually, let's just screenshot the first 3 tiles to show selected vs unselected
      const tilesRow = page.locator('.grid').filter({ has: page.locator('.breakdown-tile') }).first();
      await tilesRow.screenshot({ 
        path: '/opt/cursor/artifacts/breakdown-tiles-closeup.png',
        clip: { x: 0, y: 0, width: 800, height: 200 }
      });
      
      console.log('✓ Screenshots saved to /opt/cursor/artifacts/');
    } else {
      console.log('No breakdown tiles found - may need more data loaded');
      // Take a full page screenshot anyway to see what's there
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/breakdown-page-state.png',
        fullPage: true
      });
    }
    
  } catch (error) {
    console.error('Screenshot capture error:', error);
    // Take error screenshot
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/breakdown-error-state.png',
      fullPage: true
    });
  } finally {
    await browser.close();
  }
});
