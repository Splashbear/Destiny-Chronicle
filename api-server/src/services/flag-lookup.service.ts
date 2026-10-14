import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Compact on-disk flag lookup for suspect D2 instance IDs.
 * 
 * Layout: <root>/band_<bandId>.bin
 * - bandId = Math.floor(instanceId / BAND_SIZE)
 * - Each .bin file is a sorted array of uint64 instance IDs (little-endian, 8 bytes each)
 * - Binary search for O(log n) lookup per band
 * 
 * Memory usage: ~1MB per 131k flagged IDs per band (8 bytes each), loaded on-demand and cached.
 * With 127M flagged IDs across 1,600 bands (~79k per band avg), peak memory is modest (~10-100 MB).
 */

const BAND_SIZE = 10_000_000; // 10M IDs per band

export interface FlagLookupStats {
  totalBands: number;
  totalFlaggedIds: number;
  loadedBands: number;
  cacheHits: number;
  cacheMisses: number;
}

export class FlagLookupService {
  private root: string;
  private bandCache = new Map<number, bigint[]>();
  private stats: FlagLookupStats = {
    totalBands: 0,
    totalFlaggedIds: 0,
    loadedBands: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(root: string) {
    this.root = root;
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
        totalIds += stat.size / 8; // 8 bytes per uint64
      }
      this.stats.totalFlaggedIds = totalIds;

      logger.info('Flag lookup initialized', {
        root: this.root,
        totalBands: this.stats.totalBands,
        totalFlaggedIds: this.stats.totalFlaggedIds,
      });
    } catch (error) {
      logger.error('Failed to initialize flag lookup', { error, root: this.root });
    }
  }

  /**
   * Check if a D2 instance ID is flagged as suspect.
   * Returns true if flagged, false otherwise.
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

    return this.binarySearch(band, idNum);
  }

  /**
   * Load a band from disk or cache.
   * Returns null if band file doesn't exist.
   */
  private loadBand(bandId: number): bigint[] | null {
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
      const count = buffer.length / 8;
      const band: bigint[] = [];

      for (let i = 0; i < count; i++) {
        // Read little-endian uint64
        const offset = i * 8;
        const id = buffer.readBigUInt64LE(offset);
        band.push(id);
      }

      // Verify sorted (should be from converter)
      for (let i = 1; i < band.length; i++) {
        if (band[i] <= band[i - 1]) {
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
   */
  private binarySearch(band: bigint[], target: bigint): boolean {
    let left = 0;
    let right = band.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midVal = band[mid];

      if (midVal === target) {
        return true;
      } else if (midVal < target) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return false;
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
