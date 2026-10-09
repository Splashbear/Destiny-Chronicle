import fs from 'fs';
import path from 'path';
import { Express, Request, Response, NextFunction } from 'express';

const startedAt = new Date().toISOString();

export function serverStartedAt(): string {
  return startedAt;
}

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function excludeMids(): Set<string> {
  return new Set(
    (process.env.USAGE_EXCLUDE_MIDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function etStamp(d = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

function logDir(): string {
  return process.env.USAGE_LOG_DIR || '';
}

export function appendUsage(line: Record<string, unknown>): void {
  const dir = logDir();
  if (!dir) return;
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `usage-${day}.jsonl`);
  const payload = JSON.stringify(line) + '\n';
  setImmediate(() => {
    fs.promises.mkdir(dir, { recursive: true }).then(() => fs.promises.appendFile(file, payload)).catch(() => {
      /* logging must not fail the request */
    });
  });
}

function membershipIdsFrom(req: Request): string[] {
  const fromParam = req.params?.membershipId || req.params?.instanceId;
  if (req.body && Array.isArray(req.body.membershipIds)) {
    return req.body.membershipIds.map((x: unknown) => String(x));
  }
  const q = req.query?.membershipId;
  if (typeof q === 'string' && q) return [q];
  if (typeof fromParam === 'string' && /^\d+$/.test(fromParam) && req.path.includes('/players/')) {
    return [fromParam];
  }
  return [];
}

function coverageOf(body: unknown): { level?: string; source?: string; rows?: number } {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  const cov = (b.coverage || {}) as Record<string, unknown>;
  const activities = b.activities;
  const rows = Array.isArray(activities)
    ? activities.length
    : typeof cov.rowCount === 'number'
      ? cov.rowCount
      : undefined;
  return {
    level: typeof cov.level === 'string' ? cov.level : undefined,
    source: typeof cov.source === 'string' ? cov.source : undefined,
    rows,
  };
}

/**
 * Caps, in-memory rate limit, inflight queue, and usage JSONL.
 * Rate-limit keys stay in memory and are never written.
 */
export function installApiGuard(app: Express): void {
  const maxBatch = envInt('PGCR_MAX_BATCH', 20);
  const maxLimit = envInt('PGCR_MAX_ACTIVITIES_LIMIT', 100000);
  const maxSpanDays = envInt('PGCR_MAX_DATE_SPAN_DAYS', 5000);
  const maxInflight = envInt('PGCR_MAX_INFLIGHT', 4);
  const maxQueue = envInt('PGCR_MAX_QUEUE', 32);
  const ratePerMin = envInt('PGCR_RATE_PER_MIN', 120);
  const timeoutMs = envInt('PGCR_REQUEST_TIMEOUT_MS', 120000);
  const hits = new Map<string, number[]>();
  let inflight = 0;
  const waiters: Array<() => void> = [];

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    const started = Date.now();
    const orig = res.json.bind(res);
    res.json = (body: unknown) => {
      res.locals.usageBody = body;
      return orig(body);
    };

    const limitRaw = req.query?.limit ?? req.body?.limit;
    if (limitRaw !== undefined && limitRaw !== '') {
      const n = parseInt(String(limitRaw), 10);
      if (Number.isFinite(n) && n > maxLimit) {
        return res.status(400).json({ error: `limit exceeds max ${maxLimit}` });
      }
    }
    if (Array.isArray(req.body?.membershipIds) && req.body.membershipIds.length > maxBatch) {
      return res.status(400).json({ error: `Maximum ${maxBatch} membership IDs per batch request` });
    }
    const from = String(req.query?.from || req.body?.from || '');
    const to = String(req.query?.to || req.body?.to || '');
    if (from && to) {
      const span = (Date.parse(to) - Date.parse(from)) / 86400000;
      if (Number.isFinite(span) && span > maxSpanDays) {
        return res.status(400).json({ error: `date span exceeds ${maxSpanDays} days` });
      }
    }

    const key = req.socket.remoteAddress || 'local';
    const now = Date.now();
    const windowStart = now - 60000;
    const prev = (hits.get(key) || []).filter((t) => t > windowStart);
    if (prev.length >= ratePerMin) {
      res.setHeader('Retry-After', '2');
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    prev.push(now);
    hits.set(key, prev);
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every((t) => t <= windowStart)) hits.delete(k);
      }
    }

    const heavy = req.path.startsWith('/players') || req.path.startsWith('/pgcr') || req.path.startsWith('/api/pgcr');
    const run = () => {
      inflight += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        inflight -= 1;
        const wake = waiters.shift();
        if (wake) wake();
      };
      res.setTimeout(timeoutMs, () => {
        if (!res.headersSent) {
          res.setHeader('Retry-After', '2');
          res.status(503).json({ error: 'Request timed out' });
        }
        release();
      });
      res.on('finish', () => {
        release();
        const mids = membershipIdsFrom(req);
        const excluded = excludeMids();
        const self = mids.length > 0 && mids.every((id) => excluded.has(id));
        const cov = coverageOf(res.locals.usageBody);
        const game = (req.query?.game || req.body?.game || '') as string;
        appendUsage({
          ts_utc: new Date().toISOString(),
          ts_et: etStamp(),
          route: `${req.method} ${req.path}`,
          game: game || null,
          membership_ids: mids,
          instance_id: req.params?.instanceId || null,
          status: res.statusCode,
          ms: Date.now() - started,
          rows: cov.rows ?? null,
          coverage_level: cov.level ?? null,
          source: cov.source ?? null,
          self,
        });
      });
      res.on('close', release);
      next();
    };

    if (!heavy) return run();
    if (inflight < maxInflight) return run();
    if (waiters.length >= maxQueue) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ error: 'Server busy' });
    }
    waiters.push(run);
  });
}

export function freeGiB(target: string): number | null {
  if (!target) return null;
  try {
    const st = fs.statfsSync(target);
    return Math.round((Number(st.bavail) * Number(st.bsize)) / (1024 ** 3));
  } catch {
    return null;
  }
}
