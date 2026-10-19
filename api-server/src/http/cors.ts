import { Express, Request, Response, NextFunction } from 'express';

/** Browser preflight must allow the client label header. */
export const CORS_ALLOW_HEADERS = 'Content-Type, X-API-Key, X-DC-Client';

export function installCors(app: Express, opts: { enable: boolean; origin: string }): void {
  if (!opts.enable) return;
  const allowed = opts.origin
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (allowed.length === 0) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (origin && allowed.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
    if (req.method === 'OPTIONS') {
      return res.sendStatus(origin && allowed.length && !allowed.includes(origin) ? 403 : 200);
    }
    next();
  });
}
