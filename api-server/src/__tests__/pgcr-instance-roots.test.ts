/**
 * Instance PGCR must consult the same D1 / gap roots as player history,
 * key by game+instanceId, and treat player-only peels as a miss.
 *
 * D1 fixtures use the real act schema from docs/D1_SUPPORT.md (no director_activity_hash)
 * plus pw/iid_band for the fast instance path.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Database } from 'duckdb-async';
import { ArchiveService } from '../services/archive.service';
import { logger } from '../utils/logger';
import {
  d1PlayedWithBand,
  d1RootIndexesForInstanceId,
} from '../utils/d1-roots';
import {
  describeConfiguredGameDataRoots,
  isPartialArchiveRoster,
} from '../utils/pgcr-archive-roster';

const BUCKET = 115;
/** In D1 billion-1 range (fixture root d1_b1) and also present in gap as D2. */
const COLLIDE_ID = '500000123';
const D1_ONLY_B1 = '100001';
const D1_ONLY_B2 = '1000100001';
const D1_ONLY_B3 = '2899343525';
const D2_GAP = '12000000001';
const D2_EXTRA = '15000000001';
/** In billion-1 range; single-mid raid peel → miss. */
const PARTIAL_RAID = '999000001';
/** Numeric mids matching real D1 BIGINT membership_id column. */
const MID = {
  a1: '1001',
  a2: '1002',
  d1a: '2001',
  d1b: '2002',
  solo: '3001',
  b1: '4001',
  b2: '4002',
  c1: '5001',
  c2: '5002',
  hist: '1000000000001',
  g1: '6001',
  g2: '6002',
  d2a: '7001',
  d2b: '7002',
  e1: '8001',
  e2: '8002',
} as const;

describe('d1RootIndexesForInstanceId', () => {
  it('routes by billion range derived from root count', () => {
    expect(d1RootIndexesForInstanceId(D1_ONLY_B1, 3)).toEqual([0]);
    expect(d1RootIndexesForInstanceId(D1_ONLY_B2, 3)).toEqual([1]);
    expect(d1RootIndexesForInstanceId(D1_ONLY_B3, 3)).toEqual([2]);
    expect(d1RootIndexesForInstanceId(1_000_000_000, 3)).toEqual([0, 1]);
    expect(d1RootIndexesForInstanceId(4_000_000_000, 3)).toEqual([]);
  });

  it('maps played-with band from instance id', () => {
    expect(d1PlayedWithBand(D1_ONLY_B3)).toBe(2899);
    expect(d1PlayedWithBand(D1_ONLY_B2)).toBe(1000);
  });
});

describe('pgcr instance roots parity', () => {
  it('every D1 and gap root used by history is also listed for instance', () => {
    const roots = describeConfiguredGameDataRoots({
      leanActivitiesPath: '/lean.parquet',
      playerActivitiesLitePath: '/lite.parquet',
      gapIndexRoot: '/gap',
      gapIndexSortedRoot: '/gap_sorted',
      gapIndexExtraRoots: ['/gap_extra_10_16b'],
      enableGapLean: true,
      d1IndexRoots: ['/d1_b1', '/d1_b2', '/d1_b3'],
    });
    const instanceRoots = roots.filter(r => r.usedBy.includes('instance'));
    const historyOnly = roots.filter(r => r.usedBy.includes('history') && !r.usedBy.includes('instance'));
    expect(instanceRoots.some(r => r.kind === 'lean')).toBe(true);
    expect(instanceRoots.filter(r => r.kind === 'd1_act').map(r => r.path)).toEqual([
      '/d1_b1',
      '/d1_b2',
      '/d1_b3',
    ]);
    expect(instanceRoots.some(r => r.path === '/gap_extra_10_16b')).toBe(true);
    expect(historyOnly.every(r => r.kind === 'lite')).toBe(true);
  });

  it('D1/D2 colliding ids stay game-scoped via partial-roster rules', () => {
    const d1 = [{ membership_id: 'a', mode: 4 }];
    const d2 = [
      { membership_id: 'a', mode: 4 },
      { membership_id: 'b', mode: 4 },
    ];
    expect(isPartialArchiveRoster(d1)).toBe(true);
    expect(isPartialArchiveRoster(d2)).toBe(false);
  });
});

describe('pgcr instance lookup fixtures', () => {
  let tmp: string;
  let leanPath: string;
  let d1b1: string;
  let d1b2: string;
  let d1b3: string;
  let gapRoot: string;
  let gapExtra: string;
  let db: Database | null = null;
  let instanceDb: Database | null = null;
  let svc: ArchiveService | null = null;
  const latencies: Record<string, number> = {};

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pgcr-inst-'));
    leanPath = path.join(tmp, 'lean.parquet');
    d1b1 = path.join(tmp, 'd1_b1');
    d1b2 = path.join(tmp, 'd1_b2');
    d1b3 = path.join(tmp, 'd1_b3');
    gapRoot = path.join(tmp, 'gap');
    gapExtra = path.join(tmp, 'gap_extra');
    try {
      const { Database: DuckDB } = await import('duckdb-async');
      const seedDb = await DuckDB.create(':memory:');
      await seedAll(seedDb, {
        leanPath,
        d1b1,
        d1b2,
        d1b3,
        gapRoot,
        gapExtra,
      });
      await seedDb.close();
      db = await DuckDB.create(':memory:');
      instanceDb = await DuckDB.create(':memory:');
      svc = new ArchiveService(
        leanPath,
        '',
        '',
        '',
        '',
        gapRoot,
        true,
        '',
        false,
        [d1b1, d1b2, d1b3],
        [gapExtra]
      );
      (svc as any).db = db;
      (svc as any).instanceDb = instanceDb;
      (svc as any).archiveAvailable = true;
      (svc as any).bucketHashType = 'VARCHAR';
      (svc as any).instanceLookupTimeoutMs = 10_000;
      jest.spyOn(svc as any, 'calculateBucket').mockResolvedValue(BUCKET);
      jest.spyOn(svc as any, 'calculateBucketOnInstanceDb').mockResolvedValue(BUCKET);
    } catch (error) {
      console.warn('DuckDB not available, skipping instance lookup fixtures', error);
    }
  });

  afterAll(async () => {
    for (const d of [db, instanceDb]) {
      if (d) {
        try {
          await d.close();
        } catch {
          /* */
        }
      }
    }
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    if (Object.keys(latencies).length) {
      // eslint-disable-next-line no-console
      console.log('[pgcr-instance-latency]', JSON.stringify(latencies));
    }
  });

  test('reads each configured D1 and gap root via fast paths', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const cases: Array<{ id: string; game: 'D1' | 'D2'; rootHint: string }> = [
      { id: D1_ONLY_B1, game: 'D1', rootHint: 'd1_b1' },
      { id: D1_ONLY_B2, game: 'D1', rootHint: 'd1_b2' },
      { id: D1_ONLY_B3, game: 'D1', rootHint: 'd1_b3' },
      { id: D2_GAP, game: 'D2', rootHint: 'gap' },
      { id: D2_EXTRA, game: 'D2', rootHint: 'gap_extra' },
    ];
    for (const c of cases) {
      const t0 = Date.now();
      const rows = await svc.getActivitiesByInstanceId(c.id, c.game);
      latencies[`instance_${c.rootHint}`] = Date.now() - t0;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every(r => r.game === c.game)).toBe(true);
      expect(rows.every(r => r.instance_id === c.id)).toBe(true);
      expect(isPartialArchiveRoster(rows)).toBe(false);
    }
  });

  test('D1 instance path never hive-scans mid_bucket=*', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const spy = jest.spyOn(svc as any, 'instanceDbAll');
    await svc.getActivitiesByInstanceId(D1_ONLY_B3, 'D1');
    const sqls = spy.mock.calls.map(c => String(c[0] || ''));
    const paths = spy.mock.calls.map(c => String(c[1] || ''));
    expect(sqls.some(s => s.includes('mid_bucket=*'))).toBe(false);
    expect(paths.some(p => p.includes('iid_band=') || p.includes(`${path.sep}pw${path.sep}`) || p.includes('/pw/'))).toBe(
      true
    );
    spy.mockRestore();
  });

  test('same instance id returns the correct game for D1 and D2', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const d1 = await svc.getActivitiesByInstanceId(COLLIDE_ID, 'D1');
    const d2 = await svc.getActivitiesByInstanceId(COLLIDE_ID, 'D2');
    expect(d1.map(r => r.membership_id).sort()).toEqual([MID.d1a, MID.d1b]);
    expect(d1.every(r => r.game === 'D1')).toBe(true);
    expect(d1.every(r => r.director_activity_hash === 0)).toBe(true);
    expect(d2.map(r => r.membership_id).sort()).toEqual([MID.d2a, MID.d2b]);
    expect(d2.every(r => r.game === 'D2')).toBe(true);
  });

  test('D1 roots without director_activity_hash still return a full fireteam', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const rows = await svc.getActivitiesByInstanceId(D1_ONLY_B3, 'D1');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every(r => r.director_activity_hash === 0)).toBe(true);
  });

  test('one-mid multiplayer index hit is a miss', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const rows = await svc.getActivitiesByInstanceId(PARTIAL_RAID, 'D1');
    expect(rows).toEqual([]);
  });

  test('failed root read during instance lookup is a miss (not partial success)', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const original = (svc as any).instanceDbAll.bind(svc);
    jest.spyOn(svc as any, 'instanceDbAll').mockImplementation(async (...args: unknown[]) => {
      const glob = String(args[1] || '');
      if (glob.includes('gap_extra')) {
        throw new Error('simulated bucket IO failure');
      }
      return original(...args);
    });
    try {
      const rows = await svc!.getActivitiesByInstanceId(D2_EXTRA, 'D2');
      expect(rows).toEqual([]);
    } finally {
      (svc as any).instanceDbAll.mockRestore();
    }
  });

  test('binder schema errors are logged as root read errors (not swallowed silently)', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const original = (svc as any).instanceDbAll.bind(svc);
    const errorSpy = jest.spyOn(logger, 'error');
    jest.spyOn(svc as any, 'instanceDbAll').mockImplementation(async (...args: unknown[]) => {
      const sql = String(args[0] || '');
      const p = String(args[1] || '');
      if (sql.includes('DESCRIBE')) {
        return original(...args);
      }
      if (
        sql.includes('SELECT') &&
        !sql.includes('DESCRIBE') &&
        p.includes('d1_b3') &&
        (p.includes('/act/') || p.includes('\\act\\'))
      ) {
        throw new Error(
          'Binder Error: Referenced column "director_activity_hash" not found in FROM clause!'
        );
      }
      return original(...args);
    });
    try {
      const rows = await svc!.getActivitiesByInstanceId(D1_ONLY_B3, 'D1');
      expect(rows).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        'Instance fireteam-index root read error; treating lookup as miss',
        expect.objectContaining({
          binderError: true,
          error: expect.stringContaining('Binder Error'),
        })
      );
    } finally {
      (svc as any).instanceDbAll.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test('history stays fast while a D1 instance lookup runs (separate DuckDB queue)', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    let instanceHeld = false;
    const original = (svc as any).instanceDbAll.bind(svc);
    jest.spyOn(svc as any, 'instanceDbAll').mockImplementation(async (...args: unknown[]) => {
      instanceHeld = true;
      await new Promise(r => setTimeout(r, 80));
      return original(...args);
    });
    try {
      const histPromise = (async () => {
        while (!instanceHeld) {
          await new Promise(r => setTimeout(r, 1));
        }
        const t0 = Date.now();
        const hist = await svc!.getPlayerActivitiesMultiTier(MID.hist, { game: 'D1', limit: 50 });
        const ms = Date.now() - t0;
        latencies.history_during_d1_instance_ms = ms;
        expect(hist.activities.length).toBeGreaterThan(0);
        expect(ms).toBeLessThan(200);
      })();
      await Promise.all([svc.getActivitiesByInstanceId(D1_ONLY_B3, 'D1'), histPromise]);
    } finally {
      (svc as any).instanceDbAll.mockRestore();
    }
  });

  test('reports instance lookup vs concurrent history latency', async () => {
    if (!svc) {
      console.warn('Skipping test: DuckDB not available');
      return;
    }
    const mid = MID.hist;
    const t0 = Date.now();
    const [inst, hist] = await Promise.all([
      svc.getActivitiesByInstanceId(D1_ONLY_B3, 'D1'),
      svc.getPlayerActivitiesMultiTier(mid, { game: 'D1', limit: 50 }),
    ]);
    latencies.concurrent_instance_ms = Date.now() - t0;
    latencies.concurrent_history_rows = hist.activities.length;
    expect(inst.length).toBeGreaterThanOrEqual(2);
    expect(hist.activities.length).toBeGreaterThan(0);
  });
});

async function seedAll(
  db: Database,
  paths: {
    leanPath: string;
    d1b1: string;
    d1b2: string;
    d1b3: string;
    gapRoot: string;
    gapExtra: string;
  }
): Promise<void> {
  const q = (p: string) => p.replace(/\\/g, '/');
  // Real D1 act schema (docs/D1_SUPPORT.md) — no director_activity_hash.
  const d1Cols = `
    instance_id BIGINT, period TIMESTAMP, activity_hash UINTEGER, mode SMALLINT,
    membership_id BIGINT, membership_type TINYINT, character_id BIGINT, completed BOOLEAN,
    deaths INTEGER, kills INTEGER, assists INTEGER, duration_seconds INTEGER,
    game VARCHAR, display_name VARCHAR, mid_bucket BIGINT
  `;
  const pwCols = `
    instance_id BIGINT, membership_id BIGINT, membership_type TINYINT, period TIMESTAMP,
    activity_hash UINTEGER, mode SMALLINT, iid_band BIGINT
  `;
  const gapCols = `
    instance_id BIGINT, period TIMESTAMP, activity_hash UINTEGER, director_activity_hash UINTEGER,
    mode SMALLINT, membership_id BIGINT, membership_type TINYINT, display_name VARCHAR,
    character_id BIGINT, completed BOOLEAN, deaths INTEGER, kills INTEGER, assists INTEGER,
    duration_seconds INTEGER, standing INTEGER, starting_phase_index INTEGER, fireteam_id VARCHAR,
    is_private BOOLEAN, dump_id VARCHAR, game VARCHAR, mid_bucket BIGINT
  `;
  const d1Row = (
    iid: string,
    mid: string,
    mode: number,
    period: string,
    charSuffix: number,
    name: string
  ) =>
    `(${iid}, '${period}', 2659248071, ${mode}, ${mid}, 2, ${2305843009400000000n + BigInt(charSuffix)}, true, 0, 0, 0, 100, 'D1', '${name}', ${BUCKET})`;

  const pwRow = (iid: string, mid: string, mode: number, period: string) =>
    `(${iid}, ${mid}, 2, '${period}', 2659248071, ${mode}, ${d1PlayedWithBand(iid)})`;

  const gapRow = (
    iid: string,
    mid: string,
    mode: number,
    period: string,
    charSuffix: number,
    name: string
  ) =>
    `(${iid}, '${period}', 1, 1, ${mode}, ${mid}, 2, '${name}', ${2305843009400000000n + BigInt(charSuffix)}, true, 0, 0, 0, 100, 0, 0, '', false, '', 'D2', ${BUCKET})`;

  await db.all(`CREATE OR REPLACE TEMP TABLE lean (${gapCols})`);
  await db.all(`COPY lean TO '${q(paths.leanPath)}' (FORMAT PARQUET)`);
  await db.all('DROP TABLE lean');

  const writeD1 = async (
    root: string,
    actRows: string[],
    pwRows: string[]
  ) => {
    const dir = path.join(root, 'act', `mid_bucket=${BUCKET}`);
    await fs.mkdir(dir, { recursive: true });
    await db.all(`CREATE OR REPLACE TEMP TABLE d1_act (${d1Cols})`);
    await db.all(`INSERT INTO d1_act VALUES ${actRows.join(',')}`);
    await db.all(`COPY d1_act TO '${q(path.join(dir, 'instances.parquet'))}' (FORMAT PARQUET)`);
    await db.all('DROP TABLE d1_act');

    // Group PW rows by band
    const byBand = new Map<number, string[]>();
    for (const row of pwRows) {
      const iid = row.match(/^\((\d+)/)?.[1];
      if (!iid) continue;
      const band = d1PlayedWithBand(iid);
      const list = byBand.get(band) || [];
      list.push(row);
      byBand.set(band, list);
    }
    for (const [band, rows] of byBand) {
      const pwDir = path.join(root, 'pw', `iid_band=${band}`);
      await fs.mkdir(pwDir, { recursive: true });
      await db.all(`CREATE OR REPLACE TEMP TABLE d1_pw (${pwCols})`);
      await db.all(`INSERT INTO d1_pw VALUES ${rows.join(',')}`);
      await db.all(`COPY d1_pw TO '${q(path.join(pwDir, 'pw.parquet'))}' (FORMAT PARQUET)`);
      await db.all('DROP TABLE d1_pw');
    }
  };

  const writeGap = async (root: string, rows: string[]) => {
    const dir = path.join(root, `mid_bucket=${BUCKET}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '_COMPLETE.json'), '{}');
    await db.all(`CREATE OR REPLACE TEMP TABLE gap_act (${gapCols})`);
    await db.all(`INSERT INTO gap_act VALUES ${rows.join(',')}`);
    await db.all(`COPY gap_act TO '${q(path.join(dir, 'instances.parquet'))}' (FORMAT PARQUET)`);
    await db.all('DROP TABLE gap_act');
  };

  await writeD1(
    paths.d1b1,
    [
      d1Row(D1_ONLY_B1, MID.a1, 4, '2014-09-06 17:45:00', 1, 'a1'),
      d1Row(D1_ONLY_B1, MID.a2, 4, '2014-09-06 17:45:00', 2, 'a2'),
      d1Row(COLLIDE_ID, MID.d1a, 4, '2020-12-13 15:03:59', 3, 'd1a'),
      d1Row(COLLIDE_ID, MID.d1b, 4, '2020-12-13 15:03:59', 4, 'd1b'),
      d1Row(PARTIAL_RAID, MID.solo, 4, '2015-01-01 00:00:00', 5, 'solo'),
    ],
    [
      pwRow(D1_ONLY_B1, MID.a1, 4, '2014-09-06 17:45:00'),
      pwRow(D1_ONLY_B1, MID.a2, 4, '2014-09-06 17:45:00'),
      pwRow(COLLIDE_ID, MID.d1a, 4, '2020-12-13 15:03:59'),
      pwRow(COLLIDE_ID, MID.d1b, 4, '2020-12-13 15:03:59'),
      pwRow(PARTIAL_RAID, MID.solo, 4, '2015-01-01 00:00:00'),
    ]
  );
  await writeD1(
    paths.d1b2,
    [
      d1Row(D1_ONLY_B2, MID.b1, 4, '2015-01-15 12:00:00', 6, 'b1'),
      d1Row(D1_ONLY_B2, MID.b2, 4, '2015-01-15 12:00:00', 7, 'b2'),
    ],
    [
      pwRow(D1_ONLY_B2, MID.b1, 4, '2015-01-15 12:00:00'),
      pwRow(D1_ONLY_B2, MID.b2, 4, '2015-01-15 12:00:00'),
    ]
  );
  await writeD1(
    paths.d1b3,
    [
      d1Row(D1_ONLY_B3, MID.c1, 4, '2015-06-29 09:03:41', 8, 'c1'),
      d1Row(D1_ONLY_B3, MID.c2, 4, '2015-06-29 09:03:41', 9, 'c2'),
      d1Row(D1_ONLY_B3, MID.hist, 4, '2015-06-29 09:03:41', 10, 'hist'),
      d1Row('2905700647', MID.hist, 4, '2015-06-30 02:49:11', 11, 'hist'),
    ],
    [
      pwRow(D1_ONLY_B3, MID.c1, 4, '2015-06-29 09:03:41'),
      pwRow(D1_ONLY_B3, MID.c2, 4, '2015-06-29 09:03:41'),
      pwRow(D1_ONLY_B3, MID.hist, 4, '2015-06-29 09:03:41'),
      pwRow('2905700647', MID.hist, 4, '2015-06-30 02:49:11'),
    ]
  );
  await writeGap(paths.gapRoot, [
    gapRow(D2_GAP, MID.g1, 4, '2024-01-01 00:00:00', 12, 'g1'),
    gapRow(D2_GAP, MID.g2, 4, '2024-01-01 00:00:00', 13, 'g2'),
    gapRow(COLLIDE_ID, MID.d2a, 4, '2020-09-12 03:12:16', 14, 'd2a'),
    gapRow(COLLIDE_ID, MID.d2b, 4, '2020-09-12 03:12:16', 15, 'd2b'),
  ]);
  await writeGap(paths.gapExtra, [
    gapRow(D2_EXTRA, MID.e1, 4, '2025-03-16 04:35:42', 16, 'e1'),
    gapRow(D2_EXTRA, MID.e2, 4, '2025-03-16 04:35:42', 17, 'e2'),
  ]);
}
