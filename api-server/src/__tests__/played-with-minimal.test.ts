import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from 'duckdb-async';
import { loadPlayedWithConfig, planBands, PlayedWithService, PRIVATE_GUARDIAN } from '../services/played-with.service';

const q = (p: string) => p.replace(/\\/g, '/');

describe('Played With minimal index + name table', () => {
  let tmp: string; let M: string; let O: string; let names: string;
  const inst = [
    { instanceId: '5000000001', durationSeconds: 100 },
    { instanceId: '5000000002', durationSeconds: 200 },
    { instanceId: '5000000003', durationSeconds: 50 },
    { instanceId: '10000500000', durationSeconds: 300 },
  ];
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwmin-'));
    O = path.join(tmp, 'orig', 'by_iid_1m'); M = path.join(tmp, 'min');
    const dirs = [path.join(O, 'iid_band=5000'), path.join(M, 'legacy', 'by_iid_1m', 'iid_band=5000'), path.join(M, 'compact', 'by_iid_1m', 'iid_band=10000'),
      path.join(M, 'markers', 'legacy'), path.join(M, 'markers', 'compact')];
    for (const d of dirs) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(M, 'markers', 'legacy', '5000.json'), '{}');
    fs.writeFileSync(path.join(M, 'markers', 'compact', '10000.json'), '{}');
    const db = await Database.create(':memory:');
    await db.all(`CREATE TABLE src AS SELECT * FROM (VALUES
      (5000000001::BIGINT, '1'::VARCHAR, 'Me', '2020-01-01T00:00:00Z', 4::SMALLINT, 1::UINTEGER),
      (5000000001, '2', 'Friend', '2020-01-01T00:00:00Z', 4, 1),
      (5000000002, '1', 'Me', '2020-02-01T00:00:00Z', 0, 2),
      (5000000002, '2', 'FriendNew', '2020-02-01T00:00:00Z', 0, 2),
      (5000000002, '3', '', '2020-02-01T00:00:00Z', 0, 2),
      (5000000003, '1', 'Me', '2020-03-01T00:00:00Z', 40, 3),
      (5000000003, '8', 'TowerPal', '2020-03-01T00:00:00Z', 40, 3)
    ) t(instance_id, membership_id, display_name, period, mode, activity_hash)`);
    await db.all(`COPY src TO '${q(path.join(O, 'iid_band=5000', 'instances.parquet'))}' (FORMAT parquet)`);
    await db.all(`COPY (SELECT instance_id, CAST(membership_id AS BIGINT) AS membership_id, CAST(replace(replace(period,'T',' '),'Z','') AS TIMESTAMP) AS period, activity_hash, mode FROM src)
      TO '${q(path.join(M, 'legacy', 'by_iid_1m', 'iid_band=5000', 'instances.parquet'))}' (FORMAT parquet)`);
    await db.all(`COPY (SELECT * FROM (VALUES (10000500000::BIGINT, 1::BIGINT, TIMESTAMP '2021-01-01', 9::UINTEGER, 5::SMALLINT),
      (10000500000, 2, TIMESTAMP '2021-01-01', 9, 5), (10000500000, 4, TIMESTAMP '2021-01-01', 9, 5)) t(instance_id, membership_id, period, activity_hash, mode))
      TO '${q(path.join(M, 'compact', 'by_iid_1m', 'iid_band=10000', 'instances.parquet'))}' (FORMAT parquet)`);
    names = path.join(M, 'names.parquet');
    await db.all(`COPY (SELECT CAST(membership_id AS BIGINT) AS mid, display_name AS name, min(CAST(replace(replace(period,'T',' '),'Z','') AS TIMESTAMP)) AS first_seen,
      max(CAST(replace(replace(period,'T',' '),'Z','') AS TIMESTAMP)) AS last_seen FROM src WHERE display_name <> '' GROUP BY ALL) TO '${q(names)}' (FORMAT parquet)`);
    await db.close();
  });
  afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows handles */ } });

  test('planBands sends bands with a minimal marker to the minimal index (both ranges)', () => {
    const p = planBands(['5000000001', '10000500000', '6000000000'], { legacyRoot: '', compactRoot: '', splitIid: 1e10, compactMaxIid: 1.6e10 }, new Set(), new Set([5000, 10000]));
    expect([...p.minimal.keys()].sort((a, b) => a - b)).toEqual([5000, 10000]);
    expect(p.uncoveredReasons).toEqual({ no_legacy_root: 1 });
  });

  test('env: PLAYED_WITH_MIN_ROOT alone enables the reader', () => {
    const c = loadPlayedWithConfig({ PLAYED_WITH_MIN_ROOT: '/x/pw_min', PLAYED_WITH_NAME_TABLE: '/x/names/*.parquet' } as NodeJS.ProcessEnv)!;
    expect(c.minRoot).toBe('/x/pw_min'); expect(c.nameTable).toBe('/x/names/*.parquet');
  });

  test('minimal + name table gives the same partners as the original index; names for all; Private Guardian fallback', async () => {
    const base = { compactDoneDir: '', splitIid: 1e10, compactMaxIid: 1.6e10, threads: 1, memoryLimit: '512MB', tempDir: path.join(tmp, 't') };
    const A = new PlayedWithService({ ...base, legacyRoot: O, compactRoot: '' });
    const B = new PlayedWithService({ ...base, legacyRoot: '', compactRoot: '', minRoot: M, nameTable: names }, async () => null);
    const legacyOnly = inst.slice(0, 3);
    const ra = await A.getPartners(['1'], legacyOnly); await A.close();
    const rb = await B.getPartners(['1'], legacyOnly);
    const strip = (r: typeof ra) => r.partners.map(({ displayName, nameSource, ...x }) => x);
    expect(strip(rb)).toEqual(strip(ra));
    const nb = Object.fromEntries(rb.partners.map((p) => [p.membershipId, p]));
    expect(nb['2']).toMatchObject({ displayName: 'FriendNew', nameSource: 'name_table' }); // name at the last shared game
    expect(nb['3']).toMatchObject({ displayName: PRIVATE_GUARDIAN, nameSource: 'private' });
    expect(nb['8']).toBeUndefined(); // social hub still excluded
    const all = await B.getPartners(['1'], inst); await B.close();
    const na = Object.fromEntries(all.partners.map((p) => [p.membershipId, p]));
    expect(na['2']).toMatchObject({ activitiesTogether: 3, timeTogetherSeconds: 600 });
    expect(na['4']).toMatchObject({ displayName: PRIVATE_GUARDIAN }); // 10-16B only, not in table
    expect(all.coverage).toMatchObject({ complete: true, minimalBands: 2 });
  });
});