import crypto from 'crypto';
import fs from 'fs';
import { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * GET /admin/usage (W29 usage summary).
 *
 * The connection source address is NOT trusted: behind a Cloudflare tunnel every
 * request arrives from 127.0.0.1. Access requires:
 *   - USAGE_ADMIN=true (off by default -> 404)
 *   - USAGE_ADMIN_TOKEN set (unset -> 404, route effectively disabled)
 *   - header `x-usage-admin-token` equal to USAGE_ADMIN_TOKEN (constant-time compare)
 * Requests with proxy/Cloudflare headers are refused unless the token matches.
 * The token is never accepted from the query string. The route is rate limited.
 */
export const USAGE_ADMIN_HEADER = 'x-usage-admin-token';
const PROXY_HEADERS = ['cf-connecting-ip', 'x-forwarded-for', 'cf-ray', 'forwarded', 'x-real-ip'];

export interface UsageAdminDecision {
  status: number;
  error?: string;
}

function tokenMatches(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b) && given.length === expected.length;
}

export function checkUsageAdminRequest(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): UsageAdminDecision {
  if (env.USAGE_ADMIN !== 'true') return { status: 404, error: 'Not found' };
  const expected = env.USAGE_ADMIN_TOKEN || '';
  if (expected.length < 16) return { status: 404, error: 'Not found' };
  const raw = headers[USAGE_ADMIN_HEADER];
  const given = Array.isArray(raw) ? raw[0] || '' : raw || '';
  const ok = given.length > 0 && tokenMatches(given, expected);
  if (ok) return { status: 200 };
  const proxied = PROXY_HEADERS.some((h) => headers[h] !== undefined);
  if (proxied) return { status: 403, error: 'forbidden' };
  return { status: 401, error: 'unauthorized' };
}

export function installUsageAdminRoute(app: Express, opts: { windowMs?: number; limit?: number } = {}): void {
  const limiter = rateLimit({
    windowMs: opts.windowMs ?? 60_000,
    limit: opts.limit ?? 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: () => 'usage-admin',
  });
  app.get('/admin/usage', limiter, (req: Request, res: Response) => {
    const decision = checkUsageAdminRequest(req.headers);
    if (decision.status !== 200) {
      return res.status(decision.status).json({ error: decision.error });
    }
    const summary = process.env.USAGE_SUMMARY_PATH || '';
    if (!summary || !fs.existsSync(summary)) {
      return res.json({ status: 'no-summary-yet' });
    }
    return res.type('text/markdown').send(fs.readFileSync(summary, 'utf8'));
  });
}