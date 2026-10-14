/**
 * Played With summary worker: one account (one membership id) at a time, forever.
 *   node dist/workers/played-with-summary.worker.js
 * Env: PLAYED_WITH_SUMMARY_DIR (required), PLAYED_WITH_* index settings (same as the API),
 *      PLAYED_WITH_SUMMARY_API (archive API base, default http://127.0.0.1:3001),
 *      PLAYED_WITH_REFRESH_HOURS (default 168), PLAYED_WITH_IDLE_MS (default 30000),
 *      PLAYED_WITH_NAME_TOP (partners per account named from the name table at build, default 2000),
 *      BUNGIE_API_KEY or BUNGIE_API_KEY_FILE (games newer than the archive are filled from Bungie; without a key
 *      that step is skipped and the coverage says so), PLAYED_WITH_POST_ARCHIVE_DIR (shared slim PGCR store,
 *      default <summary dir>\..\pgcr_post_archive), PLAYED_WITH_BUNGIE_PARALLEL (default 10).
 * Logs only which account was processed (id, games, partners, ms, Bungie calls). No visitor data exists here.
 */
import fs from 'fs';
import path from 'path';
import { loadPlayedWithConfig, PartnerRow, PlayedWithConfig, PlayedWithService, PlayerInstance, KNOWN_BOT_IDS } from '../services/played-with.service';
import { pickNext, SummaryStore, QueueItem, BuildProgress } from '../services/played-with-summary.store';
import { AccountSummary, AccountSummaryBuilder, readAccountSummary, writeAccountSummary } from '../services/played-with-account';
import { accountInfo, BungieLite, fetchMissing, historyAbove, PostArchiveStore, rosterAllowed } from '../services/post-archive';

const env = process.env;
const API = (env.PLAYED_WITH_SUMMARY_API || 'http://127.0.0.1:3001').replace(/\/$/, '');
const REFRESH_MS = (Number(env.PLAYED_WITH_REFRESH_HOURS) || 168) * 3600_000;
const IDLE_MS = Number(env.PLAYED_WITH_IDLE_MS) || 30_000;
const NAME_TOP = Math.max(0, Number(env.PLAYED_WITH_NAME_TOP ?? 2000));
const PARALLEL = Math.max(1, Math.min(20, Number(env.PLAYED_WITH_BUNGIE_PARALLEL) || 10));
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const httpFetch = (globalThis as any).fetch as (u: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export function bungieKey(): string {
  const k = (env.BUNGIE_API_KEY || '').trim(); if (k) return k;
  const f = (env.BUNGIE_API_KEY_FILE || '').trim();
  try { return f ? fs.readFileSync(f, 'utf8').trim() : ''; } catch { return ''; }
}

/** D2 archive games of one account (D1 counted separately: the Played With index is D2 only). */
export async function loadAccountGames(id: string): Promise<{ instances: PlayerInstance[]; maxIid: bigint; d1Games: number }> {
  const get = async (game: string) => {
    const r = await httpFetch(`${API}/players/${id}/activities?limit=100000&includePartial=1&game=${game}`);
    if (r.status === 404) return { activities: [], partialInstanceIds: [] };
    if (!r.ok) throw new Error(`activities ${id}: HTTP ${r.status}`);
    return r.json();
  };
  const j = await get('D2');
  const seen = new Set<string>(); const instances: PlayerInstance[] = []; let maxIid = 0n;
  const rows = [...(j.activities || []).filter((a: any) => (a.game ?? 'D2') === 'D2'), ...((j.partialInstanceIds || []) as unknown[]).map((x) => ({ instanceId: x }))];
  for (const a of rows) {
    const k = String(a.instanceId ?? a.instance_id); if (!/^\d+$/.test(k) || seen.has(k)) continue;
    seen.add(k); if (BigInt(k) > maxIid) maxIid = BigInt(k);
    instances.push({ instanceId: k, durationSeconds: Number(a.durationSeconds ?? a.duration_seconds) || 0, period: a.period });
  }
  const d1 = await get('D1');
  const d1Games = new Set((d1.activities || []).filter((a: any) => a.game === 'D1').map((a: any) => String(a.instanceId ?? a.instance_id))).size;
  return { instances, maxIid, d1Games };
}

export interface BuildDeps { svc: PlayedWithService; cfg: PlayedWithConfig; dir: string; bungie: BungieLite | null; post: PostArchiveStore }

/** Build (or incrementally refresh) one account summary. Returns the written summary. */
export async function buildAccount(deps: BuildDeps, it: Pick<QueueItem, 'key' | 'membershipType'>, progress: (p: Omit<BuildProgress, 'updatedAt'>, force?: boolean) => void): Promise<AccountSummary> {
  const id = it.key; const { svc, cfg, dir, bungie, post } = deps;
  const prev = readAccountSummary(dir, id);
  const base = { accountsTotal: 1, accountsLoaded: 0, games: 0 };
  let b: AccountSummaryBuilder; let coverage: any; let archiveMaxIid: string; let archiveGames: number; let d1Games: number;
  if (prev && prev.v === 2) {
    b = AccountSummaryBuilder.fromSummary(prev);
    ({ coverage, archiveMaxIid, archiveGames, d1Games } = prev);
    base.accountsLoaded = 1; base.games = prev.games;
  } else {
    progress({ stage: 'loading_games', ...base }, true);
    const loaded = await loadAccountGames(id);
    base.accountsLoaded = 1; base.games = loaded.instances.length;
    progress({ stage: 'loading_games', ...base }, true);
    const scan = await svc.scanRosters([id], loaded.instances, (p) => progress({ ...base, ...p }, p.stage === 'ranking'));
    b = new AccountSummaryBuilder(id);
    for (const i of loaded.instances) b.addGame(i.instanceId, i.durationSeconds, i.period ? new Date(i.period).toISOString().replace(/\.\d{3}Z$/, 'Z') : '');
    for (const [iid, mid, nm, per] of scan.rows) b.addRow(iid, mid, nm, per);
    coverage = scan.coverage; archiveMaxIid = String(loaded.maxIid); archiveGames = loaded.instances.length; d1Games = loaded.d1Games;
  }

  // Bungie step: games newer than the archive (or than this account's saved newest game).
  let bungieTopIid = prev?.bungieTopIid || '0'; let bungieGames = prev?.bungieGames || 0; let missing = new Set(prev?.bungieMissing || []);
  let bungieStatus: string = 'skipped_no_key'; let mType = it.membershipType || prev?.membershipType; let name = prev?.name;
  if (bungie) {
    try {
      const info = await accountInfo(bungie, id, mType);
      mType = info.membershipType; if (info.name) name = info.name;
      const cutoff = BigInt(Math.floor(cfg.compactMaxIid)) - 1n;
      const floor = BigInt(bungieTopIid) > cutoff ? BigInt(bungieTopIid) : cutoff;
      progress({ stage: 'bungie_history', ...base, bungieGames }, true);
      const hist = await historyAbove(bungie, info, id, floor);
      const ids = [...new Set([...hist.map((h) => h.instanceId), ...missing])];
      progress({ stage: 'bungie_pgcrs', ...base, bungieGames: hist.length, pgcrsDone: 0, pgcrsTotal: ids.length }, true);
      const failed = new Set(await fetchMissing(bungie, post, ids, PARALLEL, (d, t) => progress({ stage: 'bungie_pgcrs', ...base, bungieGames: hist.length, pgcrsDone: d, pgcrsTotal: t })));
      const bots = new Set(cfg.excludeIds || KNOWN_BOT_IDS);
      const histById = new Map(hist.map((h) => [h.instanceId, h]));
      for (const iid of ids) {
        const g = post.get(iid); if (!g) continue;
        if (!rosterAllowed(g, bots)) { failed.delete(iid); continue; }
        if (!b.hasGame(iid)) bungieGames++;
        b.addGame(iid, histById.get(iid)?.durationSeconds || 0, g.p);
        for (const [mid, nm] of g.r) b.addRow(iid, mid, nm, g.p);
        if (BigInt(iid) > BigInt(bungieTopIid)) bungieTopIid = iid;
      }
      for (const h of hist) if (BigInt(h.instanceId) > BigInt(bungieTopIid) && !failed.has(h.instanceId)) bungieTopIid = h.instanceId;
      missing = failed; bungieStatus = failed.size ? 'partial' : 'ok';
    } catch (e) {
      // Bungie has no D2 profile for this id (e.g. an unused platform membership): nothing newer to fill.
      bungieStatus = /DestinyAccountNotFound/.test(String((e as any)?.errorStatus || e)) ? 'account_not_found' : `error: ${String((e as Error).message || e)}`;
    }
  }

  // Names: the account's top partners without one get the name-range table's name at their last shared game.
  if (NAME_TOP > 0) {
    const todo = b.partnerCounts().filter((p) => !p.named).sort((x, y) => y.n - x.n).slice(0, NAME_TOP);
    const rows: Array<PartnerRow & { _i: number }> = todo.map((p) => ({ _i: p.i, membershipId: p.mid, displayName: '', activitiesTogether: p.n, timeTogetherSeconds: 0, lastPlayedTogether: p.lastPeriod || undefined }));
    if (rows.length) await svc.fillNames(rows);
    for (const r of rows) if (r.displayName) b.setName(r._i, r.displayName);
  }
  const now = new Date().toISOString();
  const s = b.freeze({
    membershipType: mType, name, builtAt: prev?.builtAt || now, checkedAt: now, archiveMaxIid, bungieTopIid,
    archiveGames, bungieGames, d1Games, bungieMissing: [...missing],
    coverage: { ...coverage, archiveMaxIidExclusive: cfg.compactMaxIid, bungie: bungieStatus, bungieGames, bungieMissing: missing.size, d1Games, d1Counted: false },
  });
  writeAccountSummary(dir, s);
  return s;
}

async function processOne(store: SummaryStore, deps: BuildDeps, it: QueueItem): Promise<void> {
  const q = store.readQueue(); const cur = q.items[it.key];
  const t0 = Date.now(); const calls0 = deps.bungie?.calls || 0;
  let lastWrite = 0;
  const setProgress = (p: Omit<BuildProgress, 'updatedAt'>, force = false) => {
    cur.progress = { ...p, updatedAt: new Date().toISOString() };
    if (force || Date.now() - lastWrite >= 2000) { lastWrite = Date.now(); store.writeQueue(q); }
  };
  const incremental = !!readAccountSummary(deps.dir, cur.key);
  cur.status = 'running'; cur.attempts += 1; store.writeQueue(q);
  try {
    const s = await buildAccount(deps, cur, setProgress);
    Object.assign(cur, { status: 'done', builtAt: s.builtAt, checkedAt: s.checkedAt, games: s.games, maxInstanceId: s.bungieTopIid !== '0' ? s.bungieTopIid : s.archiveMaxIid, partners: s.pids.length, bungieGames: s.bungieGames, bungieTopIid: s.bungieTopIid, membershipType: s.membershipType, error: undefined, attempts: 0, progress: undefined });
    if (!incremental) cur.buildMs = Date.now() - t0;
    log(incremental ? 'refreshed' : 'built', { key: cur.key, source: cur.source, games: s.games, bungieGames: s.bungieGames, d1Games: s.d1Games, partners: s.pids.length, ms: Date.now() - t0, bungieCalls: (deps.bungie?.calls || 0) - calls0, bungie: (s.coverage as any).bungie });
  } catch (e) {
    cur.error = String(e); cur.progress = undefined; cur.status = cur.attempts >= 3 ? 'failed' : 'pending';
    log('build failed', { key: cur.key, attempts: cur.attempts, error: cur.error });
    if (/fetch failed|ECONNREFUSED|ECONNRESET|HTTP 5\d\d/.test(cur.error)) { cur.attempts -= 1; cur.status = 'pending'; store.writeQueue(q); throw e; }
  }
  store.writeQueue(q);
}

async function main(): Promise<void> {
  const dir = (env.PLAYED_WITH_SUMMARY_DIR || '').trim();
  const cfg = loadPlayedWithConfig();
  if (!dir || !cfg) { log('PLAYED_WITH_SUMMARY_DIR and a PLAYED_WITH index root are required'); process.exit(2); }
  const store = new SummaryStore(dir); store.ensure();
  const key = bungieKey();
  const post = new PostArchiveStore((env.PLAYED_WITH_POST_ARCHIVE_DIR || '').trim() || path.join(path.dirname(path.resolve(dir)), 'pgcr_post_archive'));
  log('worker start', { api: API, refreshHours: REFRESH_MS / 3600_000, bungie: !!key, postArchive: post.root });
  for (;;) {
    const q = store.readQueue(); const added = store.ingest(q); store.writeQueue(q);
    if (added) log('enqueued', { added });
    const it = pickNext(q, REFRESH_MS);
    if (!it) { await sleep(IDLE_MS); continue; }
    const svc = new PlayedWithService(cfg);
    const deps: BuildDeps = { svc, cfg, dir, bungie: key ? new BungieLite(key) : null, post };
    try { await processOne(store, deps, it); }
    catch (e) {
      log('archive API unreachable, waiting', { key: it.key, error: String(e) });
      await sleep(Math.max(IDLE_MS, 60_000));
    } finally { await svc.close(); }
  }
}

if (require.main === module) main().catch((e) => { log('fatal', { error: String(e) }); process.exit(1); });
