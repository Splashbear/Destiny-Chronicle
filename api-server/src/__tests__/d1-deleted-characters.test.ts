/**
 * D1 deleted-character exclusion (Bungie current character list, cached, fail open)
 * and the extra D1 social-space hashes.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Database } from 'duckdb-async';
import { ArchiveService } from '../services/archive.service';
import { D1CharacterStatusService, FetchLike } from '../services/d1-character-status.service';
import { excludeNonCurrentD1Characters } from '../utils/d1-history-union';
import { isSocialHubActivity } from '../utils/social-hubs';
import { HUB_CLAUSE } from '../services/played-with.service';

const MID = '4611686018429785995';

function accountBody(ids: string[]) {
  return { ErrorCode: 1, ErrorStatus: 'Success', Response: { data: { characters: ids.map(id => ({ characterBase: { characterId: id } })) } } };
}
function fakeFetch(handler: (url: string) => { status?: number; body: any } | Error) {
  const calls: string[] = [];
  const fn: FetchLike = async (url: string) => {
    calls.push(url);
    const r = handler(url);
    if (r instanceof Error) throw r;
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body };
  };
  return { fn, calls };
}

describe('excludeNonCurrentD1Characters', () => {
  test('drops D1 rows on non-current characters; keeps blank character and D2 rows', () => {
    const rows = [
      { game: 'D1', character_id: '1', instance_id: 'a' },
      { game: 'D1', character_id: '9', instance_id: 'b' },
      { game: 'D1', character_id: '', instance_id: 'c' },
      { game: 'D2', character_id: '9', instance_id: 'd' },
    ];
    const r = excludeNonCurrentD1Characters(rows, new Set(['1']));
    expect(r.kept.map(x => x.instance_id)).toEqual(['a', 'c', 'd']);
    expect(r.excluded).toBe(1);
    expect(r.excludedCharacters).toEqual(['9']);
  });
});

describe('D1CharacterStatusService', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd1chars-')); });
  afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined); });

  test('fetches current characters, caches by game+type+membership, reuses fresh cache', async () => {
    const f = fakeFetch(() => ({ body: accountBody(['11', '12']) }));
    const cachePath = path.join(tmp, 'c.json');
    const svc = new D1CharacterStatusService({ apiKey: 'k', cachePath, fetchFn: f.fn });
    expect([...(await svc.getCurrentCharacterIds(MID, 1))!]).toEqual(['11', '12']);
    expect(f.calls[0]).toContain(`/Destiny/1/Account/${MID}/`);
    const disk = JSON.parse(await fs.readFile(cachePath, 'utf8'));
    expect(disk.entries[`D1|1|${MID}`].characterIds).toEqual(['11', '12']);
    const svc2 = new D1CharacterStatusService({ apiKey: 'k', cachePath, fetchFn: f.fn });
    expect([...(await svc2.getCurrentCharacterIds(MID, 1))!]).toEqual(['11', '12']);
    expect(f.calls).toHaveLength(1);
  });

  test('unknown platform: tries Xbox then PSN', async () => {
    const f = fakeFetch(url => url.includes('/Destiny/1/') ? { body: { ErrorCode: 1601, ErrorStatus: 'DestinyAccountNotFound' } } : { body: accountBody(['21']) });
    const svc = new D1CharacterStatusService({ apiKey: 'k', cachePath: path.join(tmp, 'c.json'), fetchFn: f.fn });
    expect([...(await svc.getCurrentCharacterIds(MID))!]).toEqual(['21']);
    expect(f.calls).toHaveLength(2);
  });

  test('refreshes after TTL; uses stale cache when refresh fails', async () => {
    let now = Date.parse('2026-11-01T00:00:00Z');
    let fail = false;
    const f = fakeFetch(() => (fail ? new Error('network down') : { body: accountBody(['31']) }));
    const svc = new D1CharacterStatusService({ apiKey: 'k', cachePath: path.join(tmp, 'c.json'), fetchFn: f.fn, now: () => now });
    await svc.getCurrentCharacterIds(MID, 1);
    now += 8 * 24 * 3600 * 1000;
    fail = true;
    expect([...(await svc.getCurrentCharacterIds(MID, 1))!]).toEqual(['31']);
    expect(f.calls).toHaveLength(2);
  });

  test('fail open: Bungie unreachable and no cache returns null', async () => {
    const f = fakeFetch(() => new Error('ECONNREFUSED'));
    const svc = new D1CharacterStatusService({ apiKey: 'k', cachePath: path.join(tmp, 'c.json'), fetchFn: f.fn });
    expect(await svc.getCurrentCharacterIds(MID, 1)).toBeNull();
  });

  test('Bungie 5xx with no cache returns null', async () => {
    const f = fakeFetch(() => ({ status: 503, body: { ErrorCode: 5, ErrorStatus: 'SystemDisabled' } }));
    const svc = new D1CharacterStatusService({ apiKey: 'k', cachePath: path.join(tmp, 'c.json'), fetchFn: f.fn });
    expect(await svc.getCurrentCharacterIds(MID, 2)).toBeNull();
  });
});

describe('D1 social spaces', () => {
  test('Tower variant 3743955707 and Vestian Outpost 1390160729 are social in any mode', () => {
    for (const h of [3743955707, 1390160729]) {
      expect(isSocialHubActivity({ mode: 0, activity_hash: h })).toBe(true);
      expect(isSocialHubActivity({ mode: 2, activity_hash: h })).toBe(true);
      expect(HUB_CLAUSE).toContain(String(h));
    }
    expect(isSocialHubActivity({ mode: 0, activity_hash: 4239017990 })).toBe(false); // A Key Awaits (story)
  });
});

describe('getPlayerActivitiesMultiTier D1 deleted-character exclusion', () => {
  const BUCKET = 115;
  let tmp: string;
  let root: string;
  let litePath: string;
  let db: Database | null = null;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd1del-'));
    root = path.join(tmp, 'd1_b3_hs');
    litePath = path.join(tmp, 'lite.parquet');
    try {
      const { Database: DuckDB } = await import('duckdb-async');
      const seed = await DuckDB.create(':memory:');
      const dir = path.join(root, 'act', `mid_bucket=${BUCKET}`);
      await fs.mkdir(dir, { recursive: true });
      await seed.all(`CREATE TEMP TABLE act (instance_id BIGINT, period TIMESTAMP, activity_hash UINTEGER, mode SMALLINT,
        membership_id BIGINT, membership_type TINYINT, character_id BIGINT, completed BOOLEAN, deaths INTEGER, kills INTEGER,
        assists INTEGER, duration_seconds INTEGER, game VARCHAR, display_name VARCHAR, mid_bucket BIGINT)`);
      await seed.all(`INSERT INTO act VALUES
        (2840305190, '2015-06-21 22:11:51', 3399843407, 2, ${MID}, 1, 2305843009313405736, true, 1, 117, 0, 900, 'D1', 'splashbear', ${BUCKET}),
        (2609740413, '2015-05-26 18:29:05', 1390160729, 0, ${MID}, 1, 2305843009217889830, NULL, NULL, NULL, NULL, NULL, 'D1', 'splashbear', ${BUCKET}),
        (2600000001, '2015-05-20 10:00:00', 3743955707, 0, ${MID}, 1, 2305843009217889830, NULL, NULL, NULL, NULL, NULL, 'D1', 'splashbear', ${BUCKET}),
        (2500000001, '2015-05-01 10:00:00', 1111, 4, ${MID}, 1, 2305843009217889830, true, 1, 20, 0, 600, 'D1', 'splashbear', ${BUCKET})`);
      await seed.all(`COPY act TO '${path.join(dir, 'instances.parquet').replace(/\\/g, '/')}' (FORMAT PARQUET)`);
      await seed.all(`CREATE TEMP TABLE lite (instance_id BIGINT, period TIMESTAMP, activity_hash BIGINT, director_activity_hash BIGINT, mode INTEGER,
        membership_id BIGINT, membership_type INTEGER, display_name VARCHAR, character_id BIGINT, completed BOOLEAN, deaths INTEGER, kills INTEGER,
        assists INTEGER, duration_seconds INTEGER, standing INTEGER, starting_phase_index INTEGER, fireteam_id VARCHAR, is_private BOOLEAN, dump_id VARCHAR, game VARCHAR)`);
      await seed.all(`INSERT INTO lite VALUES
        (2500000001, '2015-05-01 10:00:00', 1111, 0, 4, ${MID}, 1, '', 2305843009217889830, true, 1, 20, 0, 600, 0, 0, '', false, '', 'd1'),
        (6000000001, '2016-01-01 10:00:00', 2222, 0, 4, ${MID}, 1, '', 2305843009217889830, true, 1, 20, 0, 600, 0, 0, '', false, '', 'd1')`);
      await seed.all(`COPY lite TO '${litePath.replace(/\\/g, '/')}' (FORMAT PARQUET)`);
      await seed.close();
      db = await DuckDB.create(':memory:');
    } catch (error) {
      console.warn('DuckDB not available, skipping fixtures', error);
    }
  });

  afterAll(async () => {
    if (db) { try { await db.close(); } catch { /* */ } }
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  function svc(status: D1CharacterStatusService | null): ArchiveService {
    const s = new ArchiveService('', '', litePath, '', '', '', false, '', false, [root]);
    s['db'] = db;
    s['archiveAvailable'] = true;
    s['bucketHashType'] = 'VARCHAR';
    jest.spyOn(s as any, 'calculateBucket').mockResolvedValue(BUCKET);
    s.setD1CharacterStatus(status);
    return s;
  }

  test('excludes deleted-character games; union with lite kept', async () => {
    if (!db) return;
    const f = fakeFetch(() => ({ body: accountBody(['2305843009217889830']) }));
    const status = new D1CharacterStatusService({ apiKey: 'k', cachePath: path.join(tmp, 'c1.json'), fetchFn: f.fn });
    const r = await svc(status).getPlayerActivitiesMultiTier(MID, { game: 'D1', limit: 1000 });
    const ids = r.activities.map(a => a.instance_id).sort();
    expect(ids).toEqual(['2500000001', '2600000001', '2609740413', '6000000001']);
    expect(ids).not.toContain('2840305190');
    expect(f.calls[0]).toContain('/Destiny/1/Account/');
    expect(r.tier.notes!.some(n => n.includes('deleted character'))).toBe(true);
  });

  test('fail open: Bungie down and no cache keeps every game', async () => {
    if (!db) return;
    const f = fakeFetch(() => new Error('down'));
    const status = new D1CharacterStatusService({ apiKey: 'k', cachePath: path.join(tmp, 'c2.json'), fetchFn: f.fn });
    const r = await svc(status).getPlayerActivitiesMultiTier(MID, { game: 'D1', limit: 1000 });
    expect(r.activities.map(a => a.instance_id)).toContain('2840305190');
    expect(r.tier.notes!.some(n => n.includes('filter unavailable'))).toBe(true);
  });

  test('D2 requests never call Bungie for characters', async () => {
    if (!db) return;
    const f = fakeFetch(() => ({ body: accountBody([]) }));
    const status = new D1CharacterStatusService({ apiKey: 'k', cachePath: path.join(tmp, 'c3.json'), fetchFn: f.fn });
    await svc(status).getPlayerActivitiesMultiTier(MID, { game: 'D2', limit: 1000 });
    expect(f.calls).toHaveLength(0);
  });
});