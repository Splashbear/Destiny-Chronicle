import { Router, Request, Response } from 'express';
import { ArchiveService } from '../services/archive.service';
import { PlayedWithResult, PlayedWithService, PlayerInstance } from '../services/played-with.service';
import { logger } from '../utils/logger';

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

export function createPlayedWithRouter(archive: ArchiveService, pw: PlayedWithService): Router {
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

  router.post('/stats', async (req: Request, res: Response) => {
    const body = (req.body || {}) as { membershipIds?: unknown; limit?: unknown };
    const ids = Array.isArray(body.membershipIds)
      ? [...new Set(body.membershipIds.map(String).filter((s) => /^\d{1,20}$/.test(s)))].sort().slice(0, 10)
      : [];
    if (!ids.length) return res.status(400).json({ error: 'membershipIds required' });
    const limit = Math.max(1, Math.min(5000, Number(body.limit) || 500));
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
    return res.json({ pending: false, ...job.result, ms: job.finished - job.started });
  });
  return router;
}
