import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Per-account Played With summary (v2). One file per membership id, so any subset of a user's accounts is
 * merged at request time without a rebuild. Each game keeps its filtered roster as partner indexes, so a game
 * two of the selected accounts shared counts once.
 *   summaries/acct/<membershipId>.json.gz
 */
export interface AccountSummary {
  v: 2;
  id: string;
  membershipType?: number;
  /** Bungie name of the account (Name#1234) when Bungie returned one. */
  name?: string;
  builtAt: string;
  checkedAt: string;
  /** Newest archive game and newest game seen at Bungie (incremental refresh floor). */
  archiveMaxIid: string;
  bungieTopIid: string;
  /** D2 games counted (archive + Bungie fill). */
  games: number;
  archiveGames: number;
  bungieGames: number;
  /** D1 games on the account: not counted (the Played With index is D2 only). */
  d1Games: number;
  /** Post-archive games whose PGCR could not be fetched yet (retried on the next refresh). */
  bungieMissing: string[];
  coverage: unknown;
  /** Partner table: membership id + best name (blank = unknown so far). */
  pids: string[];
  pnames: string[];
  /** [instanceId, durationSeconds, period ISO, partnerIndexes] */
  g: Array<[string, number, string, number[]]>;
}

export function accountSummaryPath(dir: string, id: string): string { return path.join(dir, 'summaries', 'acct', `${id}.json.gz`); }

export function writeAccountSummary(dir: string, s: AccountSummary): void {
  const p = accountSummaryPath(dir, s.id); fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(s))); fs.renameSync(tmp, p);
}

const cache = new Map<string, { mtime: number; s: AccountSummary }>();
export function readAccountSummary(dir: string, id: string): AccountSummary | null {
  const p = accountSummaryPath(dir, id);
  let st: fs.Stats; try { st = fs.statSync(p); } catch { return null; }
  const c = cache.get(p); if (c && c.mtime === st.mtimeMs) return c.s;
  try {
    const s = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')) as AccountSummary;
    if (cache.size > 64) cache.delete(cache.keys().next().value as string);
    cache.set(p, { mtime: st.mtimeMs, s }); return s;
  } catch { return null; }
}

/** Builder: add rosters game by game (archive rows and Bungie rows alike), then freeze. */
export class AccountSummaryBuilder {
  private idx = new Map<string, number>();
  private pids: string[] = []; private pnames: string[] = [];
  private games = new Map<string, [string, number, string, Set<number>]>();
  constructor(readonly id: string) {}
  static fromSummary(s: AccountSummary): AccountSummaryBuilder {
    const b = new AccountSummaryBuilder(s.id);
    s.pids.forEach((mid, i) => { b.idx.set(mid, i); b.pids.push(mid); b.pnames.push(s.pnames[i] || ''); });
    for (const [iid, d, p, ps] of s.g) b.games.set(iid, [iid, d, p, new Set(ps)]);
    return b;
  }
  addGame(iid: string, dur: number, period: string): void {
    const g = this.games.get(iid);
    if (!g) this.games.set(iid, [iid, dur, period, new Set()]);
    else { if (dur > g[1]) g[1] = dur; if (period > g[2]) g[2] = period; }
  }
  addRow(iid: string, mid: string, name: string | null, period?: string | null): void {
    if (mid === this.id) return;
    const g = this.games.get(iid); if (!g) return; // only games in this account's own history
    if (period && !g[2]) g[2] = period;
    let i = this.idx.get(mid);
    if (i === undefined) { i = this.pids.length; this.idx.set(mid, i); this.pids.push(mid); this.pnames.push(''); }
    if (name && name.trim()) this.pnames[i] = name.trim(); // later rows (newer sources) win
    g[3].add(i);
  }
  hasGame(iid: string) { return this.games.has(iid); }
  /** Partners by games together, for choosing which ones to name. */
  partnerCounts(): Array<{ i: number; mid: string; n: number; named: boolean; lastIid: string; lastPeriod: string }> {
    const n = new Array(this.pids.length).fill(0); const last: Array<[string, string]> = new Array(this.pids.length).fill(['', '']);
    for (const [iid, , per, ps] of this.games.values()) for (const i of ps) { n[i]++; if (per >= last[i][1]) last[i] = [iid, per]; }
    return this.pids.map((mid, i) => ({ i, mid, n: n[i], named: !!this.pnames[i], lastIid: last[i][0], lastPeriod: last[i][1] }));
  }
  setName(i: number, name: string) { if (name) this.pnames[i] = name; }
  freeze(meta: Omit<AccountSummary, 'v' | 'id' | 'pids' | 'pnames' | 'g' | 'games'>): AccountSummary {
    const g = [...this.games.values()].map(([iid, d, p, s]) => [iid, d, p, [...s]] as [string, number, string, number[]]);
    return { v: 2, id: this.id, ...meta, games: g.length, pids: this.pids, pnames: this.pnames, g };
  }
}

export interface PerAccountStat { id: string; activitiesTogether: number; timeTogetherSeconds: number; firstPlayedTogether?: string; lastPlayedTogether?: string }
export interface MergedPartner {
  membershipId: string; displayName: string; activitiesTogether: number; timeTogetherSeconds: number;
  firstPlayedTogether?: string; lastPlayedTogether?: string; lastInstanceId?: string; nameSource?: string; perAccount: PerAccountStat[];
}

/**
 * Merge any subset of account summaries. A game is counted once even when several selected accounts were in it
 * (its duration = the longest own duration). Every looked-up own account (`ownIds`) is excluded from partners.
 * sortBy: 'total' or one membership id (that account's games together, then total).
 */
export function mergeAccounts(sums: AccountSummary[], ownIds: string[], limit = 500, sortBy = 'total'): { partners: MergedPartner[]; games: number; totalPartners: number } {
  const own = new Set([...ownIds, ...sums.map((s) => s.id)]);
  const order = sums.map((s) => s.id);
  // game -> { dur, per, accounts bitmask, partner mids }
  const games = new Map<string, { d: number; p: string; acc: number[]; mids: Set<string> }>();
  const names = new Map<string, { name: string; per: string }>();
  sums.forEach((s, a) => {
    for (const [iid, d, p, ps] of s.g) {
      let g = games.get(iid);
      if (!g) { g = { d, p, acc: [], mids: new Set() }; games.set(iid, g); }
      else { if (d > g.d) g.d = d; if (p > g.p) g.p = p; }
      g.acc.push(a);
      for (const i of ps) {
        const mid = s.pids[i]; if (own.has(mid)) continue;
        g.mids.add(mid);
        const nm = s.pnames[i];
        if (nm) { const cur = names.get(mid); if (!cur || p > cur.per) names.set(mid, { name: nm, per: p }); }
      }
    }
  });
  type Acc = { n: number; t: number; first: string; last: string; lastIid: string; per: Array<{ n: number; t: number; first: string; last: string }> };
  const agg = new Map<string, Acc>();
  for (const [iid, g] of games) {
    for (const mid of g.mids) {
      let x = agg.get(mid);
      if (!x) { x = { n: 0, t: 0, first: '', last: '', lastIid: '', per: order.map(() => ({ n: 0, t: 0, first: '', last: '' })) }; agg.set(mid, x); }
      x.n++; x.t += g.d;
      if (g.p && (!x.first || g.p < x.first)) x.first = g.p;
      if (g.p >= x.last) { x.last = g.p; x.lastIid = iid; }
      for (const a of g.acc) {
        const pa = x.per[a]; pa.n++; pa.t += g.d;
        if (g.p && (!pa.first || g.p < pa.first)) pa.first = g.p;
        if (g.p > pa.last) pa.last = g.p;
      }
    }
  }
  const key = sortBy !== 'total' ? order.indexOf(sortBy) : -1;
  const rows = [...agg.entries()].sort((a, b) =>
    (key >= 0 ? b[1].per[key].n - a[1].per[key].n : 0) || b[1].n - a[1].n || b[1].t - a[1].t || (a[0] < b[0] ? -1 : 1));
  const partners = rows.slice(0, Math.max(1, limit)).map(([mid, x]) => {
    const nm = names.get(mid)?.name || '';
    return {
      membershipId: mid, displayName: nm, activitiesTogether: x.n, timeTogetherSeconds: x.t,
      firstPlayedTogether: x.first || undefined, lastPlayedTogether: x.last || undefined, lastInstanceId: x.lastIid || undefined, nameSource: nm ? 'summary' : undefined,
      perAccount: x.per.map((p, a) => ({ id: order[a], activitiesTogether: p.n, timeTogetherSeconds: p.t, firstPlayedTogether: p.first || undefined, lastPlayedTogether: p.last || undefined })).filter((p) => p.activitiesTogether > 0),
    };
  });
  return { partners, games: games.size, totalPartners: agg.size };
}
