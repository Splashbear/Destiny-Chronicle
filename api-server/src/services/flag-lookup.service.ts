import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Compact on-disk flag lookup for suspect D2 instance IDs with mode/rule metadata.
 * 
 * Layout: <root>/band_<bandId>.bin
 * - bandId = Math.floor(instanceId / BAND_SIZE)
 * - Each .bin file contains packed records (12 bytes each):
 *   - 8 bytes: instance ID (uint64, little-endian)
 *   - 1 byte: mode (uint8)
 *   - 1 byte: rule (0x41='A', 0x4C='L')
 *   - 2 bytes: padding (reserved)
 * - Records are sorted by instance ID for binary search
 * 
 * Filter configuration (env FLAG_FILTER):
 * - "all" (default): All flagged IDs regardless of mode/rule
 * - "sharp": Skip rule A in modes 2,4,6,82; L only for mode 40
 * 
 * Memory usage: ~1.5MB per 131k flagged IDs per band (12 bytes each), loaded on-demand and cached.
 */

const BAND_SIZE = 10_000_000; // 10M IDs per band
const RECORD_SIZE = 12; // 8B ID + 1B mode + 1B rule + 2B padding

interface FlagRecord {
  id: bigint;
  mode: number;
  rule: 'A' | 'L';
}

type FilterMode = 'all' | 'sharp';

export interface FlagLookupStats {
  totalBands: number;
  totalFlaggedIds: number;
  loadedBands: number;
  cacheHits: number;
  cacheMisses: number;
  filterMode: FilterMode;
  filteredOut: number;
}

export class FlagLookupService {
  private root: string;
  private filterMode: FilterMode;
  private bandCache = new Map<number, FlagRecord[]>();
  private stats: FlagLookupStats = {
    totalBands: 0,
    totalFlaggedIds: 0,
    loadedBands: 0,
    cacheHits: 0,
    cacheMisses: 0,
    filterMode: 'all',
    filteredOut: 0,
  };

  constructor(root: string, filterMode: FilterMode = 'all') {
    this.root = root;
    this.filterMode = filterMode;
  }

  /**
   * Initialize and scan available band files.
   */
  async initialize(): Promise<void> {
    if (!this.root || !fs.existsSync(this.root)) {
      logger.warn('Flag lookup root not configured or not accessible', { root: this.root });
      return;
    }

    try {
      const files = fs.readdirSync(this.root);
      const bandFiles = files.filter((f) => /^band_\d+\.bin$/.test(f));
      this.stats.totalBands = bandFiles.length;

      let totalIds = 0;
      for (const file of bandFiles) {
        const filePath = path.join(this.root, file);
        const stat = fs.statSync(filePath);
        totalIds += stat.size / RECORD_SIZE; // 12 bytes per record
      }
      this.stats.totalFlaggedIds = totalIds;
      this.stats.filterMode = this.filterMode;

      logger.info('Flag lookup initialized', {
        root: this.root,
        totalBands: this.stats.totalBands,
        totalFlaggedIds: this.stats.totalFlaggedIds,
        filterMode: this.filterMode,
      });
    } catch (error) {
      logger.error('Failed to initialize flag lookup', { error, root: this.root });
    }
  }

  /**
   * Check if a D2 instance ID is flagged as suspect.
   * Returns true if flagged and passes filter, false otherwise.
   */
  isFlagged(instanceId: string, game: 'D1' | 'D2'): boolean {
    // D1 games are never flagged (scan was D2-only)
    if (game === 'D1') {
      return false;
    }

    if (!this.root || !/^\d+$/.test(instanceId)) {
      return false;
    }

    const idNum = BigInt(instanceId);
    const bandId = Number(idNum / BigInt(BAND_SIZE));

    const band = this.loadBand(bandId);
    if (!band) {
      return false;
    }

    const record = this.binarySearch(band, idNum);
    if (!record) {
      return false;
    }

    // Apply filter
    if (this.filterMode === 'sharp') {
      // Skip rule A in modes 2,4,6,82
      if (record.rule === 'A' && [2, 4, 6, 82].includes(record.mode)) {
        this.stats.filteredOut++;
        return false;
      }
      // L only for mode 40
      if (record.rule === 'L' && record.mode !== 40) {
        this.stats.filteredOut++;
        return false;
      }
    }

    return true;
  }

  /**
   * Load a band from disk or cache.
   * Returns null if band file doesn't exist.
   */
  private loadBand(bandId: number): FlagRecord[] | null {
    const cached = this.bandCache.get(bandId);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    const bandFile = path.join(this.root, `band_${bandId}.bin`);
    if (!fs.existsSync(bandFile)) {
      return null;
    }

    try {
      const buffer = fs.readFileSync(bandFile);
      const count = buffer.length / RECORD_SIZE;
      const band: FlagRecord[] = [];

      for (let i = 0; i < count; i++) {
        const offset = i * RECORD_SIZE;
        const id = buffer.readBigUInt64LE(offset);
        const mode = buffer.readUInt8(offset + 8);
        const ruleCode = buffer.readUInt8(offset + 9);
        const rule = ruleCode === 0x41 ? 'A' : ruleCode === 0x4C ? 'L' : '?' as any;

        if (rule === '?') {
          logger.warn('Invalid rule code in band file', { bandId, offset, ruleCode });
          continue;
        }

        band.push({ id, mode, rule });
      }

      // Verify sorted (should be from converter)
      for (let i = 1; i < band.length; i++) {
        if (band[i].id <= band[i - 1].id) {
          logger.warn('Band not sorted, will not cache', { bandId, bandFile });
          return band; // Don't cache unsorted data
        }
      }

      this.bandCache.set(bandId, band);
      this.stats.loadedBands = this.bandCache.size;

      logger.debug('Loaded flag band', { bandId, count: band.length });
      return band;
    } catch (error) {
      logger.error('Failed to load flag band', { error, bandId, bandFile });
      return null;
    }
  }

  /**
   * Binary search for an ID in a sorted band.
   * Returns the record if found, null otherwise.
   */
  private binarySearch(band: FlagRecord[], target: bigint): FlagRecord | null {
    let left = 0;
    let right = band.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midVal = band[mid].id;

      if (midVal === target) {
        return band[mid];
      } else if (midVal < target) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return null;
  }

  /**
   * Get current statistics for monitoring.
   */
  getStats(): FlagLookupStats {
    return { ...this.stats };
  }

  /**
   * Check if service is available.
   */
  isAvailable(): boolean {
    return !!(this.root && this.stats.totalBands > 0);
  }

  /**
   * Clear the band cache to free memory.
   */
  clearCache(): void {
    this.bandCache.clear();
    this.stats.loadedBands = 0;
    logger.info('Flag lookup cache cleared');
  }
}
