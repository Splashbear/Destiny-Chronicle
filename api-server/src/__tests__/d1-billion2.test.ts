/**
 * W64: multi-root D1 billions 1–2 (act union+dedupe, PW >1e9, missing root).
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
  filterExistingRoots,
  parseRootList,
} from '../utils/d1-roots';

const BUCKET = 115;
const TEST_MID = '1000000000001';

describe('W64 D1 billion 2 multi-root', () => {
  let tmp: string;
  let rootA: string;
  let rootB: string;
  let missingRoot: string;
  let db: Database | null = null;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd1b2-'));
    rootA = path.join(tmp, 'd1_final');
    rootB = path.join(tmp, 'd1_b2');
    missingRoot = path.join(tmp, 'does-not-exist');
    try {
      const { Database: DuckDB } = await import('duckdb-async');
      // Seed with a throwaway connection so query DuckDB does not hold write locks on fixtures.
      const seedDb = await DuckDB.create(':memory:');
      await seedRoots(seedDb, rootA, rootB);
      await seedDb.close();
      db = await DuckDB.create(':memory:');
    } catch (error) {
      console.warn('DuckDB not available, skipping W64 D1 billion2 fixtures', error);
    }
  });

  afterAll(async () => {
    if (db) {
      try { await db.close(); } catch { /* */ }
    }
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  test('parseRootList: ROOTS wins, falls back to single, skips empties', () => {
    expect(parseRootList('a;b;a', 'c')).toEqual(['a', 'b']);
    expect(parseRootList(undefined, 'c')).toEqual(['c']);
    expect(parseRootList('', '')).toEqual([]);
    expect(parseRootList(' ; a ;; b ; ', '')).toEqual(['a', 'b']);
  });

  test('filterExistingRoots skips missing with remaining roots kept', () => {
    if (!db) return;
    const ok = filterExistingRoots([rootA, missingRoot, rootB], 'test');
    expect(ok).toEqual([rootA, rootB]);
  });

  test('coverage caveat depends on configured root count', () => {
    expect(d1CoverageCaveat(1)).toContain('billion 1 only');
    expect(d1CoverageCaveat(2)).toContain('billions 1-2');
    expect(d1MaxInstanceId(1)).toBe(1_000_000_000);
    expect(d1MaxInstanceId(2)).toBe(2_000_000_000);
  });

  test('single-root back-compat: PW caps at 1e9', () => {
    const plan = planBands(
      ['999999999', '1000000001', '1500000000'],
      { legacyRoot: '', compactRoot: '', splitIid: 1e10, compactMaxIid: 16e9, d1Root: rootA },
      new Set(),
      new Set(),
      'D1',
    );
    expect(plan.d1.has(Math.floor(999999999 / BAND_SIZE))).toBe(true);
    expect([...plan.d1.values()].flat()).toContain('999999999');
    expect(plan.uncovered).toContain('1000000001');
    expect(plan.uncovered).toContain('1500000000');
  });

  test('two-root: PW accepts IDs above 1e9 up to 2e9; band 1000 planned', () => {
    const plan = planBands(
      ['1000000000', '1000000001', '1500000000', '2000000001'],
      {
        legacyRoot: '',
        compactRoot: '',
        splitIid: 1e10,
        compactMaxIid: 16e9,
        d1Root: rootA,
        d1Roots: [rootA, rootB],
      },
      new Set(),
      new Set(),
      'D1',
    );
    expect([...plan.d1.values()].flat()).toEqual(
      expect.arrayContaining(['1000000000', '1000000001', '1500000000']),
    );
    expect(plan.d1.has(1000)).toBe(true);
    expect(plan.uncovered).toContain('2000000001');
  });

  test('two-root act union+dedupe; caveat billions 1-2', async () => {
    if (!db) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }

    const svc = new ArchiveService('', '', '', '', '', '', false, '', false, [rootA, rootB, missingRoot]);
    svc['db'] = db;
    svc['archiveAvailable'] = true;
    svc['bucketHashType'] = 'VARCHAR';
    jest.spyOn(svc as any, 'calculateBucket').mockResolvedValue(BUCKET);

    const result = await svc.getPlayerActivitiesMultiTier(TEST_MID, { game: 'D1', limit: 100 });
    expect(result.tier.source).toBe('d1_act');
    expect(result.tier.indexComplete).toBe(false);
    expect(result.tier.notes!.some(n => n.includes('billions 1-2'))).toBe(true);

    const ids = result.activities.map(a => a.instance_id);
    expect(ids.filter(id => id === '100001').length).toBe(1);
    expect(ids).toContain('1000100001');
    expect(ids).toContain('100002');
    expect(ids).toContain('1000000000');
    expect(ids).toContain('1000000001');

    const keys = result.activities.map(a => activityDedupeKey(a));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('missing-only roots still return partial caveat without crash', async () => {
    if (!db) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }

    const svc = new ArchiveService('', '', '', '', '', '', false, '', false, [missingRoot]);
    svc['db'] = db;
    svc['archiveAvailable'] = true;
    svc['bucketHashType'] = 'VARCHAR';
    jest.spyOn(svc as any, 'calculateBucket').mockResolvedValue(BUCKET);

    const result = await svc.getPlayerActivitiesMultiTier(TEST_MID, { game: 'D1' });
    expect(result.tier.level).toBe('partial');
    expect(result.tier.source).toBe('none');
    expect(result.activities).toEqual([]);
    expect(result.tier.notes!.some(n => n.includes('billion 1 only'))).toBe(true);
  });
});

async function seedRoots(db: Database, rootA: string, rootB: string): Promise<void> {
  const mid = 1000000000001n;
  const charId = 2305843009400000028n;

  for (const [root, rows] of [
    [rootA, [
      `(100001, '2014-09-06 17:45:00', 111, 6, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
      `(100002, '2014-09-07 18:30:00', 222, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
      `(1000000000, '2014-12-09 12:00:00', 333, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
    ]],
    [rootB, [
      `(100001, '2014-09-06 17:45:00', 111, 6, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
      `(1000100001, '2015-01-15 12:00:00', 444, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
      `(1000000001, '2014-12-10 12:00:00', 555, 4, ${mid}, 2, ${charId}, true, 0, 0, 0, 100, 'D1', 'A', ${BUCKET})`,
    ]],
  ] as const) {
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

    // Band 1000 in both roots (boundary shared across billions)
    const pwDir = path.join(root, 'pw', 'iid_band=1000');
    await fs.mkdir(pwDir, { recursive: true });
    const pwPath = path.join(pwDir, 'pw.parquet');
    const iid = root === rootA ? 1000000000 : 1000000001;
    await db.all(`
      CREATE OR REPLACE TEMP TABLE d1_pw (
        instance_id BIGINT, membership_id BIGINT, membership_type TINYINT,
        period TIMESTAMP, activity_hash UINTEGER, mode SMALLINT, iid_band BIGINT
      )
    `);
    await db.all(`INSERT INTO d1_pw VALUES (${iid}, ${mid}, 2, '2014-12-09 12:00:00', 1, 4, 1000)`);
    await db.all(`COPY d1_pw TO '${pwPath.replace(/\\/g, '/')}' (FORMAT PARQUET)`);
    await db.all('DROP TABLE d1_pw');
  }
}
