import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  USERNAME_SEARCH_MAX_RESULTS,
  USERNAME_SEARCH_MIN_CHARS,
  UsernameSearchService,
} from '../services/username-search.service';
import { logger } from '../utils/logger';

/**
 * GET /players/search-by-name?q=hollz
 * Does not log the query text (Bot: only which mid was loaded later on the client).
 */
export function createUsernameSearchRouter(svc: UsernameSearchService): Router {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 60_000,
    max: Number(process.env.USERNAME_SEARCH_RATE_PER_MIN || 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many username searches. Try again shortly.' },
  });

  router.get('/search-by-name', limiter, async (req: Request, res: Response) => {
    try {
      if (!svc.isReady()) {
        return res.status(503).json({
          error: 'unavailable',
          message: 'Archive username search index is not configured or not built.',
        });
      }
      const q = String(req.query.q ?? '').trim();
      if (q.length < USERNAME_SEARCH_MIN_CHARS) {
        return res.status(400).json({
          error: 'query_too_short',
          message: `Query must be at least ${USERNAME_SEARCH_MIN_CHARS} characters.`,
          minChars: USERNAME_SEARCH_MIN_CHARS,
        });
      }
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(USERNAME_SEARCH_MAX_RESULTS, Math.max(1, Math.floor(limitRaw)))
        : USERNAME_SEARCH_MAX_RESULTS;

      const results = await svc.search(q, limit);
      // Never log the query text (Bot) — hit count only.
      logger.info('Username search', { hitCount: results.length });
      return res.json({
        results,
        limit,
        nameSource: 'archive_index',
      });
    } catch (error) {
      logger.error('Username search failed', { error: String(error) });
      return res.status(500).json({ error: 'search_failed', message: 'Username search failed.' });
    }
  });

  return router;
}
