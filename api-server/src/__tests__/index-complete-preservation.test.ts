/**
 * Tests for indexComplete preservation in definite absent responses
 */

import { ArchiveService } from '../services/archive.service';
import { Database } from 'duckdb-async';
import * as fs from 'fs/promises';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'index-complete');

describe('IndexComplete Preservation', () => {
  let db: Database;
  let compactIndexRoot: string;

  beforeAll(async () => {
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    compactIndexRoot = path.join(FIXTURES_DIR, 'compact');
    await fs.mkdir(compactIndexRoot, { recursive: true });
    
    db = await Database.create(':memory:');
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  test('definite absent in finished bucket should preserve indexComplete:true', async () => {
    const testMid = '3000000000001';
    
    // Calculate bucket
    const bucketResult = await db.all('SELECT (hash(CAST(? AS VARCHAR)) % 256) AS bucket', testMid);
    const bucket = Number(bucketResult[0].bucket);
    
    const bucketDir = path.join(compactIndexRoot, `mid_bucket=${bucket}`);
    await fs.mkdir(bucketDir, { recursive: true });
    
    // Create marker but NO instances file (definite absent in finished bucket)
    const markerPath = path.join(bucketDir, '_COMPLETE.json');
    await fs.writeFile(markerPath, JSON.stringify({ completed_at: '2026-09-24T00:00:00Z' }));

    const archiveService = new ArchiveService('', '', '', '', compactIndexRoot);
    archiveService['db'] = db;
    archiveService['archiveAvailable'] = true;
    archiveService['compactIndexRoot'] = compactIndexRoot;
    await archiveService['initializeBucketHashType']();

    const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

    // Should be absent with indexComplete:true (bucket is finished, player definitely not there)
    expect(result.tier.level).toBe('absent');
    expect(result.tier.source).toBe('none');
    expect(result.tier.indexComplete).toBe(true);
  });

  test('compact tier error should preserve error note in final result', async () => {
    const testMid = '3000000000002';
    
    // Calculate bucket
    const bucketResult = await db.all('SELECT (hash(CAST(? AS VARCHAR)) % 256) AS bucket', testMid);
    const bucket = Number(bucketResult[0].bucket);
    
    const bucketDir = path.join(compactIndexRoot, `mid_bucket=${bucket}`);
    await fs.mkdir(bucketDir, { recursive: true });
    
    // Create marker and corrupt instances file
    const markerPath = path.join(bucketDir, '_COMPLETE.json');
    await fs.writeFile(markerPath, JSON.stringify({ completed_at: '2026-09-24T00:00:00Z' }));
    
    const instancesPath = path.join(bucketDir, 'instances.parquet');
    await fs.writeFile(instancesPath, 'not a parquet file');

    const archiveService = new ArchiveService('', '', '', '', compactIndexRoot);
    archiveService['db'] = db;
    archiveService['archiveAvailable'] = true;
    archiveService['compactIndexRoot'] = compactIndexRoot;
    await archiveService['initializeBucketHashType']();

    const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

    // Error from compact tier should appear in notes
    expect(result.tier.notes).toBeDefined();
    expect(result.tier.notes!.some(note => note.toLowerCase().includes('compact'))).toBe(true);
  });
});
