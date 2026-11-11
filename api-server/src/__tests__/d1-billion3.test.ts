/**
 * Multi-root D1 billions 1–3 (act union+dedupe, PW up to 3e9, caveat).
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Database } from 'duckdb-async';
import { ArchiveService } from '../services/archive.service';
import { planBands, BAND_SIZE } from '../services/played-with.service';
import { activityDedupeKey, d1CoverageCaveat, d1MaxInstanceId } from '../utils/d1-roots';

const BUCKET = 115;
const TEST_MID = '1000000000001';

describe('D1 billion 3 multi-root', () => {
  let tmp: string;
  let rootA: string;
  let rootB: string;
  let rootC: string;
  let db: Database | null = null;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd1b3-'));
    rootA = path.join(tmp, 'd1_final');
    rootB = path.join(tmp, 'd1_b2');
    rootC = path.join(tmp, 'd1_b3_hs');
    try {
      const { Database: DuckDB } = await import('duckdb-async');
      const seedDb = await DuckDB.create(':memory:');
      await seedRoots(seedDb, rootA, rootB, rootC);
      await seedDb.close();
      db = await DuckDB.create(':memory:');
    } catch (error) {
      console.warn('DuckDB not available, skipping D1 billion3 fixtures', error);
    }
  });

  afterAll(async () => {
    if (db) {
      try { await db.close(); } catch { /* */ }
    }
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  test('three-root: PW accepts IDs above 2e9 up to 3e9; band 2000 planned', () => {
    expect(d1MaxInstanceId(3)).toBe(3_000_000_000);
    const plan = planBands(
      ['2000000000', '2000000001', '2899343525', '3000000001'],
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
    expect([...plan.d1.values()].flat()).toEqual(
      expect.arrayContaining(['2000000000', '2000000001', '2899343525']),
    );
    expect(plan.d1.has(Math.floor(2899343525 / BAND_SIZE))).toBe(true);
    expect(plan.uncovered).toContain('3000000001');
  });

  test('three-root act union+dedupe; caveat billions 1-3', async () => {
    if (!db) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }

    const svc = new ArchiveService('', '', '', '', '', '', false, '', false, [rootA, rootB, rootC]);
    svc['db'] = db;
    svc['archiveAvailable'] = true;
    svc['bucketHashType'] = 'VARCHAR';
    jest.spyOn(svc as any, 'calculateBucket').mockResolvedValue(BUCKET);

    const result = await svc.getPlayerActivitiesMultiTier(TEST_MID, { game: 'D1', limit: 100 });
    expect(result.tier.source).toBe('d1_act');
    expect(result.tier.notes!.some(n => n.includes('billions 1-3'))).toBe(true);
    expect(d1CoverageCaveat(3)).toContain('1-3B');
    expect(d1CoverageCaveat(3)).toContain('Jul 2015');

    const ids = result.activities.map(a => a.instance_id);
    expect(ids.filter(id => id === '100001').length).toBe(1);
    expect(ids).toContain('1000100001');
    expect(ids).toContain('2899343525');
    expect(ids).toContain('2905700647');

    const keys = result.activities.map(a => activityDedupeKey(a));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

async function seedRoots(db: Database, rootA: string, rootB: string, rootC: string): Promise<void> {
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
      `(2905700647, '2015-06-30 02:49:11', 1836108428, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
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
