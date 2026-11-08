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

  test('seeds first (split into one item per account), then lookups in arrival order; requests file is consumed', () => {
    const s = new SummaryStore(tmp()); s.ensure();
    s.request(['20']); s.request(['10']);
    fs.writeFileSync(s.seedsPath, JSON.stringify([['Seed', '30+31', '']]));
    const q = s.readQueue(); expect(s.ingest(q, new Date('2026-01-01T00:00:00Z'))).toBe(4); s.writeQueue(q);
    expect(fs.existsSync(s.requestsPath)).toBe(false);
    expect(pickNext(q, 1e12)!.key).toBe('30');
    for (const k of ['30', '31']) { q.items[k].status = 'done'; q.items[k].builtAt = new Date().toISOString(); }
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
    // Legacy last-only summary (no firstPlayedTogether) is last-resort; with first dates it is preferred.
    s.writeSummary({
      key: '5', ids: ['5'], builtAt: 'x', games: 2, maxInstanceId: '9',
      partners: [
        { membershipId: '6', firstPlayedTogether: '2020-01-01T00:00:00Z', lastPlayedTogether: '2026-01-01T00:00:00Z' },
        { membershipId: '7', firstPlayedTogether: '2021-01-01T00:00:00Z', lastPlayedTogether: '2025-01-01T00:00:00Z' },
      ],
      coverage: {},
    });
    const app = express(); app.use(express.json()); app.use('/played-with', createPlayedWithRouter({} as any, {} as any, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    const call = (ids: string[]) => fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipIds: ids, limit: 1 }) });
    try {
      const hit = await call(['5']); expect(hit.status).toBe(200);
      const hj: any = await hit.json(); expect(hj.source).toBe('summary'); expect(hj.partners).toHaveLength(1);
      expect(hj.partners[0].firstPlayedTogether).toBe('2020-01-01T00:00:00Z');
      const miss = await call(['8']); expect(miss.status).toBe(202);
      expect(((await miss.json()) as any).pending).toBe(true);
      expect(fs.readFileSync(s.requestsPath, 'utf8')).toContain('"8"');
    } finally { srv.close(); }
  });

  test('done-without-v2-acct requeues refresh and prefers index First Played over last-only legacy', async () => {
    process.env.PLAYED_WITH_WAIT_MS = '50';
    jest.resetModules();
    const { createPlayedWithRouter: mk } = require('../routes/played-with.routes');
    const { SummaryStore: Store } = require('../services/played-with-summary.store');
    const s = new Store(tmp()); s.ensure();
    s.writeQueue({
      items: {
        '5': { key: '5', ids: ['5'], priority: 0, source: 'seed', status: 'done', enqueuedAt: 'x', attempts: 0, builtAt: '2026-10-12T00:00:00Z', checkedAt: '2026-10-12T00:00:00Z' },
      },
    });
    // Pre-PR#50 legacy: Last Played only — UI would show "—" for First Played.
    s.writeSummary({
      key: '5', ids: ['5'], builtAt: '2026-10-12T00:00:00Z', games: 2, maxInstanceId: '9',
      partners: [{ membershipId: '6', displayName: 'Buddy', activitiesTogether: 3, timeTogetherSeconds: 100, lastPlayedTogether: '2026-09-01T00:00:00Z' }],
      coverage: {},
    });
    const archive = { getPlayerActivitiesMultiTier: async () => ({ activities: [{ instance_id: '1', duration_seconds: 10, period: '2020-01-01T00:00:00Z' }], tier: {} }) };
    const pw = {
      getPartners: async () => ({
        partners: [{ membershipId: '6', displayName: 'Buddy', activitiesTogether: 3, timeTogetherSeconds: 100, firstPlayedTogether: '2018-06-01T00:00:00Z', lastPlayedTogether: '2026-09-01T00:00:00Z' }],
        coverage: { complete: true, coveredInstances: 1 },
      }),
    };
    const app = express(); app.use(express.json()); app.use('/played-with', mk(archive, pw, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipIds: ['5'] }) });
      expect(r.status).toBe(200);
      const j: any = await r.json();
      expect(j.source).toBe('index');
      expect(j.partners[0]).toMatchObject({ membershipId: '6', firstPlayedTogether: '2018-06-01T00:00:00Z', lastPlayedTogether: '2026-09-01T00:00:00Z' });
      expect(fs.readFileSync(s.requestsPath, 'utf8')).toMatch(/"source":"refresh"/);
      expect(fs.readFileSync(s.requestsPath, 'utf8')).toContain('"5"');
    } finally { srv.close(); delete process.env.PLAYED_WITH_WAIT_MS; }
  });

  test('firstfill sortBy before LIMIT: two accounts, limit=1, account leader ≠ aggregate leader', async () => {
    process.env.PLAYED_WITH_WAIT_MS = '50';
    jest.resetModules();
    const { createPlayedWithRouter: mk } = require('../routes/played-with.routes');
    const { SummaryStore: Store } = require('../services/played-with-summary.store');
    const s = new Store(tmp()); s.ensure();
    const doneItem = (id: string) => ({ key: id, ids: [id], priority: 0, source: 'seed' as const, status: 'done' as const, enqueuedAt: 'x', attempts: 0, builtAt: '2026-10-12T00:00:00Z', checkedAt: '2026-10-12T00:00:00Z' });
    s.writeQueue({ items: { '11': doneItem('11'), '12': doneItem('12') } });
    const archive = {
      getPlayerActivitiesMultiTier: async (mid: string) => ({
        activities: mid === '11'
          ? [
              { instance_id: '1', duration_seconds: 60, period: '2020-01-01T00:00:00Z' },
              { instance_id: '2', duration_seconds: 60, period: '2020-01-02T00:00:00Z' },
              { instance_id: '3', duration_seconds: 60, period: '2020-01-03T00:00:00Z' },
            ]
          : [
              { instance_id: '4', duration_seconds: 60, period: '2020-02-01T00:00:00Z' },
              { instance_id: '5', duration_seconds: 60, period: '2020-02-02T00:00:00Z' },
            ],
        tier: {},
      }),
    };
    const calls: Array<{ sortBy?: string; limit: number; sources: string[] }> = [];
    const pw = {
      getPartners: async (_excl: string[], instances: Array<{ sourceMembershipId?: string }>, limit: number, _p?: unknown, _g?: unknown, sortBy?: string) => {
        calls.push({ sortBy, limit, sources: [...new Set(instances.map((i) => i.sourceMembershipId || ''))].sort() });
        // AggregateLead (100) wins total (3 from 11 + 0 from 12 would be wrong — give 100 three and 200 two overall,
        // but on account 12 only 200 appears). Simulate mergeAccounts order before LIMIT.
        const byTotal = [
          { membershipId: '100', displayName: 'AggregateLead', activitiesTogether: 3, timeTogetherSeconds: 180, firstPlayedTogether: '2020-01-01T00:00:00Z', lastPlayedTogether: '2020-01-03T00:00:00Z' },
          { membershipId: '200', displayName: 'AccountLead', activitiesTogether: 2, timeTogetherSeconds: 120, firstPlayedTogether: '2020-02-01T00:00:00Z', lastPlayedTogether: '2020-02-02T00:00:00Z' },
        ];
        const by12 = [
          { membershipId: '200', displayName: 'AccountLead', activitiesTogether: 2, timeTogetherSeconds: 120, firstPlayedTogether: '2020-02-01T00:00:00Z', lastPlayedTogether: '2020-02-02T00:00:00Z' },
          { membershipId: '100', displayName: 'AggregateLead', activitiesTogether: 3, timeTogetherSeconds: 180, firstPlayedTogether: '2020-01-01T00:00:00Z', lastPlayedTogether: '2020-01-03T00:00:00Z' },
        ];
        const ordered = sortBy === '12' ? by12 : byTotal;
        return { partners: ordered.slice(0, limit), coverage: { complete: true, coveredInstances: instances.length } };
      },
    };
    const app = express(); app.use(express.json()); app.use('/played-with', mk(archive, pw, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    const post = (body: object) => fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const total = await post({ membershipIds: ['11', '12'], include: ['11', '12'], sortBy: 'total', limit: 1 });
      const by12 = await post({ membershipIds: ['11', '12'], include: ['11', '12'], sortBy: '12', limit: 1 });
      expect(total.status).toBe(200);
      expect(by12.status).toBe(200);
      const jt: any = await total.json();
      const j12: any = await by12.json();
      expect(jt.source).toBe('index');
      expect(jt.partners).toHaveLength(1);
      expect(jt.partners[0].membershipId).toBe('100');
      expect(j12.partners).toHaveLength(1);
      expect(j12.partners[0].membershipId).toBe('200');
      expect(j12.sortBy).toBe('12');
      expect(calls.some((c) => c.sortBy === '12' && c.limit === 1 && c.sources.join(',') === '11,12')).toBe(true);
    } finally { srv.close(); delete process.env.PLAYED_WITH_WAIT_MS; }
  });

  test('excluded-account + cache-isolation: firstfill scans include only and keys cache by include set', async () => {
    process.env.PLAYED_WITH_WAIT_MS = '50';
    jest.resetModules();
    const { createPlayedWithRouter: mk } = require('../routes/played-with.routes');
    const { SummaryStore: Store } = require('../services/played-with-summary.store');
    const s = new Store(tmp()); s.ensure();
    s.writeQueue({
      items: {
        '5': { key: '5', ids: ['5'], priority: 0, source: 'seed', status: 'done', enqueuedAt: 'x', attempts: 0, builtAt: '2026-10-12T00:00:00Z', checkedAt: '2026-10-12T00:00:00Z' },
        '7': { key: '7', ids: ['7'], priority: 0, source: 'seed', status: 'done', enqueuedAt: 'x', attempts: 0, builtAt: '2026-10-12T00:00:00Z', checkedAt: '2026-10-12T00:00:00Z' },
      },
    });
    const scanned: string[] = [];
    const partnerCalls: Array<{ excludeIds: string[]; instanceCount: number }> = [];
    const archive = {
      getPlayerActivitiesMultiTier: async (mid: string) => {
        scanned.push(mid);
        return {
          activities: mid === '5'
            ? [{ instance_id: '10', duration_seconds: 10, period: '2020-01-01T00:00:00Z' }]
            : [{ instance_id: '99', duration_seconds: 999, period: '2019-01-01T00:00:00Z' }],
          tier: {},
        };
      },
    };
    const pw = {
      getPartners: async (excludeIds: string[], instances: Array<{ instanceId: string }>) => {
        partnerCalls.push({ excludeIds: [...excludeIds], instanceCount: instances.length });
        const onlyIncludedGame = instances.every((i) => i.instanceId === '10');
        return {
          partners: onlyIncludedGame
            ? [{ membershipId: '6', displayName: 'Buddy', activitiesTogether: 1, timeTogetherSeconds: 10, firstPlayedTogether: '2020-01-01T00:00:00Z', lastPlayedTogether: '2020-01-01T00:00:00Z' }]
            : [{ membershipId: '8', displayName: 'FromExcluded', activitiesTogether: 1, timeTogetherSeconds: 999, firstPlayedTogether: '2019-01-01T00:00:00Z', lastPlayedTogether: '2019-01-01T00:00:00Z' }],
          coverage: { complete: true, coveredInstances: instances.length },
        };
      },
    };
    const app = express(); app.use(express.json()); app.use('/played-with', mk(archive, pw, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    const post = (body: object) => fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const r1 = await post({ membershipIds: ['5', '7'], include: ['5'] });
      expect(r1.status).toBe(200);
      const j1: any = await r1.json();
      expect(j1.source).toBe('index');
      expect(j1.partners[0].membershipId).toBe('6');
      expect(scanned).toEqual(['5']);
      expect(partnerCalls[0]).toEqual({ excludeIds: ['5', '7'], instanceCount: 1 });
      const req = fs.readFileSync(s.requestsPath, 'utf8');
      expect(req).toContain('"5"');
      expect(req).not.toMatch(/"ids":\["7"\]/);

      // Different include set must not reuse the firstfill cache (would return Buddy again).
      scanned.length = 0;
      const r2 = await post({ membershipIds: ['5', '7'], include: ['7'] });
      expect(r2.status).toBe(200);
      const j2: any = await r2.json();
      expect(j2.partners[0].membershipId).toBe('8');
      expect(scanned).toEqual(['7']);
      expect(partnerCalls).toHaveLength(2);
    } finally { srv.close(); delete process.env.PLAYED_WITH_WAIT_MS; }
  });

  test('202 for a running build reports the worker\'s real progress counts', async () => {
    const s = new SummaryStore(tmp()); s.ensure();
    const progress = { stage: 'scanning' as const, accountsLoaded: 4, accountsTotal: 4, games: 27215, batchesDone: 12, batchesTotal: 40, updatedAt: '2026-10-13T12:17:00Z' };
    s.writeQueue({ items: { '1': { key: '1', ids: ['1'], priority: 10, source: 'lookup', status: 'running', enqueuedAt: 'x', attempts: 1, progress } } });
    const app = express(); app.use(express.json()); app.use('/played-with', createPlayedWithRouter({} as any, {} as any, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipIds: ['2', '1'] }) });
      expect(r.status).toBe(202);
      const j: any = await r.json();
      expect(j.status).toBe('running'); expect(j.progress).toEqual(progress);
    } finally { srv.close(); }
  });
});
