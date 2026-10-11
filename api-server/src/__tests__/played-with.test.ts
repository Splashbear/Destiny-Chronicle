import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from 'duckdb-async';
import express from 'express';
import { AddressInfo } from 'net';
import { createPlayedWithRouter } from '../routes/played-with.routes';
import { loadPlayedWithConfig, planBands, PlayedWithService, sourceStemForBand } from '../services/played-with.service';

describe('Played With band planning', () => {
  const cfg = { legacyRoot: 'L', compactRoot: 'C', splitIid: 10_000_000_000, compactMaxIid: 16_000_000_000 };

  test('source stem for a band', () => {
    expect(sourceStemForBand(10003)).toBe('10000000000-10010000000');
    expect(sourceStemForBand(15999)).toBe('15990000000-16000000000');
  });

  test('routes legacy vs compact and reports unfinished / above-index bands', () => {
    const done = new Set(['10000000000-10010000000']);
    const p = planBands(['5000000001', '10000500000', '10020000001', '17000000000', '5000000001'], cfg, done);
    expect([...p.legacy.keys()]).toEqual([5000]);
    expect([...p.compact.keys()]).toEqual([10000]);
    expect(p.uncovered.sort()).toEqual(['10020000001', '17000000000']);
    expect(p.uncoveredReasons).toEqual({ band_not_built: 1, above_index: 1 });
  });

  test('env config: both roots, defaults, no real paths needed', () => {
    const c = loadPlayedWithConfig({ PLAYED_WITH_LEGACY_ROOT: '/a/by_iid_1m', PLAYED_WITH_COMPACT_ROOT: '/b/x/by_iid_1m' } as NodeJS.ProcessEnv)!;
    expect(c.splitIid).toBe(10_000_000_000);
    expect(c.threads).toBe(2);
    expect(c.compactDoneDir.replace(/\\/g, '/')).toBe('/b/x/_w38_state/done');
    expect(loadPlayedWithConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe('Played With dual-format read', () => {
  let tmp: string;
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-'));
    const L = path.join(tmp, 'legacy', 'by_iid_1m', 'iid_band=5000');
    const C = path.join(tmp, 'compact', 'by_iid_1m', 'iid_band=10000');
    const C2 = path.join(tmp, 'compact', 'by_iid_1m', 'iid_band=10020');
    const D = path.join(tmp, 'compact', '_w38_state', 'done');
    for (const d of [L, C, C2, D]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(D, '10000000000-10010000000.json'), '{}');
    const db = await Database.create(':memory:');
    const q = (p: string) => p.replace(/\\/g, '/');
    // legacy: string ids + names + team
    await db.all(`COPY (SELECT * FROM (VALUES
      (5000000001::BIGINT, '1'::VARCHAR, 'Me', '2020-01-01T00:00:00Z', 1::TINYINT),
      (5000000001, '2', 'Friend', '2020-01-01T00:00:00Z', 1),
      (5000000002, '1', 'Me', '2020-02-01T00:00:00Z', 1),
      (5000000002, '2', 'FriendNew', '2020-02-01T00:00:00Z', 1),
      (5000000002, '3', 'Other', '2020-02-01T00:00:00Z', 2)
    ) t(instance_id, membership_id, display_name, period, team)) TO '${q(path.join(L, 'instances.parquet'))}' (FORMAT parquet)`);
    // compact: numeric ids, timestamp period, no names
    await db.all(`COPY (SELECT * FROM (VALUES
      (10000500000::BIGINT, 1::BIGINT, TIMESTAMP '2021-01-01 00:00:00'),
      (10000500000, 2, TIMESTAMP '2021-01-01 00:00:00'),
      (10000500000, 4, TIMESTAMP '2021-01-01 00:00:00')
    ) t(instance_id, membership_id, period)) TO '${q(path.join(C, 'instances.parquet'))}' (FORMAT parquet)`);
    // band without a done marker: must NOT be read
    await db.all(`COPY (SELECT 10020000001::BIGINT AS instance_id, 9::BIGINT AS membership_id, TIMESTAMP '2021-06-01' AS period)
      TO '${q(path.join(C2, 'instances.parquet'))}' (FORMAT parquet)`);
    await db.close();
  });
  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows may still hold parquet handles */ }
  });

  test('normalizes both formats, excludes self, skips unfinished bands, fills names', async () => {
    const svc = new PlayedWithService(
      {
        legacyRoot: path.join(tmp, 'legacy', 'by_iid_1m'),
        compactRoot: path.join(tmp, 'compact', 'by_iid_1m'),
        compactDoneDir: path.join(tmp, 'compact', '_w38_state', 'done'),
        splitIid: 10_000_000_000, compactMaxIid: 16_000_000_000, threads: 1, memoryLimit: '512MB',
      },
      async (_iid, mid) => (mid === '4' ? 'NameFromPgcr' : null)
    );
    const r = await svc.getPartners(['1'], [
      { instanceId: '5000000001', durationSeconds: 100 },
      { instanceId: '5000000002', durationSeconds: 200 },
      { instanceId: '10000500000', durationSeconds: 300 },
      { instanceId: '10020000001', durationSeconds: 400 },
    ]);
    await svc.close();
    const byId = Object.fromEntries(r.partners.map((p) => [p.membershipId, p]));
    expect(byId['2']).toMatchObject({ activitiesTogether: 3, timeTogetherSeconds: 600, displayName: 'FriendNew' });
    expect(byId['3']).toMatchObject({ activitiesTogether: 1, displayName: 'Other' });
    expect(byId['4']).toMatchObject({ activitiesTogether: 1, displayName: 'NameFromPgcr' });
    expect(byId['1']).toBeUndefined();
    expect(byId['9']).toBeUndefined();
    expect(r.partners[0].membershipId).toBe('2');
    expect(r.coverage).toMatchObject({ complete: false, totalInstances: 4, coveredInstances: 3, uncoveredInstances: 1 });
    expect(r.coverage.uncoveredReasons).toEqual({ band_not_built: 1 });
  });
});

describe('Played With route (background job + polling)', () => {
  test('slow lookup returns 202 pending, then cached result', async () => {
    process.env.PLAYED_WITH_WAIT_MS = '50';
    jest.resetModules();
    const { createPlayedWithRouter: mk } = require('../routes/played-with.routes');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const archive = { getPlayerActivitiesMultiTier: async () => ({ activities: [{ instance_id: '5000000001', duration_seconds: 10 }], tier: {} }) };
    const pw = { getPartners: async () => { await gate; return { partners: [{ membershipId: '2', displayName: 'F', activitiesTogether: 1, timeTogetherSeconds: 10 }], coverage: { complete: true } }; } };
    const app = express(); app.use(express.json()); app.use('/played-with', mk(archive, pw));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    const call = () => fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipIds: ['1'] }) });
    const r1 = await call();
    expect(r1.status).toBe(202);
    expect(((await r1.json()) as any).pending).toBe(true);
    release();
    await new Promise((r) => setTimeout(r, 20));
    const r2 = await call();
    expect(r2.status).toBe(200);
    const j = (await r2.json()) as any;
    expect(j.pending).toBe(false);
    expect(j.partners[0].membershipId).toBe('2');
    srv.close();
    delete process.env.PLAYED_WITH_WAIT_MS;
  });
  test('rejects bad input', async () => {
    const app = express(); app.use(express.json()); app.use('/played-with', createPlayedWithRouter({} as any, {} as any));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"membershipIds":["x"]}' });
    expect(r.status).toBe(400);
    srv.close();
  });
});
