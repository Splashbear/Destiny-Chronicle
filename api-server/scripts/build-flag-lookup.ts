#!/usr/bin/env ts-node
/**
 * Convert v3_<startId>.json flag files to compact on-disk flag lookup.
 * 
 * INPUT FORMAT:
 * - 1,600 JSON files named v3_<startId>.json (e.g., v3_0.json, v3_10000000.json, ...)
 * - Each file covers a 10M instance ID range starting at <startId>
 * - Each file is a JSON array of objects: { "instanceId": "123...", "rule": "A" | "L" }
 * - Instance IDs are D2 only (0 to 16B range)
 * 
 * OUTPUT FORMAT:
 * - <outputRoot>/band_<bandId>.bin files
 * - bandId = Math.floor(instanceId / 10_000_000)
 * - Each .bin file is a sorted array of uint64 instance IDs (little-endian, 8 bytes each)
 * 
 * VALIDATION:
 * - File names must match v3_<startId>.json pattern with startId % 10M == 0
 * - Instance IDs must be numeric and within the expected range for each file
 * - Instance IDs must be unique within each output band
 * - Rule must be "A" or "L" (both are treated as flagged)
 * 
 * Usage:
 *   ts-node build-flag-lookup.ts <inputDir> <outputDir>
 * 
 * Example:
 *   ts-node build-flag-lookup.ts /path/to/v3_json /path/to/flag_lookup
 */

import * as fs from 'fs';
import * as path from 'path';

const BAND_SIZE = 10_000_000; // 10M IDs per band
const FILE_SPAN = 10_000_000; // 10M IDs per input file

interface FlagEntry {
  instanceId: string;
  rule: 'A' | 'L';
}

interface ValidationError {
  file: string;
  error: string;
}

interface ConversionStats {
  totalFiles: number;
  totalFlaggedIds: number;
  bandsWritten: number;
  validationErrors: ValidationError[];
  startTime: number;
  endTime?: number;
}

/**
 * Parse and validate a v3 JSON file name.
 * Returns startId or null if invalid.
 */
function parseFileName(fileName: string): number | null {
  const match = fileName.match(/^v3_(\d+)\.json$/);
  if (!match) {
    return null;
  }
  const startId = parseInt(match[1], 10);
  if (startId % FILE_SPAN !== 0) {
    return null;
  }
  return startId;
}

/**
 * Validate and parse a single v3 JSON file.
 */
function parseV3File(filePath: string, expectedStartId: number): FlagEntry[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error('File content is not an array');
  }

  const entries: FlagEntry[] = [];
  const expectedEnd = expectedStartId + FILE_SPAN;

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];

    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`Entry ${i} is not an object`);
    }

    const instanceId = entry.instanceId;
    const rule = entry.rule;

    if (typeof instanceId !== 'string' || !/^\d+$/.test(instanceId)) {
      throw new Error(`Entry ${i} has invalid instanceId: ${instanceId}`);
    }

    if (rule !== 'A' && rule !== 'L') {
      throw new Error(`Entry ${i} has invalid rule: ${rule} (expected A or L)`);
    }

    const idNum = parseInt(instanceId, 10);
    if (idNum < expectedStartId || idNum >= expectedEnd) {
      throw new Error(
        `Entry ${i} instanceId ${instanceId} outside expected range [${expectedStartId}, ${expectedEnd})`
      );
    }

    entries.push({ instanceId, rule });
  }

  return entries;
}

/**
 * Convert flag entries to band map.
 */
function entriesToBands(entries: FlagEntry[]): Map<number, Set<bigint>> {
  const bands = new Map<number, Set<bigint>>();

  for (const entry of entries) {
    const idNum = BigInt(entry.instanceId);
    const bandId = Number(idNum / BigInt(BAND_SIZE));

    if (!bands.has(bandId)) {
      bands.set(bandId, new Set());
    }
    bands.get(bandId)!.add(idNum);
  }

  return bands;
}

/**
 * Write a band to disk.
 */
function writeBand(outputDir: string, bandId: number, ids: Set<bigint>): void {
  const sorted = Array.from(ids).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const buffer = Buffer.alloc(sorted.length * 8);

  for (let i = 0; i < sorted.length; i++) {
    buffer.writeBigUInt64LE(sorted[i], i * 8);
  }

  const bandFile = path.join(outputDir, `band_${bandId}.bin`);
  fs.writeFileSync(bandFile, buffer);
}

/**
 * Main conversion logic.
 */
function convertFlagFiles(inputDir: string, outputDir: string): ConversionStats {
  const stats: ConversionStats = {
    totalFiles: 0,
    totalFlaggedIds: 0,
    bandsWritten: 0,
    validationErrors: [],
    startTime: Date.now(),
  };

  console.log('Starting flag lookup conversion...');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Scan input files
  const files = fs.readdirSync(inputDir).filter((f) => f.startsWith('v3_') && f.endsWith('.json'));
  stats.totalFiles = files.length;
  console.log(`Found ${files.length} v3_*.json files`);

  // Accumulate all bands
  const allBands = new Map<number, Set<bigint>>();

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(inputDir, file);

    const expectedStartId = parseFileName(file);
    if (expectedStartId === null) {
      stats.validationErrors.push({
        file,
        error: 'Invalid file name format (expected v3_<startId>.json with startId % 10M == 0)',
      });
      continue;
    }

    try {
      const entries = parseV3File(filePath, expectedStartId);
      const fileBands = entriesToBands(entries);

      // Merge into all bands
      for (const [bandId, ids] of fileBands) {
        if (!allBands.has(bandId)) {
          allBands.set(bandId, new Set());
        }
        for (const id of ids) {
          allBands.get(bandId)!.add(id);
        }
      }

      stats.totalFlaggedIds += entries.length;

      if ((i + 1) % 100 === 0 || i === files.length - 1) {
        console.log(`Processed ${i + 1}/${files.length} files...`);
      }
    } catch (error) {
      stats.validationErrors.push({
        file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`Total flagged IDs collected: ${stats.totalFlaggedIds}`);
  console.log(`Writing ${allBands.size} band files...`);

  // Write all bands
  let written = 0;
  for (const [bandId, ids] of allBands) {
    writeBand(outputDir, bandId, ids);
    written++;
    if (written % 100 === 0 || written === allBands.size) {
      console.log(`Written ${written}/${allBands.size} bands...`);
    }
  }

  stats.bandsWritten = allBands.size;
  stats.endTime = Date.now();

  return stats;
}

/**
 * Print statistics and validation errors.
 */
function printStats(stats: ConversionStats): void {
  console.log('\n=== Conversion Complete ===');
  console.log(`Total files processed: ${stats.totalFiles}`);
  console.log(`Total flagged IDs: ${stats.totalFlaggedIds.toLocaleString()}`);
  console.log(`Bands written: ${stats.bandsWritten}`);
  console.log(`Validation errors: ${stats.validationErrors.length}`);
  
  if (stats.endTime) {
    const durationSec = ((stats.endTime - stats.startTime) / 1000).toFixed(1);
    console.log(`Duration: ${durationSec}s`);
  }

  if (stats.validationErrors.length > 0) {
    console.log('\n=== Validation Errors ===');
    for (const err of stats.validationErrors) {
      console.log(`${err.file}: ${err.error}`);
    }
  }

  // Estimate storage
  const avgIdsPerBand = stats.totalFlaggedIds / Math.max(1, stats.bandsWritten);
  const storageMB = (stats.totalFlaggedIds * 8) / (1024 * 1024);
  console.log(`\n=== Storage Estimates ===`);
  console.log(`Average IDs per band: ${avgIdsPerBand.toFixed(0)}`);
  console.log(`Total storage: ${storageMB.toFixed(2)} MB`);
}

/**
 * CLI entry point.
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error('Usage: ts-node build-flag-lookup.ts <inputDir> <outputDir>');
    console.error('');
    console.error('Example:');
    console.error('  ts-node build-flag-lookup.ts /path/to/v3_json /path/to/flag_lookup');
    process.exit(1);
  }

  const [inputDir, outputDir] = args;

  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Input directory does not exist: ${inputDir}`);
    process.exit(1);
  }

  if (!fs.statSync(inputDir).isDirectory()) {
    console.error(`Error: Input path is not a directory: ${inputDir}`);
    process.exit(1);
  }

  try {
    const stats = convertFlagFiles(inputDir, outputDir);
    printStats(stats);

    if (stats.validationErrors.length > 0) {
      console.error('\nWarning: Some files had validation errors. Check the errors above.');
      process.exit(1);
    }

    console.log('\nSuccess! Flag lookup is ready to use.');
  } catch (error) {
    console.error('Fatal error during conversion:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
