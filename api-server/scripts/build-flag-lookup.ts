#!/usr/bin/env ts-node
/**
 * Convert v3_<startId>.json flag files to compact on-disk flag lookup.
 *
 * Streams ONE input file (= one 10M-ID band) at a time, so memory stays at one band.
 *
 * INPUT: v3_<bandStartId>.json (startId % 10M == 0), each
 *   { "file": "...", "records": N, "flagged": M, "flags": [...] }
 * Each flag: [instanceId, n1, n2, n3, mode, rule, n4, n5]
 *   - instanceId: number OR numeric string (real scan files use numbers)
 *   - mode: integer 0-255
 *   - rule: "A", "L", or "AL" (both rules fired)
 * Non-v3 files (status.json etc.) are skipped.
 *
 * OUTPUT: <outputDir>/band_<bandId>.bin, bandId = floor(instanceId / 10M); 12 bytes per record,
 * sorted by ID, unique:
 *   8B instance ID (uint64 LE) | 1B mode | 1B rule | 2B padding
 *   rule byte: 0x41 'A', 0x4C 'L', 0x42 'B' (= "AL")
 *
 * Duplicate IDs inside a file are dropped (first after sort kept). Bands with no flags write no file.
 *
 * Usage: ts-node build-flag-lookup.ts <inputDir> <outputDir>
 */

import * as fs from 'fs';
import * as path from 'path';

const BAND_SIZE = 10_000_000; // 10M IDs per band
const FILE_SPAN = 10_000_000; // 10M IDs per input file
const RECORD_SIZE = 12;

export const RULE_BYTE: Record<string, number> = { A: 0x41, L: 0x4c, AL: 0x42 };

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

/** Returns startId or null if the name isn't a valid v3 file name. */
export function parseFileName(fileName: string): number | null {
  const match = fileName.match(/^v3_(\d+)\.json$/);
  if (!match) return null;
  const startId = parseInt(match[1], 10);
  return startId % FILE_SPAN === 0 ? startId : null;
}

/**
 * Convert one parsed v3 file's content into packed band bytes.
 * Throws on any validation failure. Returns the buffer and counts.
 */
export function convertBandData(
  data: any,
  expectedStartId: number
): { buffer: Buffer; flags: number; records: number; dups: number } {
  if (typeof data !== 'object' || data === null) throw new Error('File content is not an object');
  if (typeof data.flagged !== 'number') throw new Error('Missing or invalid "flagged" field');
  if (!Array.isArray(data.flags)) throw new Error('Missing or invalid "flags" array');
  if (data.flagged !== data.flags.length) {
    throw new Error(`Mismatch: flagged=${data.flagged} but flags.length=${data.flags.length}`);
  }

  const start = BigInt(expectedStartId);
  const end = start + BigInt(FILE_SPAN);
  const recs: Array<{ id: bigint; mode: number; rule: number }> = [];

  for (let i = 0; i < data.flags.length; i++) {
    const flag = data.flags[i];
    if (!Array.isArray(flag) || flag.length < 6) throw new Error(`Flag ${i} is not an array or too short`);
    const [rawId, , , , mode, rule] = flag;

    let id: bigint;
    if (typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId >= 0) {
      id = BigInt(rawId);
    } else if (typeof rawId === 'string' && /^\d+$/.test(rawId)) {
      id = BigInt(rawId);
    } else {
      throw new Error(`Flag ${i} has invalid instanceId: ${rawId}`);
    }
    if (!Number.isInteger(mode) || mode < 0 || mode > 255) throw new Error(`Flag ${i} has invalid mode: ${mode}`);
    if (typeof rule !== 'string' || !Object.prototype.hasOwnProperty.call(RULE_BYTE, rule)) {
      throw new Error(`Flag ${i} has invalid rule: ${rule} (expected A, L or AL)`);
    }
    if (id < start || id >= end) {
      throw new Error(`Flag ${i} instanceId ${rawId} outside expected range [${start}, ${end})`);
    }
    recs.push({ id, mode, rule: RULE_BYTE[rule] });
  }

  recs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const buffer = Buffer.alloc(recs.length * RECORD_SIZE);
  let n = 0;
  let dups = 0;
  let prev = -1n;
  for (const r of recs) {
    if (r.id === prev) {
      dups++;
      continue;
    }
    prev = r.id;
    const o = n * RECORD_SIZE;
    buffer.writeBigUInt64LE(r.id, o);
    buffer.writeUInt8(r.mode, o + 8);
    buffer.writeUInt8(r.rule, o + 9);
    buffer.writeUInt16LE(0, o + 10);
    n++;
  }
  return { buffer: buffer.subarray(0, n * RECORD_SIZE), flags: recs.length, records: n, dups };
}

/** Main conversion: one input file at a time. */
export function convertFlagFiles(inputDir: string, outputDir: string): ConversionStats {
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
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs.readdirSync(inputDir).filter((f) => f.startsWith('v3_') && f.endsWith('.json'));
  stats.totalFiles = files.length;
  console.log(`Found ${files.length} v3_*.json files`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const startId = parseFileName(file);
    if (startId === null) {
      stats.validationErrors.push({
        file,
        error: 'Invalid file name format (expected v3_<startId>.json with startId % 10M == 0)',
      });
      continue;
    }
    try {
      const data = JSON.parse(fs.readFileSync(path.join(inputDir, file), 'utf8'));
      const { buffer, flags, records } = convertBandData(data, startId);
      stats.totalFlaggedIds += records;
      if (records > 0) {
        const out = path.join(outputDir, `band_${startId / BAND_SIZE}.bin`);
        fs.writeFileSync(out + '.tmp', buffer);
        fs.renameSync(out + '.tmp', out);
        stats.bandsWritten++;
      }
      void flags;
    } catch (error) {
      stats.validationErrors.push({ file, error: error instanceof Error ? error.message : String(error) });
    }
    if ((i + 1) % 100 === 0 || i === files.length - 1) {
      console.log(`Processed ${i + 1}/${files.length} files...`);
    }
  }

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
  console.log(`Total storage: ${storageMB.toFixed(2)} MB (12 bytes per record: 8B ID + 1B mode + 1B rule [A/L/B=AL] + 2B padding)`);
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
