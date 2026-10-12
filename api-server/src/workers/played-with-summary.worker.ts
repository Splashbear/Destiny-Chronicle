/**
 * Played With summary worker: one account at a time, forever.
 *   node dist/workers/played-with-summary.worker.js
 * Env: PLAYED_WITH_SUMMARY_DIR (required), PLAYED_WITH_* index settings (same as the API),
 *      PLAYED_WITH_SUMMARY_API (archive API base, default http://127.0.0.1:3001),
 *      PLAYED_WITH_SUMMARY_PARTNERS (default 1000), PLAYED_WITH_REFRESH_HOURS (default 168),
 *      PLAYED_WITH_IDLE_MS (default 30000).
 * Logs only which account key was processed (ids, games, partners, ms). No visitor data exists here.
 * Exits non-zero on a fatal error; the service wrapper restarts it.
 */
import { loadPlayedWithConfig, PlayedWithService, PlayerInstance } from '../services/played-with.service';
import { pickNext, SummaryStore, QueueItem } from '../services/played-with-summary.store';

const env = process.env;
const API = (env.PLAYED_WITH_SUMMARY_API || 'http://127.0.0.1:3001').replace(/\/$/, '');
const PARTNERS = Math.max(1, Math.min(5000, Number(env.PLAYED_WITH_SUMMARY_PARTNERS) || 1000));
const REFRESH_MS = (Number(env.PLAYED_WITH_REFRESH_HOURS) || 168) * 3600_000;
const IDLE_MS = Number(env.PLAYED_WITH_IDLE_MS) || 30_000;
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const httpFetch = (globalThis as any).fetch as (u: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export async function loadInstances(ids: string[]): Promise<{ instances: PlayerInstance[]; maxIid: bigint }> {
  const seen = new Set<string>(); const instances: PlayerInstance[] = []; let maxIid = 0n;
  for (const id of ids) {
    const r = await httpFetch(`${API}/players/${id}/activities?limit=100000&includePartial=1`);
    if (!r.ok) throw new Error(`activities ${id}: HTTP ${r.status}`);
    const j = await r.json();
    const rows = [...(j.activities || []), ...((j.partialInstanceIds || []) as unknown[]).map((x) => ({ instanceId: x }))];
    for (const a of rows) {
      const k = String(a.instanceId ?? a.instance_id); if (!/^\d+$/.test(k) || seen.has(k)) continue;
      seen.add(k); if (BigInt(k) > maxIid) maxIid = BigInt(k);
      instances.push({ instanceId: k, durationSeconds: Number(a.durationSeconds ?? a.duration_seconds) || 0, period: a.period });
    }
  }
  return { instances, maxIid };
}

async function processOne(store: SummaryStore, svc: PlayedWithService, it: QueueItem): Promise<void> {
  const q = store.readQueue(); const cur = q.items[it.key]; const refresh = cur.status === 'done';
  const t0 = Date.now();
  const { instances, maxIid } = await loadInstances(cur.ids);
  if (refresh && cur.maxInstanceId && BigInt(cur.maxInstanceId) >= maxIid) {
    cur.checkedAt = new Date().toISOString(); store.writeQueue(q);
    log('refresh: no new games', { key: cur.key }); return;
  }
  cur.status = 'running'; cur.attempts += 1; store.writeQueue(q);
  try {
    const res = await svc.getPartners(cur.ids, instances, PARTNERS);
    const builtAt = new Date().toISOString();
    store.writeSummary({ key: cur.key, ids: cur.ids, label: cur.label, builtAt, games: instances.length, maxInstanceId: String(maxIid), partners: res.partners, coverage: res.coverage });
    Object.assign(cur, { status: 'done', builtAt, checkedAt: builtAt, games: instances.length, maxInstanceId: String(maxIid), partners: res.partners.length, buildMs: Date.now() - t0, error: undefined, attempts: 0 });
    log(refresh ? 'refreshed' : 'built', { key: cur.key, source: cur.source, games: cur.games, partners: cur.partners, ms: cur.buildMs });
  } catch (e) {
    cur.error = String(e); cur.status = cur.attempts >= 3 ? 'failed' : 'pending';
    log('build failed', { key: cur.key, attempts: cur.attempts, error: cur.error });
  }
  store.writeQueue(q);
}

async function main(): Promise<void> {
  const dir = (env.PLAYED_WITH_SUMMARY_DIR || '').trim();
  const cfg = loadPlayedWithConfig();
  if (!dir || !cfg) { log('PLAYED_WITH_SUMMARY_DIR and a PLAYED_WITH index root are required'); process.exit(2); }
  const store = new SummaryStore(dir); store.ensure();
  log('worker start', { api: API, partners: PARTNERS, refreshHours: REFRESH_MS / 3600_000 });
  // A crash mid-build leaves an item "running"; pickNext treats it as pending, so it is retried.
  for (;;) {
    const q = store.readQueue(); const added = store.ingest(q); store.writeQueue(q);
    if (added) log('enqueued', { added });
    const it = pickNext(q, REFRESH_MS);
    if (!it) { await sleep(IDLE_MS); continue; }
    const svc = new PlayedWithService(cfg);
    try { await processOne(store, svc, it); }
    catch (e) {
      const q2 = store.readQueue(); const c = q2.items[it.key];
      if (c) { c.error = String(e); c.attempts += 1; c.status = c.attempts >= 3 ? 'failed' : 'pending'; c.checkedAt = new Date().toISOString(); store.writeQueue(q2); }
      log('item error', { key: it.key, error: String(e) }); await sleep(IDLE_MS);
    } finally { await svc.close(); }
  }
}

if (require.main === module) main().catch((e) => { log('fatal', { error: String(e) }); process.exit(1); });