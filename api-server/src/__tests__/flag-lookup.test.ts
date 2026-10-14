import * as fs from 'fs';
import * as path from 'path';
import { FlagLookupService, passesSharpFilter } from '../services/flag-lookup.service';
import { convertBandData } from '../../scripts/build-flag-lookup';

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
    // New format: 12 bytes per record (8B ID + 1B mode + 1B rule + 2B padding)
    const buffer = Buffer.alloc(sorted.length * 12);

    for (let i = 0; i < sorted.length; i++) {
      const offset = i * 12;
      buffer.writeBigUInt64LE(sorted[i], offset); // 8 bytes: ID
      buffer.writeUInt8(0, offset + 8); // 1 byte: mode (0 for test data)
      buffer.writeUInt8(0x41, offset + 9); // 1 byte: rule 'A' (0x41)
      buffer.writeUInt16LE(0, offset + 10); // 2 bytes: padding
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

  describe('AL (0x42) records and sharp filter', () => {
    function writeRecs(bandId: number, recs: Array<[bigint, number, number]>): void {
      const buffer = Buffer.alloc(recs.length * 12);
      recs.forEach(([id, mode, rule], i) => {
        buffer.writeBigUInt64LE(id, i * 12);
        buffer.writeUInt8(mode, i * 12 + 8);
        buffer.writeUInt8(rule, i * 12 + 9);
      });
      fs.writeFileSync(path.join(tempDir, `band_${bandId}.bin`), buffer);
    }

    it('reads B (AL) records and counts them', async () => {
      writeRecs(0, [[100n, 2, 0x42], [200n, 40, 0x41], [300n, 40, 0x4c]]);
      service = new FlagLookupService(tempDir, 'all');
      await service.initialize();
      expect(service.getStats().totalFlaggedIds).toBe(3);
      expect(service.isFlagged('100', 'D2')).toBe(true);
      expect(service.isFlagged('200', 'D2')).toBe(true);
      expect(service.isFlagged('300', 'D2')).toBe(true);
    });

    it('sharp keeps AL if either rule passes', async () => {
      writeRecs(0, [
        [100n, 2, 0x42], // AL mode 2: A skipped, L not mode 40 -> dropped
        [200n, 40, 0x42], // AL mode 40: both pass
        [300n, 5, 0x42], // AL mode 5: A passes -> kept
        [400n, 2, 0x41], // A mode 2 -> dropped
        [500n, 5, 0x4c], // L mode 5 -> dropped
        [600n, 40, 0x4c], // L mode 40 -> kept
      ]);
      service = new FlagLookupService(tempDir, 'sharp');
      await service.initialize();
      const got = ['100', '200', '300', '400', '500', '600'].map((i) => service.isFlagged(i, 'D2'));
      expect(got).toEqual([false, true, true, false, false, true]);
    });

    it('passesSharpFilter truth table', () => {
      expect(passesSharpFilter('B', 82)).toBe(false);
      expect(passesSharpFilter('B', 40)).toBe(true);
      expect(passesSharpFilter('B', 7)).toBe(true);
      expect(passesSharpFilter('A', 4)).toBe(false);
      expect(passesSharpFilter('L', 40)).toBe(true);
      expect(passesSharpFilter('L', 7)).toBe(false);
    });
  });

  describe('converter convertBandData', () => {
    const mk = (flags: any[]) => ({ flagged: flags.length, flags });

    it('accepts numeric and string ids, AL -> 0x42, sorted and deduped', () => {
      const out = convertBandData(
        mk([
          [10000300, 0, 0, 0, 40, 'A', 0, 0],
          ['10000100', 0, 0, 0, 2, 'AL', 0, 0],
          [10000100, 0, 0, 0, 2, 'AL', 0, 0],
        ]),
        10_000_000
      );
      expect(out.records).toBe(2);
      expect(out.dups).toBe(1);
      expect(out.buffer.length).toBe(24);
      expect(out.buffer.readBigUInt64LE(0)).toBe(10000100n);
      expect(out.buffer.readUInt8(8)).toBe(2);
      expect(out.buffer.readUInt8(9)).toBe(0x42);
      expect(out.buffer.readUInt16LE(10)).toBe(0);
      expect(out.buffer.readBigUInt64LE(12)).toBe(10000300n);
      expect(out.buffer.readUInt8(21)).toBe(0x41);
    });

    it('rejects bad rule, out-of-range id, and flagged mismatch', () => {
      expect(() => convertBandData(mk([[5, 0, 0, 0, 1, 'X', 0, 0]]), 0)).toThrow(/invalid rule/);
      expect(() => convertBandData(mk([[10_000_000, 0, 0, 0, 1, 'A', 0, 0]]), 0)).toThrow(/outside/);
      expect(() => convertBandData({ flagged: 2, flags: [] }, 0)).toThrow(/Mismatch/);
    });

    it('output round-trips through FlagLookupService', async () => {
      const out = convertBandData(mk([[77, 0, 0, 0, 40, 'AL', 0, 0]]), 0);
      fs.writeFileSync(path.join(tempDir, 'band_0.bin'), out.buffer);
      service = new FlagLookupService(tempDir, 'sharp');
      await service.initialize();
      expect(service.isFlagged('77', 'D2')).toBe(true);
    });
  });
});
