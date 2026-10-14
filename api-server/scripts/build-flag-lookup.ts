#!/usr/bin/env ts-node
/**
 * Convert v3_<startId>.json flag files to compact on-disk flag lookup.
 * 
 * INPUT FORMAT:
 * - 1,600 JSON files named v3_<bandStartId>.json (e.g., v3_0.json, v3_10000000.json, v3_13300000000.json)
 * - Each file covers a 10M instance ID range starting at <bandStartId>
 * - Each file is a JSON object: { "file": "...", "records": N, "flagged": M, "flags": [...] }
 * - Each flag is an array: [instanceId_str, n1, n2, n3, mode, rule_str, n4, n5]
 *   - Element 0: instance ID as string
 *   - Element 4: D2 activity mode (number)
 *   - Element 5: rule "A" or "L" (string)
 *   - Other numeric fields are opaque
 * - Instance IDs are D2 only (0 to 16B range)
 * - Non-v3_*.json files (e.g., status.json) may exist; skip them
 * 
 * OUTPUT FORMAT:
 * - <outputRoot>/band_<bandId>.bin files
 * - bandId = Math.floor(instanceId / 10_000_000)
 * - Each .bin file contains packed records (12 bytes each):
 *   - 8 bytes: instance ID (uint64, little-endian)
 *   - 1 byte: mode (uint8)
 *   - 1 byte: rule (0x41='A', 0x4C='L')
 *   - 2 bytes: padding (reserved)
 * - Records are sorted by instance ID for binary search
 * 
 * VALIDATION:
 * - File names must match v3_<startId>.json pattern with startId % 10M == 0
 * - flagged field must equal flags.length
 * - Instance IDs must be numeric and within the expected range for each file
 * - Instance IDs must be unique within each output band
 * - Rule must be "A" or "L"
 * 
 * Usage:
 *   ts-node build-flag-lookup.ts <inputDir> <outputDir>
 * 
 * Example:
 *   ts-node build-flag-lookup.ts //Exit43Server/.../v3_json /path/to/flag_lookup
 */

import * as fs from 'fs';
import * as path from 'path';

const BAND_SIZE = 10_000_000; // 10M IDs per band
const FILE_SPAN = 10_000_000; // 10M IDs per input file

interface FlagEntry {
  instanceId: string;
  mode: number;
  rule: 'A' | 'L';
}

interface V3FileFormat {
  file: string;
  records: number;
  parseErr?: number;
  flagged: number;
  secs?: number;
  flags: Array<[string, number, number, number, number, string, number, number]>;
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
  const data: V3FileFormat = JSON.parse(content);

  // Validate file structure
  if (typeof data !== 'object' || data === null) {
    throw new Error('File content is not an object');
  }

  if (typeof data.flagged !== 'number') {
    throw new Error('Missing or invalid "flagged" field');
  }

  if (!Array.isArray(data.flags)) {
    throw new Error('Missing or invalid "flags" array');
  }

  // Validate flagged == flags.length
  if (data.flagged !== data.flags.length) {
    throw new Error(
      `Mismatch: flagged=${data.flagged} but flags.length=${data.flags.length}`
    );
  }

  const entries: FlagEntry[] = [];
  const expectedEnd = expectedStartId + FILE_SPAN;

  for (let i = 0; i < data.flags.length; i++) {
    const flag = data.flags[i];

    if (!Array.isArray(flag) || flag.length < 6) {
      throw new Error(`Flag ${i} is not an array or too short`);
    }

    const instanceId = flag[0];
    const mode = flag[4];
    const rule = flag[5];

    if (typeof instanceId !== 'string' || !/^\d+$/.test(instanceId)) {
      throw new Error(`Flag ${i} has invalid instanceId: ${instanceId}`);
    }

    if (typeof mode !== 'number') {
      throw new Error(`Flag ${i} has invalid mode: ${mode}`);
    }

    if (typeof rule !== 'string' || (rule !== 'A' && rule !== 'L')) {
      throw new Error(`Flag ${i} has invalid rule: ${rule} (expected A or L)`);
    }

    const idNum = parseInt(instanceId, 10);
    if (idNum < expectedStartId || idNum >= expectedEnd) {
      throw new Error(
        `Flag ${i} instanceId ${instanceId} outside expected range [${expectedStartId}, ${expectedEnd})`
      );
    }

    entries.push({ instanceId, mode, rule: rule as 'A' | 'L' });
  }

  return entries;
}

interface FlagRecord {
  id: bigint;
  mode: number;
  rule: 'A' | 'L';
}

/**
 * Convert flag entries to band map with mode/rule metadata.
 */
function entriesToBands(entries: FlagEntry[]): Map<number, FlagRecord[]> {
  const bands = new Map<number, FlagRecord[]>();

  for (const entry of entries) {
    const idNum = BigInt(entry.instanceId);
    const bandId = Number(idNum / BigInt(BAND_SIZE));

    if (!bands.has(bandId)) {
      bands.set(bandId, []);
    }
    bands.get(bandId)!.push({
      id: idNum,
      mode: entry.mode,
      rule: entry.rule,
    });
  }

  return bands;
}

/**
 * Write a band to disk with mode/rule metadata.
 * Format: 12 bytes per record (8 bytes ID + 1 byte mode + 1 byte rule + 2 bytes padding)
 */
function writeBand(outputDir: string, bandId: number, records: FlagRecord[]): void {
  // Dedupe by ID (keep first occurrence)
  const seen = new Set<bigint>();
  const unique = records.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Sort by ID
  const sorted = unique.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Pack into buffer (12 bytes per record)
  const buffer = Buffer.alloc(sorted.length * 12);

  for (let i = 0; i < sorted.length; i++) {
    const offset = i * 12;
    buffer.writeBigUInt64LE(sorted[i].id, offset); // 8 bytes: instance ID
    buffer.writeUInt8(sorted[i].mode, offset + 8); // 1 byte: mode
    buffer.writeUInt8(sorted[i].rule.charCodeAt(0), offset + 9); // 1 byte: 'A'=0x41 or 'L'=0x4C
    buffer.writeUInt16LE(0, offset + 10); // 2 bytes: padding (reserved)
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
  const allBands = new Map<number, FlagRecord[]>();

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
      for (const [bandId, records] of fileBands) {
        if (!allBands.has(bandId)) {
          allBands.set(bandId, []);
        }
        allBands.get(bandId)!.push(...records);
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
  const storageMB = (stats.totalFlaggedIds * 12) / (1024 * 1024); // 12 bytes per record
  console.log(`\n=== Storage Estimates ===`);
  console.log(`Average IDs per band: ${avgIdsPerBand.toFixed(0)}`);
  console.log(`Total storage: ${storageMB.toFixed(2)} MB (12 bytes per record: 8B ID + 1B mode + 1B rule + 2B padding)`);
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
