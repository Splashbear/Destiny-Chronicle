import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import { pickNext, SummaryStore, summaryKey } from '../services/played-with-summary.store';
import { createPlayedWithRouter } from '../routes/played-with.routes';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pwq-'));

describe('Played With summary queue', () => {
  test('key is sorted, deduped, digits only', () => {
    expect(summaryKey(['3', '1', '3', 'x'])).toBe('1+3');
  });

  test('seeds first, then lookups in arrival order; requests file is consumed', () => {
    const s = new SummaryStore(tmp()); s.ensure();
    s.request(['20']); s.request(['10']);
    fs.writeFileSync(s.seedsPath, JSON.stringify([['Seed', '30+31', '']]));
    const q = s.readQueue(); expect(s.ingest(q, new Date('2026-01-01T00:00:00Z'))).toBe(3); s.writeQueue(q);
    expect(fs.existsSync(s.requestsPath)).toBe(false);
    expect(pickNext(q, 1e12)!.key).toBe('30+31');
    q.items['30+31'].status = 'done'; q.items['30+31'].builtAt = new Date().toISOString();
    expect(pickNext(q, 1e12)!.key).toBe('20');
    s.writeQueue(q);
    expect(s.status('10')).toEqual({ status: 'pending', position: 2 });
  });

  test('stale done items come back for a refresh check when nothing is pending', () => {
    const s = new SummaryStore(tmp());
    const q = { items: { '1': { key: '1', ids: ['1'], priority: 10, source: 'lookup' as const, status: 'done' as const, enqueuedAt: '2026-01-01T00:00:00Z', attempts: 0, builtAt: '2026-01-01T00:00:00Z' } } };
    expect(pickNext(q, 3600_000, Date.parse('2026-01-02T00:00:00Z'))!.key).toBe('1');
    expect(pickNext(q, 7 * 86400_000, Date.parse('2026-01-02T00:00:00Z'))).toBeNull();
    void s;
  });

  test('route serves a summary, or queues and returns 202 pending', async () => {
    const s = new SummaryStore(tmp()); s.ensure();
    s.writeSummary({ key: '5', ids: ['5'], builtAt: 'x', games: 2, maxInstanceId: '9', partners: [{ membershipId: '6' }, { membershipId: '7' }], coverage: {} });
    const app = express(); app.use(express.json()); app.use('/played-with', createPlayedWithRouter({} as any, {} as any, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    const call = (ids: string[]) => fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipIds: ids, limit: 1 }) });
    try {
      const hit = await call(['5']); expect(hit.status).toBe(200);
      const hj: any = await hit.json(); expect(hj.source).toBe('summary'); expect(hj.partners).toHaveLength(1);
      const miss = await call(['8']); expect(miss.status).toBe(202);
      expect(((await miss.json()) as any).pending).toBe(true);
      expect(fs.readFileSync(s.requestsPath, 'utf8')).toContain('"8"');
    } finally { srv.close(); }
  });
});