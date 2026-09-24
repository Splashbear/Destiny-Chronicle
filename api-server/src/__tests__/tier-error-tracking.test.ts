/**
 * Tests for tier error tracking in coverage.notes
 */

import { ArchiveService } from '../services/archive.service';
import { Database } from 'duckdb-async';
import * as fs from 'fs/promises';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'tier-errors');

describe('Tier Error Tracking', () => {
  let db: Database;
  let extractDir: string;

  beforeAll(async () => {
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    extractDir = path.join(FIXTURES_DIR, 'extracts');
    await fs.mkdir(extractDir, { recursive: true });
    
    db = await Database.create(':memory:');
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  test('corrupt extract file should report error in coverage.notes', async () => {
    const testMid = '2000000000001';
    
    // Create a corrupt parquet file (just write garbage)
    const corruptFile = path.join(extractDir, `mid_${testMid}_light_api.parquet`);
    await fs.writeFile(corruptFile, 'this is not a valid parquet file');

    const archiveService = new ArchiveService('', '', '', extractDir, '');
    archiveService['db'] = db;
    archiveService['archiveAvailable'] = true;
    archiveService['midLightExtractDir'] = extractDir;

    const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

    // Should report error in notes
    expect(result.tier.notes).toBeDefined();
    expect(result.tier.notes!.length).toBeGreaterThan(0);
    expect(result.tier.notes!.some(note => note.includes('extract:'))).toBe(true);
    expect(result.tier.notes!.some(note => note.includes('unreadable'))).toBe(true);
    // Should include filename without directory
    expect(result.tier.notes!.some(note => note.includes(`mid_${testMid}_light_api.parquet`))).toBe(true);
  });

  test('multiple corrupt files should accumulate errors in notes', async () => {
    const testMid = '2000000000002';
    
    // Create two corrupt files
    const corruptFile1 = path.join(extractDir, `mid_${testMid}_light_api.parquet`);
    const corruptFile2 = path.join(extractDir, `mid_${testMid}_light.parquet`);
    await fs.writeFile(corruptFile1, 'garbage1');
    await fs.writeFile(corruptFile2, 'garbage2');

    const archiveService = new ArchiveService('', '', '', extractDir, '');
    archiveService['db'] = db;
    archiveService['archiveAvailable'] = true;
    archiveService['midLightExtractDir'] = extractDir;

    const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

    // Should report both errors
    expect(result.tier.notes).toBeDefined();
    expect(result.tier.notes!.length).toBeGreaterThanOrEqual(2);
    expect(result.tier.notes!.some(note => note.includes('light_api.parquet'))).toBe(true);
    expect(result.tier.notes!.some(note => note.includes('light.parquet'))).toBe(true);
  });

  test('missing file should not create error note', async () => {
    const testMid = '2000000000003';
    
    // Don't create any file - should just be absent without errors

    const archiveService = new ArchiveService('', '', '', extractDir, '');
    archiveService['db'] = db;
    archiveService['archiveAvailable'] = true;
    archiveService['midLightExtractDir'] = extractDir;

    const result = await archiveService.getPlayerActivitiesMultiTier(testMid);

    // Should be absent but no error notes (file simply doesn't exist)
    expect(result.tier.level).toBe('absent');
    expect(result.tier.notes).toBeUndefined();
  });
});
