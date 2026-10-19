import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { Express, Request, Response, NextFunction } from 'express';

const startedAt = new Date().toISOString();

/** Per-process token so only the server's own self-check is tagged self (header can't be spoofed). */
export const SELF_CHECK_TOKEN = crypto.randomBytes(16).toString('hex');

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

const MID_RE = /^\d{6,25}$/;

/**
 * Pull the account(s) and PGCR instance a request looked up from the ORIGINAL URL
 * (app-level middleware never sees router params). No visitor fields are read.
 */
export function extractLookup(
  originalUrl: string,
  body: unknown
): { membershipIds: string[]; instanceId: string | null } {
  const [p, qs] = String(originalUrl || '').split('?');
  const ids: string[] = [];
  let instanceId: string | null = null;
  const m = p.match(/^\/players\/(\d+)\/activities\/?$/);
  if (m) ids.push(m[1]);
  const q = new URLSearchParams(qs || '');
  const qm = q.get('membershipId');
  if (qm) ids.push(qm);
  const b = body as Record<string, unknown> | null;
  if (b && Array.isArray(b.membershipIds)) {
    for (const x of b.membershipIds) {
      const v = typeof x === 'object' && x !== null ? (x as any).membershipId : x;
      ids.push(String(v));
    }
  }
  const pm = p.match(/^\/(?:api\/)?pgcr\/(\d+)\/?$/);
  if (pm) instanceId = pm[1];
  const clean = [...new Set(ids.map((s) => s.trim()).filter((s) => MID_RE.test(s)))];
  return { membershipIds: clean, instanceId };
}
function isLoopback(addr: string): boolean {
  return addr === '::1' || /^(::ffff:)?127\./.test(addr);
}

/**
 * Rate-limit key for the visitor. Behind the Cloudflare tunnel every request arrives
 * from loopback (cloudflared), so only then is CF-Connecting-IP trusted; a direct
 * (non-loopback) client can't spoof it. Kept in memory only, never logged or written.
 */
export function clientKey(req: Pick<Request, 'headers' | 'socket'>): string {
  const remote = req.socket?.remoteAddress || 'unknown';
  if (isLoopback(remote)) {
    const cf = req.headers['cf-connecting-ip'];
    const v = (Array.isArray(cf) ? cf[0] : cf || '').trim();
    if (v && net.isIP(v)) return v;
  }
  return remote;
}

function retryAfterSec(oldest: number, now: number): number {
  return Math.max(1, Math.ceil((oldest + 60000 - now) / 1000));
}

/** Map X-DC-Client to a fixed label. The raw header is never stored. */
export function clientSource(header: unknown): 'web' | 'bot' | 'other' {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') return 'other';
  const v = raw.trim().toLowerCase();
  if (v === 'web') return 'web';
  if (v === 'discord-bot') return 'bot';
  return 'other';
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
  const ratePerMin = envInt('PGCR_RATE_PER_MIN', 240);
  const globalPerMin = envInt('PGCR_GLOBAL_RATE_PER_MIN', 3000);
  const timeoutMs = envInt('PGCR_REQUEST_TIMEOUT_MS', 120000);
  const hits = new Map<string, number[]>();
  const globalHits: number[] = [];
  let inflight = 0;
  const waiters: Array<() => void> = [];

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    const started = Date.now();
    const originalUrl = req.originalUrl || req.url;
    const selfCheck = req.headers['x-dc-selfcheck'] === SELF_CHECK_TOKEN;
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
    const key = clientKey(req);
    const now = Date.now();
    const windowStart = now - 60000;
    while (globalHits.length && globalHits[0] <= windowStart) globalHits.shift();
    if (globalHits.length >= globalPerMin) {
      res.setHeader('Retry-After', String(retryAfterSec(globalHits[0], now)));
      return res.status(429).json({ error: 'Server is busy, try again shortly' });
    }
    const prev = (hits.get(key) || []).filter((t) => t > windowStart);
    if (prev.length >= ratePerMin) {
      hits.set(key, prev);
      res.setHeader('Retry-After', String(retryAfterSec(prev[0], now)));
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    prev.push(now);
    hits.set(key, prev);
    globalHits.push(now);
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
        const look = extractLookup(originalUrl, req.body);
        const excluded = excludeMids();
        const ownIds = look.membershipIds.filter((id) => excluded.has(id));
        const mids = look.membershipIds.filter((id) => !excluded.has(id));
        const self = selfCheck || (look.membershipIds.length > 0 && mids.length === 0);
        const cov = coverageOf(res.locals.usageBody);
        const game = (req.query?.game || req.body?.game || '') as string;
        appendUsage({
          ts_utc: new Date().toISOString(),
          ts_et: etStamp(),
          route: `${req.method} ${ownIds.reduce((p, id) => p.split(id).join(':excluded'), originalUrl.split('?')[0])}`,
          game: game || null,
          membership_ids: mids,
          excluded_ids: ownIds.length,
          instance_id: look.instanceId,
          status: res.statusCode,
          ms: Date.now() - started,
          rows: cov.rows ?? null,
          coverage_level: cov.level ?? null,
          coverage_source: cov.source ?? null,
          source: clientSource(req.headers['x-dc-client']),
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
