/**
 * Tests for partial coverage protection (old client safety)
 */

import { ArchiveService } from '../services/archive.service';
import { Database } from 'duckdb-async';
import * as fs from 'fs/promises';
import * as path from 'path';
import express, { Express } from 'express';
import { createPlayerActivitiesRouter } from '../routes/player-activities.routes';
import { WatermarkService } from '../services/watermark.service';
import request from 'supertest';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'partial-protection');

describe('Partial Coverage Protection', () => {
  let db: Database;
  let compactIndexRoot: string;
  let app: Express;
  let archiveService: ArchiveService;
  let watermarkService: WatermarkService;

  beforeAll(async () => {
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    compactIndexRoot = path.join(FIXTURES_DIR, 'compact');
    await fs.mkdir(compactIndexRoot, { recursive: true });
    
    db = await Database.create(':memory:');
    
    // Create test data for a partial-only mid
    const testMid = '4000000000001';
    const bucketResult = await db.all('SELECT (hash(CAST(? AS VARCHAR)) % 256) AS bucket', testMid);
    const bucket = Number(bucketResult[0].bucket);
    
    const bucketDir = path.join(compactIndexRoot, `mid_bucket=${bucket}`);
    await fs.mkdir(bucketDir, { recursive: true });
    
    const instancesPath = path.join(bucketDir, 'instances.parquet');
    await db.all(`
      COPY (
        SELECT
          '12345678901' AS activity_instance_id,
          '${testMid}' AS membership_id,
          '2305843009504575107' AS character_id
        UNION ALL
        SELECT '12345678902', '${testMid}', '2305843009504575107'
        UNION ALL
        SELECT '12345678901', '${testMid}', '2305843009504575108'
      ) TO '${instancesPath}' (FORMAT PARQUET, COMPRESSION ZSTD)
    `);
    
    const markerPath = path.join(bucketDir, '_COMPLETE.json');
    await fs.writeFile(markerPath, JSON.stringify({ completed_at: '2026-09-24T00:00:00Z' }));

    // Set up express app
    archiveService = new ArchiveService('', '', '', '', compactIndexRoot);
    archiveService['db'] = db;
    archiveService['archiveAvailable'] = true;
    archiveService['compactIndexRoot'] = compactIndexRoot;
    await archiveService['initializeBucketHashType']();
    
    watermarkService = new WatermarkService('');
    
    app = express();
    app.use(express.json());
    app.use('/players', createPlayerActivitiesRouter(archiveService, watermarkService));
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  test('GET without includePartial should return rowCount:0, empty activities', async () => {
    const response = await request(app)
      .get('/players/4000000000001/activities')
      .expect(200);

    expect(response.body.coverage.level).toBe('partial');
    expect(response.body.coverage.rowCount).toBe(0);  // Old client safety
    expect(response.body.activities).toEqual([]);
    expect(response.body.partialInstanceIds).toBeUndefined();
  });

  test('GET with includePartial=1 should return unique IDs in partialInstanceIds', async () => {
    const response = await request(app)
      .get('/players/4000000000001/activities?includePartial=1')
      .expect(200);

    expect(response.body.coverage.level).toBe('partial');
    expect(response.body.coverage.rowCount).toBe(0);  // Still 0
    expect(response.body.activities).toEqual([]);
    expect(response.body.partialInstanceIds).toBeDefined();
    expect(response.body.partialInstanceIds.length).toBe(2);  // 2 unique IDs (one duplicate removed)
    expect(response.body.partialInstanceIds).toContain('12345678901');
    expect(response.body.partialInstanceIds).toContain('12345678902');
    expect(response.body.coverage.distinctInstances).toBeUndefined();  // Omitted on partial
  });

  test('POST batch without includePartial should protect all responses', async () => {
    const response = await request(app)
      .post('/players/activities/batch')
      .send({ membershipIds: ['4000000000001'] })
      .expect(200);

    const result = response.body['4000000000001'];
    expect(result.coverage.level).toBe('partial');
    expect(result.coverage.rowCount).toBe(0);
    expect(result.activities).toEqual([]);
    expect(result.partialInstanceIds).toBeUndefined();
  });

  test('POST batch with includePartial should return unique IDs', async () => {
    const response = await request(app)
      .post('/players/activities/batch')
      .send({ membershipIds: ['4000000000001'], includePartial: true })
      .expect(200);

    const result = response.body['4000000000001'];
    expect(result.coverage.level).toBe('partial');
    expect(result.coverage.rowCount).toBe(0);
    expect(result.activities).toEqual([]);
    expect(result.partialInstanceIds).toBeDefined();
    expect(result.partialInstanceIds.length).toBe(2);  // Unique only
  });
});
