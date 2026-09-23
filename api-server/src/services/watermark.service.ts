import * as fs from 'fs/promises';
import { CoverageWatermark } from '../types/lean-activity.types';
import { logger } from '../utils/logger';

/**
 * Service for managing coverage watermark that determines which activities
 * are available in the archive vs need to be fetched from live Bungie API.
 */
export class WatermarkService {
  private watermark: CoverageWatermark | null = null;
  private watermarkPath: string;

  constructor(watermarkPath: string) {
    this.watermarkPath = watermarkPath;
  }

  /**
   * Load watermark from disk.
   */
  async load(): Promise<void> {
    if (!this.watermarkPath) {
      logger.warn('Watermark path not configured - all requests will use live Bungie API');
      return;
    }

    try {
      const content = await fs.readFile(this.watermarkPath, 'utf-8');
      this.watermark = JSON.parse(content) as CoverageWatermark;
      logger.info('Watermark loaded', {
        max_instance_id: this.watermark.max_instance_id,
        as_of: this.watermark.as_of,
      });
    } catch (error) {
      logger.warn('Failed to load watermark', { error, path: this.watermarkPath });
      this.watermark = null;
    }
  }

  /**
   * Check if an instance ID is covered by the archive.
   */
  isCovered(instanceId: string): boolean {
    if (!this.watermark) {
      return false;
    }

    try {
      const id = BigInt(instanceId);
      const max = BigInt(this.watermark.max_instance_id);
      return id <= max;
    } catch {
      logger.warn('Invalid instance ID for watermark check', { instanceId });
      return false;
    }
  }

  /**
   * Get current watermark info.
   */
  getWatermark(): CoverageWatermark | null {
    return this.watermark;
  }
}
