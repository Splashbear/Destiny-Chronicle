/**
 * Multi-root D1 billions 1-4 (root routing, PW up to 4e9, act union+dedupe, caveat).
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Database } from 'duckdb-async';
import { ArchiveService } from '../services/archive.service';
import { planBands, BAND_SIZE } from '../services/played-with.service';
import {
  activityDedupeKey,
  d1CoverageCaveat,
  d1MaxInstanceId,
  d1RootIndexesForInstanceId,
} from '../utils/d1-roots';

const BUCKET = 115;
const TEST_MID = '1000000000001';

describe('D1 billion 4 multi-root', () => {
  let tmp: string;
  let rootA: string;
  let rootB: string;
  let rootC: string;
  let rootD: string;
  let db: Database | null = null;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd1b4-'));
    rootA = path.join(tmp, 'd1_final');
    rootB = path.join(tmp, 'd1_b2');
    rootC = path.join(tmp, 'd1_b3_hs');
    rootD = path.join(tmp, 'd1_b4_hs');
    try {
      const { Database: DuckDB } = await import('duckdb-async');
      const seedDb = await DuckDB.create(':memory:');
      await seedRoots(seedDb, rootA, rootB, rootC, rootD);
      await seedDb.close();
      db = await DuckDB.create(':memory:');
    } catch (error) {
      console.warn('DuckDB not available, skipping D1 billion4 fixtures', error);
    }
  });

  afterAll(async () => {
    if (db) {
      try { await db.close(); } catch { /* */ }
    }
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  test('3000000001 and 4000000000 map to root 3 when 4 roots configured; 4000000001 uncovered; 3 roots leave 3000000001 uncovered', () => {
    expect(d1MaxInstanceId(4)).toBe(4_000_000_000);
    expect(d1MaxInstanceId(3)).toBe(3_000_000_000);
    expect(d1CoverageCaveat(4)).toContain('billions 1-4');
    expect(d1CoverageCaveat(4)).toContain('1-4B');
    expect(d1CoverageCaveat(4)).toContain('Oct 2015');
    expect(d1RootIndexesForInstanceId(3_000_000_001, 4)).toEqual([3]);
    expect(d1RootIndexesForInstanceId(4_000_000_000, 4)).toEqual([3]);
    expect(d1RootIndexesForInstanceId(4_000_000_001, 4)).toEqual([]);
    expect(d1RootIndexesForInstanceId(3_000_000_001, 3)).toEqual([]);
  });

  test('four-root: PW accepts IDs above 3e9 up to 4e9; 4000000001 uncovered; three-root still uncovers 3000000001', () => {
    const four = planBands(
      ['3000000000', '3000000001', '4000000000', '4000000001'],
      {
        legacyRoot: '',
        compactRoot: '',
        splitIid: 1e10,
        compactMaxIid: 16e9,
        d1Root: rootA,
        d1Roots: [rootA, rootB, rootC, rootD],
      },
      new Set(),
      new Set(),
      'D1',
    );
    expect([...four.d1.values()].flat()).toEqual(
      expect.arrayContaining(['3000000000', '3000000001', '4000000000']),
    );
    expect(four.d1.has(Math.floor(3000000001 / BAND_SIZE))).toBe(true);
    expect(four.uncovered).toContain('4000000001');
    expect(four.uncovered).not.toContain('3000000001');

    const three = planBands(
      ['3000000001'],
      {
        legacyRoot: '',
        compactRoot: '',
        splitIid: 1e10,
        compactMaxIid: 16e9,
        d1Root: rootA,
        d1Roots: [rootA, rootB, rootC],
      },
      new Set(),
      new Set(),
      'D1',
    );
    expect(three.uncovered).toContain('3000000001');
  });

  test('four-root act union+dedupe; caveat billions 1-4', async () => {
    if (!db) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }

    const svc = new ArchiveService('', '', '', '', '', '', false, '', false, [rootA, rootB, rootC, rootD]);
    svc['db'] = db;
    svc['archiveAvailable'] = true;
    svc['bucketHashType'] = 'VARCHAR';
    jest.spyOn(svc as any, 'calculateBucket').mockResolvedValue(BUCKET);

    const result = await svc.getPlayerActivitiesMultiTier(TEST_MID, { game: 'D1', limit: 100 });
    expect(result.tier.source).toBe('d1_act');
    expect(result.tier.notes!.some(n => n.includes('billions 1-4'))).toBe(true);
    expect(d1CoverageCaveat(4)).toContain('1-4B');
    expect(d1CoverageCaveat(4)).toContain('Oct 2015');

    const ids = result.activities.map(a => a.instance_id);
    expect(ids.filter(id => id === '100001').length).toBe(1);
    expect(ids).toContain('1000100001');
    expect(ids).toContain('2899343525');
    expect(ids).toContain('3000000001');
    expect(ids).toContain('4000000000');

    const keys = result.activities.map(a => activityDedupeKey(a));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

async function seedRoots(db: Database, rootA: string, rootB: string, rootC: string, rootD: string): Promise<void> {
  const mid = 1000000000001n;
  const charId = 2305843009400000028n;

  const roots: Array<[string, string[]]> = [
    [rootA, [
      `(100001, '2014-09-06 17:45:00', 111, 6, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
    ]],
    [rootB, [
      `(100001, '2014-09-06 17:45:00', 111, 6, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
      `(1000100001, '2015-01-15 12:00:00', 444, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
    ]],
    [rootC, [
      `(2899343525, '2015-06-29 09:03:41', 2659248071, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
    ]],
    [rootD, [
      `(3000000001, '2015-07-12 16:00:00', 1111111111, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
      `(4000000000, '2015-10-19 18:00:00', 2222222222, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
    ]],
  ];

  for (const [root, rows] of roots) {
    const dir = path.join(root, 'act', `mid_bucket=${BUCKET}`);
    await fs.mkdir(dir, { recursive: true });
    const actPath = path.join(dir, 'instances.parquet');
    await db.all(`
      CREATE OR REPLACE TEMP TABLE d1_act (
        instance_id BIGINT, period TIMESTAMP, activity_hash UINTEGER, mode SMALLINT,
        membership_id BIGINT, membership_type TINYINT, character_id BIGINT, completed BOOLEAN,
        deaths INTEGER, kills INTEGER, assists INTEGER, duration_seconds INTEGER,
        game VARCHAR, display_name VARCHAR, mid_bucket BIGINT
      )
    `);
    await db.all(`INSERT INTO d1_act VALUES ${rows.join(',')}`);
    await db.all(`COPY d1_act TO '${actPath.replace(/\\/g, '/')}' (FORMAT PARQUET)`);
    await db.all('DROP TABLE d1_act');
  }
}
