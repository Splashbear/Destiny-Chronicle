import * as fs from 'fs';
import * as path from 'path';
import { FlagLookupService } from '../services/flag-lookup.service';

describe('FlagLookupService', () => {
  let tempDir: string;
  let service: FlagLookupService;

  beforeEach(() => {
    tempDir = path.join(__dirname, 'fixtures', 'flag_lookup_test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function writeBand(bandId: number, instanceIds: bigint[]): void {
    const sorted = instanceIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const buffer = Buffer.alloc(sorted.length * 8);

    for (let i = 0; i < sorted.length; i++) {
      buffer.writeBigUInt64LE(sorted[i], i * 8);
    }

    const bandFile = path.join(tempDir, `band_${bandId}.bin`);
    fs.writeFileSync(bandFile, buffer);
  }

  it('should initialize with no bands', async () => {
    service = new FlagLookupService(tempDir);
    await service.initialize();

    const stats = service.getStats();
    expect(stats.totalBands).toBe(0);
    expect(stats.totalFlaggedIds).toBe(0);
    expect(service.isAvailable()).toBe(false);
  });

  it('should initialize and count bands', async () => {
    // Band 0: IDs 0-9999999
    writeBand(0, [100n, 200n, 300n]);
    // Band 1: IDs 10000000-19999999
    writeBand(1, [10_000_100n, 10_000_200n]);

    service = new FlagLookupService(tempDir);
    await service.initialize();

    const stats = service.getStats();
    expect(stats.totalBands).toBe(2);
    expect(stats.totalFlaggedIds).toBe(5);
    expect(service.isAvailable()).toBe(true);
  });

  it('should return false for D1 games', async () => {
    writeBand(0, [100n, 200n]);
    service = new FlagLookupService(tempDir);
    await service.initialize();

    expect(service.isFlagged('100', 'D1')).toBe(false);
    expect(service.isFlagged('200', 'D1')).toBe(false);
  });

  it('should check if D2 IDs are flagged', async () => {
    writeBand(0, [100n, 200n, 300n]);
    writeBand(1, [10_000_100n, 10_000_200n]);

    service = new FlagLookupService(tempDir);
    await service.initialize();

    // Band 0
    expect(service.isFlagged('100', 'D2')).toBe(true);
    expect(service.isFlagged('200', 'D2')).toBe(true);
    expect(service.isFlagged('300', 'D2')).toBe(true);
    expect(service.isFlagged('400', 'D2')).toBe(false);

    // Band 1
    expect(service.isFlagged('10000100', 'D2')).toBe(true);
    expect(service.isFlagged('10000200', 'D2')).toBe(true);
    expect(service.isFlagged('10000300', 'D2')).toBe(false);

    // Band that doesn't exist
    expect(service.isFlagged('20000000', 'D2')).toBe(false);
  });

  it('should cache loaded bands', async () => {
    writeBand(0, [100n, 200n, 300n]);

    service = new FlagLookupService(tempDir);
    await service.initialize();

    // First lookup
    expect(service.isFlagged('100', 'D2')).toBe(true);
    let stats = service.getStats();
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cacheHits).toBe(0);
    expect(stats.loadedBands).toBe(1);

    // Second lookup (cached)
    expect(service.isFlagged('200', 'D2')).toBe(true);
    stats = service.getStats();
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cacheHits).toBe(1);
    expect(stats.loadedBands).toBe(1);
  });

  it('should handle invalid instance IDs', async () => {
    service = new FlagLookupService(tempDir);
    await service.initialize();

    expect(service.isFlagged('', 'D2')).toBe(false);
    expect(service.isFlagged('abc', 'D2')).toBe(false);
    expect(service.isFlagged('-100', 'D2')).toBe(false);
  });

  it('should clear cache', async () => {
    writeBand(0, [100n, 200n]);

    service = new FlagLookupService(tempDir);
    await service.initialize();

    // Load band
    expect(service.isFlagged('100', 'D2')).toBe(true);
    let stats = service.getStats();
    expect(stats.loadedBands).toBe(1);

    // Clear cache
    service.clearCache();
    stats = service.getStats();
    expect(stats.loadedBands).toBe(0);

    // Load again
    expect(service.isFlagged('100', 'D2')).toBe(true);
    stats = service.getStats();
    expect(stats.loadedBands).toBe(1);
  });

  it('should handle large band with binary search', async () => {
    // Create a large band with 10k IDs
    const ids: bigint[] = [];
    for (let i = 0; i < 10_000; i++) {
      ids.push(BigInt(i * 100));
    }
    writeBand(0, ids);

    service = new FlagLookupService(tempDir);
    await service.initialize();

    // Test various IDs
    expect(service.isFlagged('0', 'D2')).toBe(true);
    expect(service.isFlagged('500000', 'D2')).toBe(true); // 5000 * 100
    expect(service.isFlagged('999900', 'D2')).toBe(true); // 9999 * 100
    
    // Not in list
    expect(service.isFlagged('50', 'D2')).toBe(false);
    expect(service.isFlagged('500001', 'D2')).toBe(false);
    expect(service.isFlagged('1000000', 'D2')).toBe(false);
  });

  it('should handle empty root', async () => {
    service = new FlagLookupService('');
    await service.initialize();

    expect(service.isAvailable()).toBe(false);
    expect(service.isFlagged('100', 'D2')).toBe(false);
  });

  it('should handle non-existent root', async () => {
    service = new FlagLookupService('/nonexistent/path');
    await service.initialize();

    expect(service.isAvailable()).toBe(false);
    expect(service.isFlagged('100', 'D2')).toBe(false);
  });
});
