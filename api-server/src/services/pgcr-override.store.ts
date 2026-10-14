import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { logger } from '../utils/logger';
import { Game } from './bungie-api.service';

/**
 * Corrected PGCR stored as minimal JSON (similar to SlimPgcr but with full Bungie response).
 * Format: <root>/<game>/<iid / 1e6>/<iid>.json.gz
 * 
 * Each file stores the full Bungie PGCR response (D1 or D2 envelope) that was fetched
 * and verified. The game is part of the key since D1 and D2 instance IDs overlap.
 * 
 * Nothing is ever deleted from this store. Once corrected, always served from here.
 */

export interface OverrideStats {
  totalOverrides: number;
  d1Overrides: number;
  d2Overrides: number;
  cacheHits: number;
  cacheMisses: number;
}

export class PgcrOverrideStore {
  private root: string;
  private stats: OverrideStats = {
    totalOverrides: 0,
    d1Overrides: 0,
    d2Overrides: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(root: string) {
    this.root = root;
  }

  /**
   * Initialize the override store and count existing overrides.
   */
  async initialize(): Promise<void> {
    if (!this.root) {
      logger.warn('PGCR override store root not configured');
      return;
    }

    try {
      if (!fs.existsSync(this.root)) {
        fs.mkdirSync(this.root, { recursive: true });
        logger.info('Created PGCR override store', { root: this.root });
        return;
      }

      // Count existing overrides
      let d1Count = 0;
      let d2Count = 0;

      for (const game of ['D1', 'D2'] as const) {
        const gameDir = path.join(this.root, game);
        if (fs.existsSync(gameDir)) {
          const count = this.countOverridesInDir(gameDir);
          if (game === 'D1') {
            d1Count = count;
          } else {
            d2Count = count;
          }
        }
      }

      this.stats.d1Overrides = d1Count;
      this.stats.d2Overrides = d2Count;
      this.stats.totalOverrides = d1Count + d2Count;

      logger.info('PGCR override store initialized', {
        root: this.root,
        totalOverrides: this.stats.totalOverrides,
        d1: d1Count,
        d2: d2Count,
      });
    } catch (error) {
      logger.error('Failed to initialize PGCR override store', { error, root: this.root });
    }
  }

  /**
   * Count override files in a directory recursively.
   */
  private countOverridesInDir(dir: string): number {
    let count = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += this.countOverridesInDir(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.json.gz')) {
          count++;
        }
      }
    } catch {
      // Ignore errors during counting
    }
    return count;
  }

  /**
   * Get the file path for an override.
   */
  private getFilePath(instanceId: string, game: Game): string {
    const bandDir = String(Math.floor(Number(instanceId) / 1e6));
    return path.join(this.root, game, bandDir, `${instanceId}.json.gz`);
  }

  /**
   * Check if an override exists.
   */
  exists(instanceId: string, game: Game): boolean {
    if (!this.root || !instanceId || !/^\d+$/.test(instanceId)) {
      return false;
    }

    const filePath = this.getFilePath(instanceId, game);
    return fs.existsSync(filePath);
  }

  /**
   * Get a corrected PGCR from the override store.
   * Returns the full Bungie PGCR response (D1 or D2 envelope) or null if not found.
   */
  get(instanceId: string, game: Game): any | null {
    if (!this.root || !instanceId || !/^\d+$/.test(instanceId)) {
      return null;
    }

    const filePath = this.getFilePath(instanceId, game);
    if (!fs.existsSync(filePath)) {
      this.stats.cacheMisses++;
      return null;
    }

    try {
      const compressed = fs.readFileSync(filePath);
      const json = zlib.gunzipSync(compressed).toString('utf8');
      const data = JSON.parse(json);
      this.stats.cacheHits++;
      return data;
    } catch (error) {
      logger.error('Failed to read PGCR override', { error, instanceId, game, filePath });
      return null;
    }
  }

  /**
   * Save a corrected PGCR to the override store.
   * Takes the full Bungie PGCR response (D1 or D2 envelope).
   */
  put(instanceId: string, game: Game, bungiePgcr: any): void {
    if (!this.root || !instanceId || !/^\d+$/.test(instanceId)) {
      logger.warn('Cannot save PGCR override: invalid instanceId or root not configured', {
        root: this.root,
        instanceId,
        game,
      });
      return;
    }

    try {
      const filePath = this.getFilePath(instanceId, game);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      const json = JSON.stringify(bungiePgcr);
      const compressed = zlib.gzipSync(json);

      const tmpPath = `${filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, compressed);
      fs.renameSync(tmpPath, filePath);

      // Update stats
      if (game === 'D1') {
        this.stats.d1Overrides++;
      } else {
        this.stats.d2Overrides++;
      }
      this.stats.totalOverrides++;

      logger.debug('Saved PGCR override', { instanceId, game, filePath });
    } catch (error) {
      logger.error('Failed to save PGCR override', { error, instanceId, game });
    }
  }

  /**
   * Get current statistics.
   */
  getStats(): OverrideStats {
    return { ...this.stats };
  }

  /**
   * Check if service is available.
   */
  isAvailable(): boolean {
    return !!(this.root && fs.existsSync(this.root));
  }

  /**
   * Estimate storage cost per corrected game.
   * Returns average bytes per override file (compressed).
   */
  estimateStorageCost(): number {
    if (!this.isAvailable() || this.stats.totalOverrides === 0) {
      // Estimate: typical PGCR is ~10-50KB uncompressed, ~2-10KB compressed
      return 5000; // 5KB average estimate
    }

    // Sample a few files to get average size
    let totalSize = 0;
    let sampledCount = 0;
    const maxSamples = 100;

    try {
      for (const game of ['D1', 'D2'] as const) {
        const gameDir = path.join(this.root, game);
        if (!fs.existsSync(gameDir)) continue;

        const samples = this.sampleFiles(gameDir, maxSamples / 2);
        for (const filePath of samples) {
          try {
            const stat = fs.statSync(filePath);
            totalSize += stat.size;
            sampledCount++;
          } catch {
            // Skip files that can't be read
          }
        }
      }

      if (sampledCount > 0) {
        return Math.round(totalSize / sampledCount);
      }
    } catch (error) {
      logger.warn('Failed to estimate storage cost', { error });
    }

    return 5000; // Fallback estimate
  }

  /**
   * Sample files from a directory for size estimation.
   */
  private sampleFiles(dir: string, maxSamples: number): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxSamples) break;

        if (entry.isDirectory()) {
          files.push(...this.sampleFiles(path.join(dir, entry.name), maxSamples - files.length));
        } else if (entry.name.endsWith('.json.gz')) {
          files.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // Ignore errors
    }
    return files.slice(0, maxSamples);
  }
}
