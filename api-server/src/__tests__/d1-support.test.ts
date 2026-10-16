/**
 * D1 support tests for ArchiveService and PlayedWithService.
 * 
 * Tests:
 * - D1 activity index lookup (act/mid_bucket=N/instances.parquet)
 * - D1 played-with lookup (pw/iid_band=N/pw.parquet)
 * - Bucket hash calculation (test vector: 4611686018443970323 -> 115)
 * - D1/D2 instance ID overlap handling (keyed by game + instance_id)
 * - Coverage caveat (billion 1 only, 1 to 1B)
 */

import { ArchiveService } from '../services/archive.service';
import { planBands, BAND_SIZE } from '../services/played-with.service';
import type { Database } from 'duckdb-async';
import * as fs from 'fs/promises';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'd1-support');

describe('D1 Support', () => {
  let db: Database | null = null;
  let d1IndexRoot: string;
  let d1PlayedWithRoot: string;

  beforeAll(async () => {
    // Create fixtures directory
    await fs.mkdir(FIXTURES_DIR, { recursive: true });

    d1IndexRoot = path.join(FIXTURES_DIR, 'd1_index');
    d1PlayedWithRoot = path.join(FIXTURES_DIR, 'd1_played_with');

    await fs.mkdir(path.join(d1IndexRoot, 'act'), { recursive: true });
    await fs.mkdir(path.join(d1PlayedWithRoot, 'pw'), { recursive: true });

    // Create test database
    try {
      const { Database: DuckDB } = await import('duckdb-async');
      db = await DuckDB.create(':memory:');
      await createD1TestFixtures(db);
    } catch (error) {
      console.warn('DuckDB not available, skipping D1 support tests', error);
    }
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    // Clean up fixtures
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  describe('Bucket hash calculation', () => {
    test('should calculate correct bucket for D1 test vector', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      const testMid = '4611686018443970323';
      const expectedBucket = 115;

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      await archiveService['initializeBucketHashType']();

      const bucket = await archiveService['calculateBucket'](testMid);
      expect(bucket).toBe(expectedBucket);
    });
  });

  describe('D1 activity index lookup', () => {
    test('should find D1 activities from act index', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      const testMid = '1000000000001';
      const bucket = 115; // Pre-calculated for this test

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      // Mock bucket calculation to return our known bucket
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(bucket);

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D1' });

      expect(result.tier.source).toBe('d1_act');
      expect(result.tier.level).toBe('partial'); // D1 always returns partial
      expect(result.tier.indexComplete).toBe(false);
      expect(result.activities.length).toBeGreaterThan(0);
      expect(result.activities[0].game).toBe('D1');
      expect(result.activities[0].membership_id).toBe(testMid);
      expect(result.tier.notes!.some(n => n.includes('billion 1 only'))).toBe(true);
    });

    test('should not return D1 data for D2 requests', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      const testMid = '1000000000001';

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D2' });

      // Should not find D1 activities when requesting D2
      expect(result.tier.source).not.toBe('d1_act');
    });

    test('should handle missing D1 bucket gracefully', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      const testMid = '9999999999999';
      const bucket = 42; // Non-existent bucket

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(bucket);

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D1' });

      expect(result.tier.level).toBe('partial'); // D1 always returns partial
      expect(result.tier.source).toBe('none');
      expect(result.tier.indexComplete).toBe(false);
      expect(result.activities).toHaveLength(0);
      expect(result.tier.notes).toBeDefined();
      expect(result.tier.notes!.some(n => n.includes('billion 1 only'))).toBe(true);
    });

    test('should handle NULL display_name in D1 data', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      const testMid = '1000000000002'; // Has NULL display_name
      const bucket = 115;

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(bucket);

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D1' });

      // Hard assertion: should find the test data
      expect(result.activities.length).toBeGreaterThan(0);
      // display_name should be empty string when NULL
      expect(result.activities[0].display_name).toBe('');
    });

    test('should handle character_id = 0 in D1 data (Bungie data)', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      const testMid = '1000000000003'; // Has character_id = 0
      const bucket = 115;

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(bucket);

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D1' });

      // Hard assertion: should find the test data
      expect(result.activities.length).toBeGreaterThan(0);
      const withZeroChar = result.activities.find(a => a.character_id === '0');
      expect(withZeroChar).toBeDefined();
    });
  });

  describe('D1 played-with band planning', () => {
    test('should plan D1 bands for instance IDs 1 to 1B when game=D1', () => {
      const cfg = {
        legacyRoot: '',
        compactRoot: '',
        splitIid: 10_000_000_000,
        compactMaxIid: 16_000_000_000,
        d1Root: d1PlayedWithRoot,
      };

      // D1 billion 1 instance IDs
      const d1Instances = ['100', '500000', '999999999'];
      const plan = planBands(d1Instances, cfg, new Set(), new Set(), 'D1');

      expect(plan.d1.size).toBeGreaterThan(0);
      expect(plan.uncovered).toHaveLength(0);
      
      // Verify band calculation for D1 (instance_id // 1,000,000)
      const band100 = Math.floor(100 / BAND_SIZE); // 0
      const band500k = Math.floor(500000 / BAND_SIZE); // 0
      const band999M = Math.floor(999999999 / BAND_SIZE); // 999

      expect(plan.d1.get(band100)).toContain('100');
      expect(plan.d1.get(band500k)).toContain('500000');
      expect(plan.d1.get(band999M)).toContain('999999999');
    });

    test('should not plan D1 bands for instance IDs above 1B', () => {
      const cfg = {
        legacyRoot: '',
        compactRoot: '',
        splitIid: 10_000_000_000,
        compactMaxIid: 16_000_000_000,
        d1Root: d1PlayedWithRoot,
      };

      const aboveBillion1 = ['1000000001', '2000000000'];
      const plan = planBands(aboveBillion1, cfg, new Set(), new Set(), 'D1');

      expect(plan.d1.size).toBe(0);
      // These should be uncovered (no D1 data above billion 1)
      expect(plan.uncovered.length).toBeGreaterThan(0);
    });

    test('should not plan D1 bands when game=D2 or game is not specified', () => {
      const cfg = {
        legacyRoot: '',
        compactRoot: '',
        splitIid: 10_000_000_000,
        compactMaxIid: 16_000_000_000,
        d1Root: d1PlayedWithRoot,
      };

      const d1RangeIds = ['100', '500000'];
      const planD2 = planBands(d1RangeIds, cfg, new Set(), new Set(), 'D2');
      const planUnspecified = planBands(d1RangeIds, cfg, new Set(), new Set());

      // D1 bands should not be planned for D2 or unspecified game
      expect(planD2.d1.size).toBe(0);
      expect(planUnspecified.d1.size).toBe(0);
    });

    test('should handle D1 and D2 instance ID overlap correctly with explicit game parameter', () => {
      const cfg = {
        legacyRoot: '/d2/legacy',
        compactRoot: '/d2/compact',
        splitIid: 10_000_000_000,
        compactMaxIid: 16_000_000_000,
        d1Root: d1PlayedWithRoot,
      };

      // Instance IDs that exist in both D1 and D2 ranges
      const overlappingIds = ['12345678', '987654321'];
      
      // When game=D1, should use D1 plans
      const planD1 = planBands(overlappingIds, cfg, new Set(), new Set(), 'D1');
      expect(planD1.d1.size).toBeGreaterThan(0);
      
      const band1 = Math.floor(12345678 / BAND_SIZE);
      const band2 = Math.floor(987654321 / BAND_SIZE);
      expect(planD1.d1.get(band1)).toContain('12345678');
      expect(planD1.d1.get(band2)).toContain('987654321');
      
      // When game=D2 or unspecified, should use D2 legacy bands
      const planD2 = planBands(overlappingIds, cfg, new Set(), new Set(), 'D2');
      expect(planD2.d1.size).toBe(0);
      expect(planD2.legacy.size).toBeGreaterThan(0);
    });
  });

  describe('D1/D2 instance ID separation', () => {
    test('should keep D1 and D2 games separate by (game, instance_id) key', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      // This test verifies conceptually that D1 and D2 are keyed separately
      // In practice, the getActivitiesByInstanceId method filters by game parameter
      // We test this through the multi-tier lookup with game parameter
      const testMid = '1000000000001';
      const bucket = 115;

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(bucket);

      // Request D1 game - should get D1 results
      const d1Result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D1' });
      
      // Request D2 game - should not get D1 results
      const d2Result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D2' });

      // D1 request should find D1 data
      expect(d1Result.tier.source).toBe('d1_act');
      expect(d1Result.activities.every(a => a.game === 'D1')).toBe(true);
      
      // D2 request should not find D1 data (would be absent or from other tiers)
      expect(d2Result.tier.source).not.toBe('d1_act');
      if (d2Result.activities.length > 0) {
        expect(d2Result.activities.every(a => a.game === 'D2')).toBe(true);
      }
    });
  });

  describe('Account key format', () => {
    test('account key should be platform + membershipId, not name', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      // Use the test data we created in fixtures (membership_id 1000000000001)
      const testMid = '1000000000001';
      const testPlatform = 2; // Xbox
      const bucket = 115;

      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(bucket);

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D1' });

      // Hard assertion: should find the test data
      expect(result.activities.length).toBeGreaterThan(0);
      // Verify we're using membership_id, not display_name as key
      expect(result.activities[0].membership_id).toBe(testMid);
      expect(result.activities[0].membership_type).toBe(testPlatform);
      // Display name may be empty but should not be used as key
      expect(typeof result.activities[0].display_name).toBe('string');
    });
  });

  describe('Real DuckDB integration test', () => {
    test('should read D1 parquet with NULL display_name, character_id=0, and large membership_id', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      // Create a real parquet file with edge cases
      const testBucketDir = path.join(d1IndexRoot, 'act', 'mid_bucket=200');
      await fs.mkdir(testBucketDir, { recursive: true });
      const testPath = path.join(testBucketDir, 'instances.parquet');

      // Test membership ID above 2^53 (9007199254740992) as string
      const largeMid = '9007199254740993';
      
      await db.all(`
        CREATE TEMP TABLE d1_edge_cases (
          instance_id BIGINT,
          period TIMESTAMP,
          activity_hash UINTEGER,
          mode SMALLINT,
          membership_id BIGINT,
          membership_type TINYINT,
          character_id BIGINT,
          completed BOOLEAN,
          deaths INTEGER,
          kills INTEGER,
          assists INTEGER,
          duration_seconds INTEGER,
          game VARCHAR,
          display_name VARCHAR,
          mid_bucket BIGINT
        )
      `);

      await db.all(`
        INSERT INTO d1_edge_cases VALUES
          (200001, '2014-09-10 10:00:00', 1234567890, 6, ${largeMid}, 2, 2305843009400000030, true, 5, 150, 20, 1800, 'D1', 'TestGuardian', 200),
          (200002, '2014-09-11 11:00:00', 1234567891, 4, ${largeMid}, 2, 0, true, 3, 120, 15, 1200, 'D1', 'TestGuardian', 200),
          (200003, '2014-09-12 12:00:00', 1234567892, 2, ${largeMid}, 1, 2305843009400000031, false, 10, 50, 5, 600, 'D1', NULL, 200)
      `);

      await db.all(`COPY d1_edge_cases TO '${testPath.replace(/\\/g, '/')}' (FORMAT PARQUET)`);
      await db.all('DROP TABLE d1_edge_cases');

      // Now test through the service
      const archiveService = new ArchiveService('', '', '', '', '', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      // Mock bucket calculation to return 200
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(200);

      const result = await archiveService.getPlayerActivitiesMultiTier(largeMid, { game: 'D1' });

      // Hard assertions
      expect(result.tier.source).toBe('d1_act');
      expect(result.tier.level).toBe('partial'); // D1 always returns partial
      expect(result.tier.indexComplete).toBe(false); // D1 is incomplete
      expect(result.activities.length).toBe(3);
      
      // Check large membership_id preserved as string
      expect(result.activities[0].membership_id).toBe(largeMid);
      
      // Check character_id = 0 preserved
      const withZeroChar = result.activities.find(a => a.character_id === '0');
      expect(withZeroChar).toBeDefined();
      
      // Check NULL display_name converted to empty string
      const withNullName = result.activities.find(a => a.display_name === '');
      expect(withNullName).toBeDefined();
      
      // Check coverage note always present
      expect(result.tier.notes).toBeDefined();
      expect(result.tier.notes!.some(n => n.includes('billion 1 only'))).toBe(true);
    });
  });

  describe('D1 with COMPACT_INDEX_ROOT set', () => {
    test('should skip compact tier and go straight to D1 tier when game=D1', async () => {
      if (!db) {
        console.warn('Skipping test: DuckDB not available');
        return;
      }

      const testMid = '1000000000001';
      const bucket = 115;

      // Create an archive service with COMPACT_INDEX_ROOT set
      const archiveService = new ArchiveService('', '', '', '', '/fake/compact', '', false, '', false, d1IndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['bucketHashType'] = 'VARCHAR';
      
      jest.spyOn(archiveService as any, 'calculateBucket').mockResolvedValue(bucket);

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid, { game: 'D1' });

      // Should go directly to D1 tier, not compact
      expect(result.tier.source).toBe('d1_act');
      expect(result.tier.level).toBe('partial');
      expect(result.tier.indexComplete).toBe(false);
    });
  });
});

/**
 * Create D1 test fixtures in DuckDB memory database.
 * Generates small parquet files for D1 act and pw indexes.
 */
async function createD1TestFixtures(db: Database): Promise<void> {
  // Create D1 act bucket fixture (mid_bucket=115)
  const bucket115Dir = path.join(FIXTURES_DIR, 'd1_index', 'act', 'mid_bucket=115');
  await fs.mkdir(bucket115Dir, { recursive: true });
  const actPath = path.join(bucket115Dir, 'instances.parquet');

  // Sample D1 activities data
  await db.all(`
    CREATE TEMP TABLE d1_act_data (
      instance_id BIGINT,
      period TIMESTAMP,
      activity_hash UINTEGER,
      mode SMALLINT,
      membership_id BIGINT,
      membership_type TINYINT,
      character_id BIGINT,
      completed BOOLEAN,
      deaths INTEGER,
      kills INTEGER,
      assists INTEGER,
      duration_seconds INTEGER,
      game VARCHAR,
      display_name VARCHAR,
      mid_bucket BIGINT
    )
  `);

  await db.all(`
    INSERT INTO d1_act_data VALUES
      (100001, '2014-09-06 17:45:00', 1234567890, 6, 1000000000001, 2, 2305843009400000028, true, 5, 150, 20, 1800, 'D1', 'TestGuardian1', 115),
      (100002, '2014-09-07 18:30:00', 1234567891, 4, 1000000000001, 2, 2305843009400000028, true, 3, 120, 15, 1200, 'D1', 'TestGuardian1', 115),
      (100003, '2014-09-08 19:15:00', 1234567892, 2, 1000000000002, 1, 2305843009400000029, false, 10, 50, 5, 600, 'D1', NULL, 115),
      (100004, '2014-11-17 16:37:00', 1234567893, 6, 1000000000003, 2, 0, true, 7, 100, 10, 900, 'D1', 'TestGuardian3', 115)
  `);

  await db.all(`COPY d1_act_data TO '${actPath.replace(/\\/g, '/')}' (FORMAT PARQUET)`);
  await db.all('DROP TABLE d1_act_data');

  // Create D1 played-with band fixtures (iid_band=0 for instance IDs < 1M)
  const band0Dir = path.join(FIXTURES_DIR, 'd1_played_with', 'pw', 'iid_band=0');
  await fs.mkdir(band0Dir, { recursive: true });
  const pwPath = path.join(band0Dir, 'pw.parquet');

  await db.all(`
    CREATE TEMP TABLE d1_pw_data (
      instance_id BIGINT,
      membership_id BIGINT,
      membership_type TINYINT,
      period TIMESTAMP,
      activity_hash UINTEGER,
      mode SMALLINT,
      iid_band BIGINT
    )
  `);

  await db.all(`
    INSERT INTO d1_pw_data VALUES
      (100001, 1000000000001, 2, '2014-09-06 17:45:00', 1234567890, 6, 0),
      (100001, 2000000000001, 1, '2014-09-06 17:45:00', 1234567890, 6, 0),
      (100002, 1000000000001, 2, '2014-09-07 18:30:00', 1234567891, 4, 0),
      (100002, 2000000000002, 2, '2014-09-07 18:30:00', 1234567891, 4, 0)
  `);

  await db.all(`COPY d1_pw_data TO '${pwPath.replace(/\\/g, '/')}' (FORMAT PARQUET)`);
  await db.all('DROP TABLE d1_pw_data');
}
