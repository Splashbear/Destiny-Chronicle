import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import { AccountSummaryBuilder, mergeAccounts, readAccountSummary, writeAccountSummary } from '../services/played-with-account';
import { rosterAllowed, slimFromBungie, historyAbove, BungieLite, SlimPgcr } from '../services/post-archive';
import { pickNext, SummaryStore } from '../services/played-with-summary.store';
import { createPlayedWithRouter } from '../routes/played-with.routes';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-'));
const meta = { builtAt: 't', checkedAt: new Date().toISOString(), archiveMaxIid: '0', bungieTopIid: '0', archiveGames: 0, bungieGames: 0, d1Games: 0, bungieMissing: [], coverage: { complete: true, bungie: 'ok' } };

function acct(id: string, games: Array<[string, number, string, string[]]>, names: Record<string, string> = {}) {
  const b = new AccountSummaryBuilder(id);
  for (const [iid, d, p, mids] of games) { b.addGame(iid, d, p); for (const m of mids) b.addRow(iid, m, names[m] || null, p); }
  return b.freeze(meta);
}

describe('per-account Played With merge', () => {
  // A and B are the same person's two accounts; game 2 had both of them with partner X.
  const A = acct('A', [['1', 100, '2026-01-01T00:00:00Z', ['A', 'X']], ['2', 200, '2026-02-01T00:00:00Z', ['A', 'B', 'X', 'Y']]], { X: 'Xan#0001' });
  const B = acct('B', [['2', 180, '2026-02-01T00:00:00Z', ['B', 'A', 'X', 'Y']], ['3', 50, '2026-10-11T20:00:00Z', ['B', 'X']]]);

  test('shared own game counts once; own accounts never appear as partners', () => {
    const m = mergeAccounts([A, B], ['A', 'B']);
    const x = m.partners.find((p) => p.membershipId === 'X')!;
    expect(m.games).toBe(3);
    expect(x.activitiesTogether).toBe(3);
    expect(x.timeTogetherSeconds).toBe(100 + 200 + 50); // longest own duration for the shared game
    expect(x.lastPlayedTogether).toBe('2026-10-11T20:00:00Z');
    expect(x.displayName).toBe('Xan#0001');
    expect(m.partners.map((p) => p.membershipId)).not.toContain('A');
    expect(m.partners.map((p) => p.membershipId)).not.toContain('B');
    expect(x.perAccount).toEqual([
      { id: 'A', activitiesTogether: 2, timeTogetherSeconds: 300, lastPlayedTogether: '2026-02-01T00:00:00Z' },
      { id: 'B', activitiesTogether: 2, timeTogetherSeconds: 250, lastPlayedTogether: '2026-10-11T20:00:00Z' },
    ]);
  });

  test('subset merge needs no rebuild, and an unselected own account is still excluded', () => {
    const m = mergeAccounts([A], ['A', 'B']);
    expect(m.partners.map((p) => p.membershipId).sort()).toEqual(['X', 'Y']);
    expect(m.partners.find((p) => p.membershipId === 'X')!.activitiesTogether).toBe(2);
  });

  test('sort by one account', () => {
    const C = acct('C', [['9', 10, '2026-03-01T00:00:00Z', ['C', 'Z']], ['8', 10, '2026-03-02T00:00:00Z', ['C', 'Z']]]);
    expect(mergeAccounts([A, C], ['A', 'C'])[ 'partners'][0].membershipId).toBe('X');
    expect(mergeAccounts([A, C], ['A', 'C'], 500, 'C').partners[0].membershipId).toBe('Z');
  });

  test('gzip file round trip and incremental builder keeps old games', () => {
    const dir = tmp(); writeAccountSummary(dir, A);
    const r = readAccountSummary(dir, 'A')!;
    expect(r.games).toBe(2);
    const b = AccountSummaryBuilder.fromSummary(r);
    b.addGame('5', 30, '2026-10-12T00:00:00Z'); b.addRow('5', 'X', 'Xan#0001', null);
    const n = b.freeze(meta);
    expect(mergeAccounts([n], ['A']).partners.find((p) => p.membershipId === 'X')!.activitiesTogether).toBe(3);
  });
});

describe('post-archive Bungie rosters', () => {
  const g = (m: number, rows: number, p = '2026-10-11T00:00:00Z', h = 1): SlimPgcr => ({ i: '1', p, m, h, r: Array.from({ length: rows }, (_, i) => [String(i), ''] as [string, string]) });
  test('raid / dungeon roster caps incl. glitch window, bots, social hubs', () => {
    const bots = new Set(['bot']);
    expect(rosterAllowed(g(4, 18), bots)).toBe(true);
    expect(rosterAllowed(g(4, 19), bots)).toBe(false);
    expect(rosterAllowed(g(4, 36, '2021-03-01T00:00:00Z'), bots)).toBe(true);
    expect(rosterAllowed(g(4, 37, '2021-03-01T00:00:00Z'), bots)).toBe(false);
    expect(rosterAllowed(g(82, 9), bots)).toBe(true);
    expect(rosterAllowed(g(82, 10), bots)).toBe(false);
    expect(rosterAllowed(g(82, 18, '2021-03-16T23:00:00Z'), bots)).toBe(true);
    expect(rosterAllowed(g(40, 3), bots)).toBe(false);
    expect(rosterAllowed(g(0, 3, undefined, 3737830648), bots)).toBe(false);
    expect(rosterAllowed({ ...g(5, 3), r: [['bot', ''], ['a', '']] }, bots)).toBe(false);
  });

  test('slim PGCR keeps Bungie names, blank for hidden players', () => {
    const s = slimFromBungie('7', { Response: { period: '2026-10-11T21:00:00Z', activityDetails: { mode: 4, directorActivityHash: 9 }, entries: [
      { player: { destinyUserInfo: { membershipId: '1', bungieGlobalDisplayName: 'Kaiser', bungieGlobalDisplayNameCode: 4896 } } },
      { player: { destinyUserInfo: { membershipId: '2' } } }] } });
    expect(s).toEqual({ i: '7', p: '2026-10-11T21:00:00Z', m: 4, h: 9, r: [['1', 'Kaiser#4896'], ['2', '']] });
  });

  test('history pages stop below the floor and drop social hubs', async () => {
    const page = (ids: number[]) => ({ ok: true, status: 200, json: async () => ({ ErrorCode: 1, Response: { activities: ids.map((i) => ({ period: '2026-10-11T00:00:00Z', activityDetails: { instanceId: String(i), mode: i === 17 ? 40 : 4 }, values: { activityDurationSeconds: { basic: { value: 60 } } } })) } }) });
    const urls: string[] = [];
    const b = new BungieLite('k', 'https://x', async (u: string) => { urls.push(u); return page([20, 19, 17, 15]); });
    const h = await historyAbove(b, { membershipType: 2, name: '', characterIds: ['c1'] }, '9', 16n);
    expect(h.map((x) => x.instanceId)).toEqual(['20', '19']);
    expect(urls).toHaveLength(1);
  });
});

describe('queue + route', () => {
  test('legacy combined items migrate to single-account items and are never picked', () => {
    const s = new SummaryStore(tmp()); s.ensure();
    const q: any = { items: { '1+2': { key: '1+2', ids: ['1', '2'], priority: 0, source: 'seed', status: 'done', enqueuedAt: 'a', attempts: 0, builtAt: '2020-01-01T00:00:00Z' } } };
    s.ingest(q);
    expect(Object.keys(q.items).sort()).toEqual(['1', '1+2', '2']);
    expect(q.items['1'].source).toBe('migrate');
    q.items['1'].status = 'done'; q.items['2'].status = 'done'; q.items['1'].builtAt = q.items['2'].builtAt = new Date().toISOString();
    expect(pickNext(q, 3600_000)).toBeNull();
  });

  test('route merges ready accounts, reports per-account status, queues the rest', async () => {
    const dir = tmp(); const s = new SummaryStore(dir); s.ensure();
    writeAccountSummary(dir, { ...acct('11', [['1', 60, '2026-10-11T00:00:00Z', ['11', '99']]], { 99: 'Kaiser#4896' }), name: 'Splash#1', membershipType: 2 });
    const app = express(); app.use(express.json()); app.use('/played-with', createPlayedWithRouter({} as any, {} as any, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipIds: ['11', '12'] }) });
      expect(r.status).toBe(200);
      const j: any = await r.json();
      expect(j.source).toBe('accounts'); expect(j.partial).toBe(true);
      expect(j.accounts.map((a: any) => [a.id, a.status, a.platform])).toEqual([['11', 'ready', 'PSN'], ['12', 'queued', null]]);
      expect(j.partners[0]).toMatchObject({ membershipId: '99', displayName: 'Kaiser#4896', lastPlayedTogether: '2026-10-11T00:00:00Z' });
      expect(fs.readFileSync(s.requestsPath, 'utf8')).toContain('"12"');
    } finally { srv.close(); }
  });

  test('D1 Played With not supported on per-account route', async () => {
    const dir = tmp(); const s = new SummaryStore(dir); s.ensure();
    const app = express(); app.use(express.json()); app.use('/played-with', createPlayedWithRouter({} as any, {} as any, s));
    const srv = app.listen(0); const port = (srv.address() as AddressInfo).port;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/played-with/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membershipIds: ['11', '12'], game: 'D1' }) });
      expect(r.status).toBe(501);
      const j: any = await r.json();
      expect(j.error).toBe('D1 Played With not supported on per-account route');
      expect(j.message).toContain('legacy getPartners path');
      expect(j.d1CoverageCaveat).toContain('billion 1 only');
    } finally { srv.close(); }
  });
});
