import { Router, Request, Response } from 'express';
import { ArchiveService } from '../services/archive.service';
import { PartnerRow, PlayedWithResult, PlayedWithService, PlayerInstance } from '../services/played-with.service';
import { logger } from '../utils/logger';
import { isSocialHubActivity } from '../utils/social-hubs';
import { SummaryStore, summaryKey } from '../services/played-with-summary.store';
import { PartnerNameRefresher } from '../services/partner-name-refresh.service';
import { AccountSummary, mergeAccounts, readAccountSummary } from '../services/played-with-account';
import { PRIVATE_GUARDIAN } from '../services/played-with.service';

const STALE_MS = Number(process.env.PLAYED_WITH_STALE_MINUTES || 60) * 60_000;
const PLATFORM: Record<number, string> = { 1: 'Xbox', 2: 'PSN', 3: 'Steam', 4: 'Blizzard', 5: 'Stadia', 6: 'Epic' };

/**
 * POST /played-with/stats { membershipIds: string[], limit?: number }
 * -> { partners, coverage, pending }.
 * A full lookup for a veteran account reads thousands of bands (minutes on HDD), so it runs as a
 * background job: the first call waits up to WAIT_MS, then returns { pending: true, partners: [] }
 * and the client polls the same call; finished results are cached for CACHE_MS.
 * coverage.complete=false means some games are in bands not built yet (or above the index),
 * so the client should fill from Bungie.
 */
const WAIT_MS = Number(process.env.PLAYED_WITH_WAIT_MS || 20_000);
const CACHE_MS = Number(process.env.PLAYED_WITH_CACHE_MS || 6 * 3600_000);
const MAX_JOBS = 200;

interface Job { started: number; finished?: number; result?: PlayedWithResult; error?: string; promise: Promise<void> }

export function createPlayedWithRouter(archive: ArchiveService, pw: PlayedWithService, summaries?: SummaryStore | null, names?: PartnerNameRefresher | null): Router {
  const router = Router();
  const jobs = new Map<string, Job>();

  const startJob = (key: string, ids: string[], limit: number): Job => {
    const job: Job = { started: Date.now(), promise: Promise.resolve() };
    job.promise = (async () => {
      try {
        const instances: PlayerInstance[] = [];
        for (const mid of ids) {
          const r = await archive.getPlayerActivitiesMultiTier(mid, { limit: 1_000_000 });
          for (const a of r.activities) {
            // Skip social hubs before planning band reads (rows with real mode/hash). Compact-only rows
            // come back as mode 0 / hash 0 and are kept here; the band scan drops their hub rows (HUB_CLAUSE).
            if (isSocialHubActivity(a)) continue;
            instances.push({ instanceId: String(a.instance_id), durationSeconds: Number(a.duration_seconds) || 0, period: a.period });
          }
        }
        job.result = await pw.getPartners(ids, instances, limit);
      } catch (error) {
        job.error = String(error);
        logger.error('Played With job failed', { key, error: job.error });
      } finally {
        job.finished = Date.now();
      }
    })();
    if (jobs.size >= MAX_JOBS) {
      const oldest = [...jobs.entries()].filter(([, j]) => j.finished).sort((a, b) => a[1].started - b[1].started)[0];
      if (oldest) jobs.delete(oldest[0]);
    }
    jobs.set(key, job);
    return job;
  };

  const refreshAsked = new Map<string, number>();

  /**
   * v2: one summary per account, merged on request. Body: membershipIds (all looked-up accounts, max 10),
   * include (subset to count; default all), sortBy ('total' or one membership id), limit.
   */
  const servePerAccount = async (req: Request, res: Response, store: SummaryStore, ids: string[], limit: number) => {
    const body = (req.body || {}) as { include?: unknown; sortBy?: unknown };
    const include = Array.isArray(body.include) ? ids.filter((x) => (body.include as unknown[]).map(String).includes(x)) : ids;
    const sortBy = typeof body.sortBy === 'string' && include.includes(body.sortBy) ? body.sortBy : 'total';
    const t0 = Date.now();
    const sums = new Map<string, AccountSummary>();
    const toQueue: string[] = []; const toRefresh: string[] = [];
    const accounts = ids.map((id) => {
      const s = readAccountSummary(store.dir, id);
      const st = store.status(id);
      if (s) {
        sums.set(id, s);
        const due = Date.now() - Date.parse(s.checkedAt) > STALE_MS;
        if (due && Date.now() - (refreshAsked.get(id) || 0) > STALE_MS) { refreshAsked.set(id, Date.now()); toRefresh.push(id); }
        return { id, name: s.name || null, membershipType: s.membershipType ?? null, platform: PLATFORM[s.membershipType || 0] || null, game: 'D2', status: 'ready',
          refreshing: st.status === 'running' || (st.status === 'pending' && due), games: s.games, archiveGames: s.archiveGames, bungieGames: s.bungieGames, d1Games: s.d1Games,
          builtAt: s.builtAt, checkedAt: s.checkedAt, included: include.includes(id), bungie: (s.coverage as any)?.bungie ?? null };
      }
      if (st.status === 'requested' || st.status === 'failed') toQueue.push(id);
      return { id, name: null, membershipType: null, platform: null, game: 'D2', status: st.status === 'running' ? 'building' : 'queued', position: st.position, progress: st.progress ?? null, included: include.includes(id) };
    });
    if (toQueue.length) store.request(toQueue, 'lookup');
    if (toRefresh.length) store.request(toRefresh, 'refresh');
    const ready = include.filter((id) => sums.has(id)).map((id) => sums.get(id)!);
    const building = accounts.filter((a) => a.status !== 'ready');
    if (!ready.length) {
      // Fallback while per-account builds run: an older combined summary for exactly these accounts.
      const legacy = store.readSummary(summaryKey(ids));
      if (legacy) {
        const partners = (legacy.partners as PartnerRow[]).slice(0, limit).map((p) => ({ ...p }));
        const nameRefresh = names ? await names.refresh(partners) : undefined;
        return res.json({ pending: false, partial: true, source: 'summary', builtAt: legacy.builtAt, games: legacy.games, partners, coverage: legacy.coverage, accounts, nameRefresh });
      }
      const b = building.find((a) => a.status === 'building') || building[0];
      return res.status(202).json({ pending: true, queued: true, status: b?.status === 'building' ? 'running' : 'pending', position: (b as any)?.position ?? null, progress: (b as any)?.progress ?? null, accounts, partners: [] });
    }
    const merged = mergeAccounts(ready, ids, limit, sortBy);
    const partners = merged.partners;
    const mergeMs = Date.now() - t0;
    const unnamed = partners.filter((p) => !p.displayName);
    if (unnamed.length && pw?.fillNames) {
      const rows: PartnerRow[] = unnamed.slice(0, 200).map((p) => ({ membershipId: p.membershipId, displayName: '', activitiesTogether: p.activitiesTogether, timeTogetherSeconds: p.timeTogetherSeconds, lastPlayedTogether: p.lastPlayedTogether, lastInstanceId: p.lastInstanceId }));
      try { await pw.fillNames(rows); } catch (e) { logger.debug('Played With name fill failed', { error: String(e) }); }
      rows.forEach((r, i) => { if (r.displayName) { unnamed[i].displayName = r.displayName; unnamed[i].nameSource = r.nameSource; } });
    }
    const nameRefresh = names ? await names.refresh(partners as unknown as PartnerRow[]) : undefined;
    for (const p of partners) if (!p.displayName) { p.displayName = PRIVATE_GUARDIAN; p.nameSource = 'private'; }
    const sum = (k: 'd1Games' | 'bungieGames') => ready.reduce((n, s) => n + (s[k] || 0), 0);
    const coverage = {
      complete: ready.length === include.length && ready.every((s) => (s.coverage as any)?.complete !== false && ['ok', 'account_not_found'].includes((s.coverage as any)?.bungie)),
      games: merged.games, bungieGames: sum('bungieGames'), d1GamesNotCounted: sum('d1Games'),
      archiveMaxIidExclusive: (ready[0].coverage as any)?.archiveMaxIidExclusive ?? null,
      uncoveredInstances: ready.reduce((n, s) => n + Number((s.coverage as any)?.uncoveredInstances || 0), 0),
      accountsReady: ready.length, accountsIncluded: include.length,
    };
    return res.json({ pending: false, partial: ready.length < include.length, source: 'accounts', sortBy, accounts, games: merged.games, totalPartners: merged.totalPartners, partners, coverage, mergeMs, nameRefresh });
  };

  router.post('/stats', async (req: Request, res: Response) => {
    const body = (req.body || {}) as { membershipIds?: unknown; limit?: unknown };
    const ids = Array.isArray(body.membershipIds)
      ? [...new Set(body.membershipIds.map(String).filter((s) => /^\d{1,20}$/.test(s)))].sort().slice(0, 10)
      : [];
    if (!ids.length) return res.status(400).json({ error: 'membershipIds required' });
    const limit = Math.max(1, Math.min(5000, Number(body.limit) || 500));
    if (summaries) return servePerAccount(req, res, summaries, ids, limit);
    const key = `${ids.join(',')}|${limit}`;
    let job = jobs.get(key);
    if (job && job.finished && (job.error || Date.now() - job.finished > CACHE_MS)) {
      jobs.delete(key);
      job = undefined;
    }
    if (!job) job = startJob(key, ids, limit);
    if (!job.finished) {
      await Promise.race([job.promise, new Promise((r) => setTimeout(r, WAIT_MS))]);
    }
    if (!job.finished) {
      return res.status(202).json({ pending: true, partners: [], elapsedMs: Date.now() - job.started });
    }
    if (job.error || !job.result) return res.status(500).json({ error: 'played with lookup failed' });
    const partners = job.result.partners.map((p) => ({ ...p }));
    const nameRefresh = names ? await names.refresh(partners) : undefined;
    return res.json({ pending: false, ...job.result, partners, ms: job.finished - job.started, nameRefresh });
  });
  return router;
}
