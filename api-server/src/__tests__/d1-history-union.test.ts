/**
 * D1 history = archive index rows UNION lite-file D1 rows, one per (game, instance_id).
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Database } from 'duckdb-async';
import { ArchiveService } from '../services/archive.service';
import { LeanActivity } from '../types/lean-activity.types';
import { unionD1History } from '../utils/d1-history-union';
import { dedupeActivitiesByInstance } from '../utils/dedupe-activities';

const MID = '4611686018452484164';
const OTHER = '4611686018429785995';

function row(over: Partial<LeanActivity>): LeanActivity {
  return {
    instance_id: '1',
    period: '2015-01-01T00:00:00Z',
    activity_hash: 111,
    director_activity_hash: 0,
    mode: 4,
    membership_id: MID,
    membership_type: 2,
    display_name: 'PuddleCubs',
    character_id: '2305843009326758315',
    completed: true,
    deaths: 1,
    kills: 10,
    assists: 2,
    duration_seconds: 600,
    standing: 0,
    starting_phase_index: 0,
    fireteam_id: '',
    is_private: false,
    dump_id: '',
    game: 'D1',
    ...over,
  };
}

describe('unionD1History', () => {
  test('archive-only: returns archive rows unchanged', () => {
    const a = [row({ instance_id: '100', period: '2015-01-02T00:00:00Z' }), row({ instance_id: '200' })];
    const u = unionD1History(MID, a, []);
    expect(u.activities.map(x => x.instance_id)).toEqual(['100', '200']);
    expect(u.liteOnlyGames).toBe(0);
    expect(u.overlapGames).toBe(0);
  });

  test('lite-only: returns lite rows', () => {
    const l = [row({ instance_id: '5000000001', period: '2016-01-01T00:00:00Z' })];
    const u = unionD1History(MID, [], l);
    expect(u.activities.map(x => x.instance_id)).toEqual(['5000000001']);
    expect(u.liteOnlyGames).toBe(1);
  });

  test('overlap: archive row wins, counted once, lite fills completed and missing stats', () => {
    const a = [
      row({ instance_id: '300', completed: null, kills: 0, deaths: 0, assists: 0, duration_seconds: 0, stats_missing: true, display_name: '' }),
      row({ instance_id: '301', completed: false, kills: 7 }),
    ];
    const l = [
      row({ instance_id: '300', completed: true, kills: 25, deaths: 3, assists: 4, duration_seconds: 900 }),
      row({ instance_id: '301', completed: true, kills: 99 }),
    ];
    const u = unionD1History(MID, a, l);
    expect(u.activities).toHaveLength(2);
    expect(u.overlapGames).toBe(2);
    const g300 = u.activities.find(x => x.instance_id === '300')!;
    expect(g300.completed).toBe(true);
    expect(g300.kills).toBe(25);
    expect(g300.duration_seconds).toBe(900);
    expect(g300.stats_missing).toBeUndefined();
    expect(g300.display_name).toBe('PuddleCubs');
    // archive's known completed=false and stats are kept (archive wins)
    const g301 = u.activities.find(x => x.instance_id === '301')!;
    expect(g301.completed).toBe(false);
    expect(g301.kills).toBe(7);
  });

  test('lite null completed never overwrites archive completed; stats-missing lite does not erase archive stats', () => {
    const a = [row({ instance_id: '400', completed: true, kills: 5 })];
    const l = [row({ instance_id: '400', completed: null, kills: 0, deaths: 0, assists: 0, duration_seconds: 0, stats_missing: true })];
    const g = unionD1History(MID, a, l).activities[0];
    expect(g.completed).toBe(true);
    expect(g.kills).toBe(5);
  });

  test('keeps D1/D2 and accounts separate', () => {
    const a = [row({ instance_id: '500' }), row({ instance_id: '501', game: 'D2' }), row({ instance_id: '502', membership_id: OTHER })];
    const l = [row({ instance_id: '600', game: 'D2' }), row({ instance_id: '601', membership_id: OTHER }), row({ instance_id: '602' })];
    const ids = unionD1History(MID, a, l).activities.map(x => x.instance_id).sort();
    expect(ids).toEqual(['500', '602']);
  });

  test('Puddlecubs-style: archive gains billion-4 games but lite games above the cap are kept', () => {
    const archive = [
      row({ instance_id: '3352885122', period: '2015-08-30T08:20:39Z' }),
      row({ instance_id: '3995803449', period: '2015-10-19T16:58:46Z' }),
    ];
    const lite = [
      row({ instance_id: '3352885122', period: '2015-08-30T08:20:39Z' }),
      row({ instance_id: '3995803449', period: '2015-10-19T16:58:46Z' }),
      row({ instance_id: '4200000000', period: '2015-11-20T00:00:00Z' }),
      row({ instance_id: '6904117268', period: '2021-03-21T01:00:10Z' }),
    ];
    const u = unionD1History(MID, archive, lite);
    expect(u.activities.map(x => x.instance_id)).toEqual(['6904117268', '4200000000', '3995803449', '3352885122']);
    expect(u.activities.length).toBeGreaterThanOrEqual(lite.length);
    expect(u.overlapGames).toBe(2);
    expect(u.liteOnlyGames).toBe(2);
  });

  test('multiple archive character rows for one game are left for the route dedupe; lite adds none', () => {
    const a = [row({ instance_id: '700', character_id: '1', completed: false }), row({ instance_id: '700', character_id: '2', completed: true })];
    const l = [row({ instance_id: '700', character_id: '3' })];
    const u = unionD1History(MID, a, l);
    expect(u.activities).toHaveLength(2);
    const { kept } = dedupeActivitiesByInstance(u.activities);
    expect(kept).toHaveLength(1);
    expect(kept[0].completed).toBe(true);
  });

  test('applies limit after union, newest first', () => {
    const a = [row({ instance_id: '1', period: '2015-01-01T00:00:00Z' })];
    const l = [row({ instance_id: '2', period: '2016-01-01T00:00:00Z' }), row({ instance_id: '3', period: '2017-01-01T00:00:00Z' })];
    expect(unionD1History(MID, a, l, 2).activities.map(x => x.instance_id)).toEqual(['3', '2']);
  });
});

describe('getPlayerActivitiesMultiTier D1 union (archive + lite parquet)', () => {
  const BUCKET = 115;
  let tmp: string;
  let root: string;
  let litePath: string;
  let db: Database | null = null;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd1union-'));
    root = path.join(tmp, 'd1_b4_hs');
    litePath = path.join(tmp, 'lite.parquet');
    try {
      const { Database: DuckDB } = await import('duckdb-async');
      const seed = await DuckDB.create(':memory:');
      const dir = path.join(root, 'act', `mid_bucket=${BUCKET}`);
      await fs.mkdir(dir, { recursive: true });
      await seed.all(`
        CREATE TEMP TABLE act (
          instance_id BIGINT, period TIMESTAMP, activity_hash UINTEGER, mode SMALLINT,
          membership_id BIGINT, membership_type TINYINT, character_id BIGINT, completed BOOLEAN,
          deaths INTEGER, kills INTEGER, assists INTEGER, duration_seconds INTEGER,
          game VARCHAR, display_name VARCHAR, mid_bucket BIGINT)`);
      await seed.all(`INSERT INTO act VALUES
        (3352885122, '2015-08-30 08:20:39', 111, 2, ${MID}, 2, 7, NULL, 3, 53, 0, 906, 'D1', 'PuddleCubs', ${BUCKET}),
        (3995803449, '2015-10-19 16:58:46', 222, 4, ${MID}, 2, 7, true, 1, 20, 2, 700, 'D1', 'PuddleCubs', ${BUCKET})`);
      await seed.all(`COPY act TO '${path.join(dir, 'instances.parquet').replace(/\\/g, '/')}' (FORMAT PARQUET)`);
      await seed.all(`
        CREATE TEMP TABLE lite (
          instance_id BIGINT, period TIMESTAMP, activity_hash BIGINT, director_activity_hash BIGINT, mode INTEGER,
          membership_id BIGINT, membership_type INTEGER, display_name VARCHAR, character_id BIGINT, completed BOOLEAN,
          deaths INTEGER, kills INTEGER, assists INTEGER, duration_seconds INTEGER, standing INTEGER,
          starting_phase_index INTEGER, fireteam_id VARCHAR, is_private BOOLEAN, dump_id VARCHAR, game VARCHAR)`);
      await seed.all(`INSERT INTO lite VALUES
        (3352885122, '2015-08-30 08:20:39', 111, 0, 2, ${MID}, 2, 'PuddleCubs', 7, true, 3, 53, 0, 906, 0, 0, '', false, '', 'd1'),
        (6904117268, '2021-03-21 01:00:10', 333, 0, 4, ${MID}, 2, 'PuddleCubs', 7, true, 0, 5, 0, 300, 0, 0, '', false, '', 'd1'),
        (9000000001, '2021-04-01 00:00:00', 444, 0, 4, ${MID}, 2, 'PuddleCubs', 7, true, 0, 5, 0, 300, 0, 0, '', false, '', 'd2'),
        (6904117269, '2021-03-22 00:00:00', 555, 0, 4, ${OTHER}, 1, 'splashbear', 9, true, 0, 5, 0, 300, 0, 0, '', false, '', 'd1')`);
      await seed.all(`COPY lite TO '${litePath.replace(/\\/g, '/')}' (FORMAT PARQUET)`);
      await seed.close();
      db = await DuckDB.create(':memory:');
    } catch (error) {
      console.warn('DuckDB not available, skipping D1 union fixtures', error);
    }
  });

  afterAll(async () => {
    if (db) { try { await db.close(); } catch { /* */ } }
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  function svc(): ArchiveService {
    const s = new ArchiveService('', '', litePath, '', '', '', false, '', false, [root]);
    s['db'] = db;
    s['archiveAvailable'] = true;
    s['bucketHashType'] = 'VARCHAR';
    jest.spyOn(s as any, 'calculateBucket').mockResolvedValue(BUCKET);
    return s;
  }

  test('D1 returns archive + lite-only D1 games for this account only', async () => {
    if (!db) return;
    const r = await svc().getPlayerActivitiesMultiTier(MID, { game: 'D1', limit: 1000 });
    expect(r.tier.source).toBe('d1_act');
    expect(r.activities.map(a => a.instance_id).sort()).toEqual(['3352885122', '3995803449', '6904117268']);
    expect(r.activities.every(a => a.game === 'D1' && a.membership_id === MID)).toBe(true);
    // archive completed was NULL; lite supplied true
    expect(r.activities.find(a => a.instance_id === '3352885122')!.completed).toBe(true);
    expect(r.tier.notes!.some(n => n.includes('1 lite-only games'))).toBe(true);
  });

  test('D2 request is unaffected by the D1 union', async () => {
    if (!db) return;
    const r = await svc().getPlayerActivitiesMultiTier(MID, { game: 'D2', limit: 1000 });
    expect(r.activities.every(a => a.game === 'D2')).toBe(true);
    expect(r.activities.map(a => a.instance_id)).not.toContain('3352885122');
  });
});