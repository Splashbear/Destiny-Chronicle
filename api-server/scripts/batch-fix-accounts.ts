#!/usr/bin/env ts-node
/**
 * Batch pre-fix flagged PGCRs for accounts.
 * 
 * Reads accounts from leaderboard_seeds.json and seeds.json in the Played With summaries directory,
 * collects their flagged D2 games from the archive, fetches corrected copies from Bungie,
 * and saves them to the override store.
 * 
 * Usage:
 *   ts-node batch-fix-accounts.ts [--accounts account1,account2,...] [--dry-run]
 * 
 * Environment variables:
 *   FLAG_LOOKUP_ROOT - Path to flag lookup directory
 *   PGCR_OVERRIDE_STORE_ROOT - Path to override store directory
 *   PGCR_LEAN_ACTIVITIES_PATH - Path to archive for getting account activities
 *   BUNGIE_API_KEY or BUNGIE_API_KEY_FILE - Bungie API key
 *   PLAYED_WITH_SUMMARY_DIR - Directory containing seeds.json and leaderboard_seeds.json
 *   PLAYED_WITH_POST_ARCHIVE_DIR - Shared post-archive directory (for Bungie rate limiting)
 *   PLAYED_WITH_BUNGIE_PARALLEL - Parallel Bungie fetches (default: 10)
 * 
 * Rate limiting:
 *   - Respects PLAYED_WITH_BUNGIE_PARALLEL (default 10 concurrent requests)
 *   - Uses shared rate limiter if PLAYED_WITH_POST_ARCHIVE_DIR is set
 *   - Handles Bungie errors gracefully (privacy, not found, disabled)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'duckdb-async';

// Parse command-line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const accountsArg = args.find((a) => a.startsWith('--accounts='));
const specificAccounts = accountsArg ? accountsArg.split('=')[1].split(',') : null;

// Environment configuration
const FLAG_LOOKUP_ROOT = process.env.FLAG_LOOKUP_ROOT || '';
const PGCR_OVERRIDE_STORE_ROOT = process.env.PGCR_OVERRIDE_STORE_ROOT || '';
const LEAN_ACTIVITIES_PATH = process.env.PGCR_LEAN_ACTIVITIES_PATH || '';
const BUNGIE_API_KEY = process.env.BUNGIE_API_KEY || (process.env.BUNGIE_API_KEY_FILE ? fs.readFileSync(process.env.BUNGIE_API_KEY_FILE, 'utf8').trim() : '');
const SUMMARY_DIR = process.env.PLAYED_WITH_SUMMARY_DIR || '';
const PARALLEL = parseInt(process.env.PLAYED_WITH_BUNGIE_PARALLEL || '10', 10);

interface Account {
  platform: number;
  membershipId: string;
}

interface Stats {
  accountsProcessed: number;
  totalActivities: number;
  flaggedActivities: number;
  alreadyFixed: number;
  newlyFixed: number;
  failedToFix: number;
  errors: Array<{ account: string; error: string }>;
}

const BAND_SIZE = 10_000_000;

/**
 * Load accounts from seeds files.
 */
function loadSeedsAccounts(): Account[] {
  const accounts: Account[] = [];
  
  if (!SUMMARY_DIR) {
    console.error('Error: PLAYED_WITH_SUMMARY_DIR not configured');
    process.exit(1);
  }

  const seedFiles = [
    path.join(SUMMARY_DIR, 'leaderboard_seeds.json'),
    path.join(SUMMARY_DIR, 'seeds.json'),
  ];

  for (const file of seedFiles) {
    if (!fs.existsSync(file)) {
      console.warn(`Seeds file not found: ${file}`);
      continue;
    }

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.platform && item.membershipId) {
            accounts.push({
              platform: Number(item.platform),
              membershipId: String(item.membershipId),
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read seeds file ${file}:`, error);
    }
  }

  // Dedupe by membershipId
  const seen = new Set<string>();
  return accounts.filter((a) => {
    if (seen.has(a.membershipId)) return false;
    seen.add(a.membershipId);
    return true;
  });
}

/**
 * Load flag lookup band.
 */
function loadFlagBand(bandId: number): Set<bigint> {
  const bandFile = path.join(FLAG_LOOKUP_ROOT, `band_${bandId}.bin`);
  if (!fs.existsSync(bandFile)) {
    return new Set();
  }

  try {
    const buffer = fs.readFileSync(bandFile);
    const count = buffer.length / 8;
    const flags = new Set<bigint>();

    for (let i = 0; i < count; i++) {
      const offset = i * 8;
      const id = buffer.readBigUInt64LE(offset);
      flags.add(id);
    }

    return flags;
  } catch (error) {
    console.error(`Failed to load flag band ${bandId}:`, error);
    return new Set();
  }
}

/**
 * Check if override exists.
 */
function overrideExists(instanceId: string): boolean {
  const bandDir = String(Math.floor(Number(instanceId) / 1e6));
  const filePath = path.join(PGCR_OVERRIDE_STORE_ROOT, 'D2', bandDir, `${instanceId}.json.gz`);
  return fs.existsSync(filePath);
}

/**
 * Get D2 activities for an account from archive.
 */
async function getAccountActivities(db: Database, membershipId: string): Promise<string[]> {
  try {
    const sql = `
      SELECT DISTINCT instance_id
      FROM read_parquet(?)
      WHERE membership_id = ?
        AND LOWER(game) = 'd2'
      ORDER BY instance_id DESC
    `;

    const rows = await db.all(sql, LEAN_ACTIVITIES_PATH, membershipId);
    return rows.map((r: any) => String(r.instance_id));
  } catch (error) {
    console.error(`Failed to get activities for ${membershipId}:`, error);
    return [];
  }
}

/**
 * Fetch PGCR from Bungie and save to override store.
 */
async function fetchAndSave(instanceId: string): Promise<boolean> {
  const url = `https://stats.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-API-Key': BUNGIE_API_KEY,
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (response.status === 404 || data?.ErrorCode === 1653) {
        // Not found - permanent failure
        return false;
      }
      throw new Error(`HTTP ${response.status} ${data?.ErrorStatus || ''}`);
    }

    const data = await response.json();
    if (data.ErrorCode !== 1) {
      throw new Error(`ErrorCode ${data.ErrorCode} ${data.ErrorStatus || ''}`);
    }

    // Save to override store
    const bandDir = String(Math.floor(Number(instanceId) / 1e6));
    const filePath = path.join(PGCR_OVERRIDE_STORE_ROOT, 'D2', bandDir, `${instanceId}.json.gz`);
    
    if (!dryRun) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const zlib = require('zlib');
      const json = JSON.stringify(data);
      const compressed = zlib.gzipSync(json);
      
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, compressed);
      fs.renameSync(tmpPath, filePath);
    }

    return true;
  } catch (error: any) {
    // Check for permanent errors
    if (error.message?.includes('Privacy') || error.message?.includes('NotFound')) {
      return false;
    }
    throw error;
  }
}

/**
 * Process one account.
 */
async function processAccount(
  db: Database,
  account: Account,
  flagBands: Map<number, Set<bigint>>,
  stats: Stats
): Promise<void> {
  console.log(`\nProcessing ${account.membershipId}...`);

  const activities = await getAccountActivities(db, account.membershipId);
  stats.totalActivities += activities.length;
  console.log(`  Found ${activities.length} D2 activities`);

  const flagged: string[] = [];
  for (const iid of activities) {
    const idNum = BigInt(iid);
    const bandId = Number(idNum / BigInt(BAND_SIZE));
    
    let band = flagBands.get(bandId);
    if (!band) {
      band = loadFlagBand(bandId);
      flagBands.set(bandId, band);
    }

    if (band.has(idNum)) {
      flagged.push(iid);
    }
  }

  stats.flaggedActivities += flagged.length;
  console.log(`  ${flagged.length} flagged activities`);

  if (flagged.length === 0) {
    stats.accountsProcessed++;
    return;
  }

  // Check which ones already have overrides
  const needFix = flagged.filter((iid) => !overrideExists(iid));
  stats.alreadyFixed += flagged.length - needFix.length;

  if (needFix.length === 0) {
    console.log(`  All flagged activities already fixed`);
    stats.accountsProcessed++;
    return;
  }

  console.log(`  ${needFix.length} need fixing...`);

  // Fetch in parallel
  let next = 0;
  let done = 0;
  const workers = Math.min(PARALLEL, needFix.length);

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < needFix.length) {
        const iid = needFix[next++];
        try {
          const success = await fetchAndSave(iid);
          if (success) {
            stats.newlyFixed++;
          } else {
            stats.failedToFix++;
          }
        } catch (error) {
          stats.failedToFix++;
          console.error(`    Failed to fix ${iid}:`, error);
        }
        done++;
        if (done % 10 === 0 || done === needFix.length) {
          console.log(`    Progress: ${done}/${needFix.length}`);
        }
      }
    })
  );

  stats.accountsProcessed++;
}

/**
 * Main entry point.
 */
async function main() {
  console.log('=== Batch Fix Flagged PGCRs ===');
  console.log(`Dry run: ${dryRun}`);
  console.log(`Parallel: ${PARALLEL}`);

  // Validate environment
  if (!FLAG_LOOKUP_ROOT || !fs.existsSync(FLAG_LOOKUP_ROOT)) {
    console.error('Error: FLAG_LOOKUP_ROOT not configured or not accessible');
    process.exit(1);
  }

  if (!PGCR_OVERRIDE_STORE_ROOT) {
    console.error('Error: PGCR_OVERRIDE_STORE_ROOT not configured');
    process.exit(1);
  }

  if (!LEAN_ACTIVITIES_PATH || !fs.existsSync(LEAN_ACTIVITIES_PATH)) {
    console.error('Error: PGCR_LEAN_ACTIVITIES_PATH not configured or not accessible');
    process.exit(1);
  }

  if (!BUNGIE_API_KEY) {
    console.error('Error: BUNGIE_API_KEY or BUNGIE_API_KEY_FILE not configured');
    process.exit(1);
  }

  // Load accounts
  const allAccounts = specificAccounts
    ? specificAccounts.map((mid) => ({ platform: 0, membershipId: mid }))
    : loadSeedsAccounts();

  console.log(`\nLoaded ${allAccounts.length} accounts`);

  if (allAccounts.length === 0) {
    console.log('No accounts to process');
    return;
  }

  // Initialize DuckDB
  const db = await Database.create(':memory:');
  await db.all('SET threads=4');

  // Process accounts
  const stats: Stats = {
    accountsProcessed: 0,
    totalActivities: 0,
    flaggedActivities: 0,
    alreadyFixed: 0,
    newlyFixed: 0,
    failedToFix: 0,
    errors: [],
  };

  const flagBands = new Map<number, Set<bigint>>();

  for (const account of allAccounts) {
    try {
      await processAccount(db, account, flagBands, stats);
    } catch (error) {
      console.error(`Error processing ${account.membershipId}:`, error);
      stats.errors.push({
        account: account.membershipId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await db.close();

  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Accounts processed: ${stats.accountsProcessed}/${allAccounts.length}`);
  console.log(`Total activities: ${stats.totalActivities.toLocaleString()}`);
  console.log(`Flagged activities: ${stats.flaggedActivities.toLocaleString()}`);
  console.log(`Already fixed: ${stats.alreadyFixed.toLocaleString()}`);
  console.log(`Newly fixed: ${stats.newlyFixed.toLocaleString()}`);
  console.log(`Failed to fix: ${stats.failedToFix.toLocaleString()}`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors: ${stats.errors.length}`);
    for (const err of stats.errors) {
      console.log(`  ${err.account}: ${err.error}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run - no changes made');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
