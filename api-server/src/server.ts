import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import { loadConfig, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import { ArchiveService } from './services/archive.service';
import { BungieApiService } from './services/bungie-api.service';
import { WatermarkService } from './services/watermark.service';
import { createPgcrRouter } from './routes/pgcr.routes';
import { createDcPgcrRouter } from './routes/dc-pgcr.routes';
import { createPlayerActivitiesRouter } from './routes/player-activities.routes';
import { freeGiB, installApiGuard, serverStartedAt } from './usage/usage';
import { installUsageAdminRoute } from './usage/usage-admin';

function fsExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

async function startServer(): Promise<void> {
  const config = loadConfig();
  logger.setLevel(config.logLevel);

  logger.info('Starting Destiny Chronicle PGCR API Server');
  logger.info('Configuration loaded', {
    port: config.port,
    archiveConfigured: !!(config.leanActivitiesPath && config.membershipPath),
    watermarkConfigured: !!config.watermarkPath,
    enableGapLean: config.enableGapLean,
    gapIndexRoot: config.gapIndexRoot || '(none)',
  });

  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    logger.error('Configuration errors', { errors: configErrors });
    process.exit(1);
  }

  const app: Express = express();

  if (config.enableCors) {
    const allowed = config.corsOrigin
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    app.use((req: Request, res: Response, next) => {
      const origin = req.headers.origin;
      if (allowed.length === 0) {
        res.header('Access-Control-Allow-Origin', '*');
      } else if (origin && allowed.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
      }
      // If Origin is present but not allowlisted, omit ACAO (browser blocks).
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(origin && allowed.length && !allowed.includes(origin) ? 403 : 200);
      }
      next();
    });
  }

  app.use(express.json());
  installApiGuard(app);

  app.use((req: Request, res: Response, next) => {
    logger.debug(`${req.method} ${req.path}`, { query: req.query });
    next();
  });

  const archiveService = new ArchiveService(
    config.leanActivitiesPath,
    config.membershipPath,
    config.playerActivitiesLitePath,
    config.midLightExtractDir,
    config.compactIndexRoot,
    config.gapIndexRoot,
    config.enableGapLean,
    config.gapIndexSortedRoot,
    config.gapRelaxComplete
  );
  await archiveService.initialize();

  const bungieApiService = new BungieApiService(config.bungieApiKey, config.bungieApiRoot);

  const watermarkService = new WatermarkService(config.watermarkPath);
  await watermarkService.load();

  // DC-facing routes (PgcrLite format for Angular app)
  app.use('/pgcr', createDcPgcrRouter(archiveService, bungieApiService, watermarkService));

  // Player activities routes (light format for cold-start optimization)
  app.use('/players', createPlayerActivitiesRouter(archiveService, watermarkService));

  // Admin/debug routes (lean format)
  app.use('/api/pgcr', createPgcrRouter(archiveService, bungieApiService, watermarkService));

  app.get('/health', (req: Request, res: Response) => {
    const dataRoot = config.compactIndexRoot || config.gapIndexRoot || config.leanActivitiesPath;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      archive_available: archiveService.isAvailable(),
      watermark_loaded: watermarkService.getWatermark() !== null,
      gap_lean_enabled: archiveService.isGapLeanEnabled(),
      gap_index_configured: !!archiveService.getGapIndexRoot(),
      data_root_readable: dataRoot ? fsExists(dataRoot) : false,
      free_gib: freeGiB(dataRoot),
      started_at: serverStartedAt(),
      version: '1.0.0',
      port: config.port,
    });
  });

  installUsageAdminRoute(app);

  app.get('/', (req: Request, res: Response) => {
    res.json({
      name: 'Destiny Chronicle PGCR API',
      version: '1.0.0',
      endpoints: {
        health: 'GET /health',
        dc_instance: 'GET /pgcr/:instanceId?game=D2&format=lite',
        dc_batch: 'POST /pgcr/batch',
        player_activities: 'GET /players/:membershipId/activities?game=D2&from=2021-01-01&to=2021-12-31&limit=1000',
        player_activities_batch: 'POST /players/activities/batch',
        admin_watermark: 'GET /api/pgcr/watermark',
        admin_activities: 'GET /api/pgcr/activities?membershipId=<membershipId>',
        admin_instance: 'GET /api/pgcr/:instanceId',
      },
    });
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
    });
  });

  app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`);
    logger.info('DC-facing endpoints (PgcrLite format):');
    logger.info(`  GET  http://localhost:${config.port}/pgcr/:instanceId?game=D2&format=lite`);
    logger.info(`  POST http://localhost:${config.port}/pgcr/batch`);
    logger.info('Player activities endpoints (light format):');
    logger.info(`  GET  http://localhost:${config.port}/players/:membershipId/activities`);
    logger.info(`  POST http://localhost:${config.port}/players/activities/batch`);
    logger.info('Admin/debug endpoints (lean format):');
    logger.info(`  GET  http://localhost:${config.port}/api/pgcr/watermark`);
    logger.info(`  GET  http://localhost:${config.port}/api/pgcr/activities?membershipId=<id>`);
    logger.info(`  GET  http://localhost:${config.port}/api/pgcr/:instanceId`);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});
