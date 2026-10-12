import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PartnerNameRefresher } from '../services/partner-name-refresh.service';

const mk = () => [
  { membershipId: '1', displayName: 'OldA', nameSource: 'name_table' },
  { membershipId: '2', displayName: 'Private Guardian', nameSource: 'private' },
  { membershipId: '3', displayName: 'OldC', nameSource: 'index' },
  { membershipId: '4', displayName: 'OldD', nameSource: 'name_table' },
];

describe('PartnerNameRefresher', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwnames-')); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

  test('refreshes only the top N, leaves Private Guardian and the rest alone', async () => {
    const calls: string[] = [];
    const r = new PartnerNameRefresher(async (m) => { calls.push(m); return 'New' + m; }, { cacheFile: path.join(dir, 'c.json'), top: 3 });
    const p = mk(); const st = await r.refresh(p);
    expect(p.map((x) => x.displayName)).toEqual(['New1', 'Private Guardian', 'New3', 'OldD']);
    expect(p[0].nameSource).toBe('bungie'); expect(p[1].nameSource).toBe('private');
    expect(calls.sort()).toEqual(['1', '3']);
    expect(st).toMatchObject({ considered: 2, fetched: 2, cached: 0, failed: 0 });
  });

  test('disk cache: a second load (even a new process) makes no Bungie calls; expires after the TTL', async () => {
    let now = 1_000_000; const f = path.join(dir, 'c.json'); let n = 0;
    const fetcher = async (m: string) => { n++; return 'New' + m; };
    const a = new PartnerNameRefresher(fetcher, { cacheFile: f, top: 4, ttlMs: 1000 }, () => now);
    await a.refresh(mk()); a.saveNow(); expect(n).toBe(3);
    const saved = JSON.parse(fs.readFileSync(f, 'utf8'));
    expect(Object.keys(saved).sort()).toEqual(['1', '3', '4']);
    expect(Object.keys(saved['1']).sort()).toEqual(['at', 'n']); // ids and names only
    const b = new PartnerNameRefresher(fetcher, { cacheFile: f, top: 4, ttlMs: 1000 }, () => now);
    const p = mk(); const st = await b.refresh(p);
    expect(n).toBe(3); expect(st.cached).toBe(3); expect(p[2].displayName).toBe('New3');
    now += 1001; await b.refresh(mk()); expect(n).toBe(6);
  });

  test('Bungie failure keeps the index name', async () => {
    const r = new PartnerNameRefresher(async () => { throw new Error('throttled'); }, { cacheFile: path.join(dir, 'c.json'), top: 4 });
    const p = mk(); const st = await r.refresh(p);
    expect(p.map((x) => x.displayName)).toEqual(['OldA', 'Private Guardian', 'OldC', 'OldD']);
    expect(st.failed).toBe(3);
  });

  test('null from Bungie keeps the index name', async () => {
    const r = new PartnerNameRefresher(async () => null, { cacheFile: path.join(dir, 'c.json'), top: 4 });
    const p = mk(); await r.refresh(p);
    expect(p[0]).toMatchObject({ displayName: 'OldA', nameSource: 'name_table' });
  });

  test('per-minute cap: calls over the cap are skipped and keep the index name', async () => {
    let n = 0;
    const r = new PartnerNameRefresher(async (m) => { n++; return 'New' + m; }, { cacheFile: path.join(dir, 'c.json'), top: 4, maxCallsPerMinute: 2, concurrency: 1 });
    const p = mk(); const st = await r.refresh(p);
    expect(n).toBe(2); expect(st.skippedRate).toBe(1); expect(p[3].displayName).toBe('OldD');
  });

  test('time budget: slow Bungie returns on time with index names; the late answer still fills the cache', async () => {
    const f = path.join(dir, 'c.json');
    const r = new PartnerNameRefresher((m) => new Promise((res) => setTimeout(() => res('Late' + m), 150)), { cacheFile: f, top: 1, budgetMs: 30 });
    const p = mk(); const t = Date.now(); await r.refresh(p);
    expect(Date.now() - t).toBeLessThan(140); expect(p[0].displayName).toBe('OldA');
    await new Promise((res) => setTimeout(res, 200));
    const q = mk(); const st = await r.refresh(q);
    expect(st.cached).toBe(1); expect(q[0].displayName).toBe('Late1');
  });

  test('top 0 disables refresh', async () => {
    let n = 0;
    const r = new PartnerNameRefresher(async () => { n++; return 'x'; }, { cacheFile: path.join(dir, 'c.json'), top: 0 });
    await r.refresh(mk()); expect(n).toBe(0);
  });
});
