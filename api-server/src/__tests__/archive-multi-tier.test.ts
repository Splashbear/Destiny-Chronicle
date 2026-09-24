/**
 * Multi-tier archive lookup tests for ArchiveService.
 * 
 * Tests:
 * - Bucket hash calculation with test vector
 * - Tier 1: Lite parquet lookup
 * - Tier 2: Per-mid extract lookup
 * - Tier 3: Compact index lookup
 * - Missing markers, missing buckets, invalid membership IDs
 */

import { ArchiveService } from '../services/archive.service';
import { Database } from 'duckdb-async';
import * as fs from 'fs/promises';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'multi-tier');

describe('ArchiveService Multi-Tier Lookup', () => {
  let db: Database;
  let archiveService: ArchiveService;
  let liteParquetPath: string;
  let extractDir: string;
  let compactIndexRoot: string;

  beforeAll(async () => {
    // Create fixtures directory
    await fs.mkdir(FIXTURES_DIR, { recursive: true });

    // Set up paths
    liteParquetPath = path.join(FIXTURES_DIR, 'lite.parquet');
    extractDir = path.join(FIXTURES_DIR, 'extracts');
    compactIndexRoot = path.join(FIXTURES_DIR, 'compact');

    await fs.mkdir(extractDir, { recursive: true });
    await fs.mkdir(compactIndexRoot, { recursive: true });

    // Create test parquet files
    db = await Database.create(':memory:');
    await createTestFixtures(db);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    // Clean up fixtures
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  describe('Bucket hash calculation', () => {
    test('should calculate correct bucket for test vector', async () => {
      const testMid = '4611686018443970323';
      const expectedBucket = 115;

      archiveService = new ArchiveService('', '', liteParquetPath, '', compactIndexRoot);
      archiveService['db'] = db;
      await archiveService['initializeBucketHashType']();

      const bucket = await archiveService['calculateBucket'](testMid);
      expect(bucket).toBe(expectedBucket);
    });

    test('should determine VARCHAR as hash type', async () => {
      archiveService = new ArchiveService('', '', liteParquetPath, '', compactIndexRoot);
      archiveService['db'] = db;
      await archiveService['initializeBucketHashType']();

      expect(archiveService['bucketHashType']).toBe('VARCHAR');
    });

    test('should return null for invalid membership ID', async () => {
      archiveService = new ArchiveService('', '', liteParquetPath, '', compactIndexRoot);
      archiveService['db'] = db;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier('invalid_id');
      expect(result.tier.level).toBe('absent');
      expect(result.tier.source).toBe('none');
      expect(result.activities).toHaveLength(0);
    });
  });

  describe('Tier 1: Lite parquet lookup', () => {
    test('should find activities in lite tier', async () => {
      const testMid = '1000000000001';

      archiveService = new ArchiveService('', '', liteParquetPath, extractDir, compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      expect(result.tier.level).toBe('full');
      expect(result.tier.source).toBe('lite');
      expect(result.activities.length).toBeGreaterThan(0);
      expect(result.activities[0].membership_id).toBe(testMid);
      expect(result.activities[0].period).toBeTruthy();
    });

    test('should handle missing lite file', async () => {
      const testMid = '1000000000002';

      archiveService = new ArchiveService('', '', '/nonexistent/lite.parquet', extractDir, compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      // Should fall back to extract tier
      expect(result.tier.source).not.toBe('lite');
    });
  });

  describe('Tier 2: Per-mid extract lookup', () => {
    test('should find activities in extract tier', async () => {
      const testMid = '1000000000002';

      archiveService = new ArchiveService('', '', '/nonexistent/lite.parquet', extractDir, compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['midLightExtractDir'] = extractDir;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      expect(result.tier.level).toBe('full');
      expect(result.tier.source).toBe('extract');
      expect(result.activities.length).toBeGreaterThan(0);
      expect(result.activities[0].membership_id).toBe(testMid);
    });

    test('should try multiple naming patterns', async () => {
      const testMid = '1000000000003';

      archiveService = new ArchiveService('', '', '/nonexistent/lite.parquet', extractDir, compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['midLightExtractDir'] = extractDir;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      expect(result.tier.level).toBe('full');
      expect(result.tier.source).toBe('extract');
    });
  });

  describe('Tier 3: Compact index lookup', () => {
    test('should find instance IDs in compact index tier', async () => {
      const testMid = '1000000000004';

      archiveService = new ArchiveService('', '', '/nonexistent/lite.parquet', '/nonexistent/extracts', compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['compactIndexRoot'] = compactIndexRoot;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      expect(result.tier.level).toBe('partial');
      expect(result.tier.source).toBe('compact_ids');
      expect(result.activities.length).toBeGreaterThan(0);
      expect(result.activities[0].instance_id).toBeTruthy();
      expect(result.activities[0].character_id).toBeTruthy();
      expect(result.activities[0].period).toBe('');
      expect(result.activities[0].activity_hash).toBe(0);
    });

    test('should handle missing completion marker', async () => {
      const testMid = '1000000000005';

      archiveService = new ArchiveService('', '', '/nonexistent/lite.parquet', '/nonexistent/extracts', compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['compactIndexRoot'] = compactIndexRoot;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      expect(result.tier.level).toBe('absent');
      expect(result.tier.source).toBe('none');
      expect(result.activities).toHaveLength(0);
    });

    test('should handle missing bucket directory', async () => {
      const testMid = '1000000000006';

      archiveService = new ArchiveService('', '', '/nonexistent/lite.parquet', '/nonexistent/extracts', compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      archiveService['compactIndexRoot'] = compactIndexRoot;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      expect(result.tier.level).toBe('absent');
      expect(result.tier.source).toBe('none');
    });
  });

  describe('Tier 4: No data found', () => {
    test('should return absent for unknown membership', async () => {
      const testMid = '9999999999999';

      archiveService = new ArchiveService('', '', liteParquetPath, extractDir, compactIndexRoot);
      archiveService['db'] = db;
      archiveService['archiveAvailable'] = true;
      await archiveService['initializeBucketHashType']();

      const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

      expect(result.tier.level).toBe('absent');
      expect(result.tier.source).toBe('none');
      expect(result.activities).toHaveLength(0);
    });
  });
});

/**
 * Create test fixtures using DuckDB.
 */
async function createTestFixtures(db: Database) {
  const liteParquetPath = path.join(FIXTURES_DIR, 'lite.parquet');
  const extractDir = path.join(FIXTURES_DIR, 'extracts');
  const compactIndexRoot = path.join(FIXTURES_DIR, 'compact');

  // Create lite parquet with one membership
  await db.all(`
    COPY (
      SELECT
        '12345678901' AS instance_id,
        '2021-04-23T19:30:00Z' AS period,
        123456 AS activity_hash,
        123456 AS director_activity_hash,
        4 AS mode,
        '1000000000001' AS membership_id,
        2 AS membership_type,
        'TestGuardian1' AS display_name,
        '2305843009504575107' AS character_id,
        true AS completed,
        5 AS deaths,
        150 AS kills,
        20 AS assists,
        1800 AS duration_seconds,
        0 AS standing,
        0 AS starting_phase_index,
        'fireteam123' AS fireteam_id,
        false AS is_private,
        'dump1' AS dump_id,
        'D2' AS game
      UNION ALL
      SELECT
        '12345678902', '2021-04-24T20:00:00Z', 123457, 123457, 4,
        '1000000000001', 2, 'TestGuardian1', '2305843009504575107',
        true, 3, 120, 15, 1200, 0, 0, 'fireteam124', false, 'dump1', 'D2'
    ) TO '${liteParquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD)
  `);

  // Create extract parquet for another membership (with _api.parquet pattern)
  const extractPath = path.join(extractDir, '1000000000002_api.parquet');
  await db.all(`
    COPY (
      SELECT
        '12345678903' AS instance_id,
        '2021-05-01T10:00:00Z' AS period,
        234567 AS activity_hash,
        4 AS mode,
        '1000000000002' AS membership_id,
        '2305843009504575108' AS character_id,
        true AS completed,
        2 AS deaths,
        3600 AS duration_seconds,
        'D2' AS game
    ) TO '${extractPath}' (FORMAT PARQUET, COMPRESSION ZSTD)
  `);

  // Create extract with different naming pattern (_light.parquet)
  const extractPath2 = path.join(extractDir, '1000000000003_light.parquet');
  await db.all(`
    COPY (
      SELECT
        '12345678904' AS instance_id,
        '2021-06-01T15:30:00Z' AS period,
        345678 AS activity_hash,
        5 AS mode,
        '1000000000003' AS membership_id,
        '2305843009504575109' AS character_id,
        true AS completed,
        4 AS deaths,
        2400 AS duration_seconds,
        'D2' AS game
    ) TO '${extractPath2}' (FORMAT PARQUET, COMPRESSION ZSTD)
  `);

  // Create compact index for test mid 1000000000004
  // First calculate its bucket
  const testMid = '1000000000004';
  const bucketResult = await db.all('SELECT (hash(CAST(? AS BIGINT)) % 256) AS bucket', testMid);
  const bucket = bucketResult[0].bucket;

  const bucketDir = path.join(compactIndexRoot, `mid_bucket=${bucket}`);
  await fs.mkdir(bucketDir, { recursive: true });

  const instancesPath = path.join(bucketDir, 'instances.parquet');
  await db.all(`
    COPY (
      SELECT
        '12345678905' AS activity_instance_id,
        '1000000000004' AS membership_id,
        '2305843009504575110' AS character_id
      UNION ALL
      SELECT
        '12345678906', '1000000000004', '2305843009504575110'
    ) TO '${instancesPath}' (FORMAT PARQUET, COMPRESSION ZSTD)
  `);

  // Create completion marker
  const markerPath = path.join(bucketDir, '_COMPLETE.json');
  await fs.writeFile(markerPath, JSON.stringify({ completed_at: '2026-09-24T00:00:00Z' }));

  // Create bucket without completion marker for test mid 1000000000005
  const testMid2 = '1000000000005';
  const bucketResult2 = await db.all('SELECT (hash(CAST(? AS BIGINT)) % 256) AS bucket', testMid2);
  const bucket2 = bucketResult2[0].bucket;

  if (bucket2 !== bucket) {
    const bucketDir2 = path.join(compactIndexRoot, `mid_bucket=${bucket2}`);
    await fs.mkdir(bucketDir2, { recursive: true });

    const instancesPath2 = path.join(bucketDir2, 'instances.parquet');
    await db.all(`
      COPY (
        SELECT
          '12345678907' AS activity_instance_id,
          '1000000000005' AS membership_id,
          '2305843009504575111' AS character_id
      ) TO '${instancesPath2}' (FORMAT PARQUET, COMPRESSION ZSTD)
    `);
    // Note: No _COMPLETE.json marker
  }
}
