import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { loadConfig, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import { ArchiveService } from './services/archive.service';
import { BungieApiService } from './services/bungie-api.service';
import { WatermarkService } from './services/watermark.service';
import { FlagLookupService } from './services/flag-lookup.service';
import { PgcrOverrideStore } from './services/pgcr-override.store';
import { FixOnViewService } from './services/fix-on-view.service';
import { PlayedWithRebuildMarker } from './services/played-with-rebuild-marker';
import { createPgcrRouter } from './routes/pgcr.routes';
import { createDcPgcrRouter } from './routes/dc-pgcr.routes';
import { createPlayerActivitiesRouter } from './routes/player-activities.routes';
import { createPlayedWithRouter } from './routes/played-with.routes';
import { loadPlayedWithConfig, PlayedWithService } from './services/played-with.service';
import { SummaryStore } from './services/played-with-summary.store';
import { PartnerNameRefresher } from './services/partner-name-refresh.service';
import { installCors } from './http/cors';
import { freeGiB, installApiGuard, serverStartedAt, SELF_CHECK_TOKEN } from './usage/usage';
import { startMaintenance } from './usage/maintenance';
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

  installCors(app, { enable: config.enableCors, origin: config.corsOrigin });

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
    config.gapRelaxComplete,
    config.d1IndexRoot
  );
  await archiveService.initialize();

  const bungieApiService = new BungieApiService(config.bungieApiKey, config.bungieApiRoot);

  const watermarkService = new WatermarkService(config.watermarkPath);
  await watermarkService.load();

  // Fix-on-view services (optional)
  let fixOnViewService: FixOnViewService | undefined;
  let overrideStore: PgcrOverrideStore | undefined;
  if (config.fixOnViewEnabled) {
    const flagLookup = new FlagLookupService(config.flagLookupRoot, config.flagFilter);
    await flagLookup.initialize();

    overrideStore = new PgcrOverrideStore(config.pgcrOverrideStoreRoot);
    await overrideStore.initialize();

    if (flagLookup.isAvailable() && overrideStore.isAvailable()) {
      // Create rebuild marker if Played With is configured
      const playedWithConfig = loadPlayedWithConfig();
      const summaryDir = (process.env.PLAYED_WITH_SUMMARY_DIR || '').trim();
      const rebuildMarker = summaryDir
        ? new PlayedWithRebuildMarker(overrideStore, new SummaryStore(summaryDir))
        : undefined;

      fixOnViewService = new FixOnViewService(
        flagLookup,
        overrideStore,
        bungieApiService,
        {
          firstViewWaitMs: config.fixOnViewWaitMs,
          asyncFix: false,
        },
        rebuildMarker,
        archiveService
      );
      logger.info('Fix-on-view enabled', {
        flaggedIds: flagLookup.getStats().totalFlaggedIds,
        existingOverrides: overrideStore.getStats().totalOverrides,
        waitMs: config.fixOnViewWaitMs,
        filterMode: config.flagFilter,
        rebuildMarking: !!rebuildMarker,
      });
    } else {
      logger.warn('Fix-on-view enabled but services not available', {
        flagLookupAvailable: flagLookup.isAvailable(),
        overrideStoreAvailable: overrideStore.isAvailable(),
      });
    }
  }

  // DC-facing routes (PgcrLite format for Angular app)
  app.use('/pgcr', createDcPgcrRouter(archiveService, bungieApiService, watermarkService, fixOnViewService));

  // Player activities routes (light format for cold-start optimization)
  app.use('/players', createPlayerActivitiesRouter(archiveService, watermarkService));

  // Played With (optional): legacy 0-10B + compact 10-16B band indexes, routed by instance id.
  const playedWithConfig = loadPlayedWithConfig();
  if (playedWithConfig) {
    // NameResolver: check override store first, then archive
    const nameResolver = async (instanceId: string, membershipId: string) => {
      // Check override store if available
      if (overrideStore && overrideStore.exists(instanceId, 'D2')) {
        try {
          const pgcr = overrideStore.get(instanceId, 'D2');
          const response = pgcr?.Response;
          const entries = response?.entries || [];
          const hit = entries.find(
            (e: any) => String(e.player?.destinyUserInfo?.membershipId) === membershipId
          );
          if (hit) {
            const name = String(hit.player?.destinyUserInfo?.displayName || '').trim();
            if (name) return name;
          }
        } catch (error) {
          logger.warn('Failed to resolve name from override', { instanceId, membershipId, error });
        }
      }

      // Fallback to archive
      const rows = await archiveService.getActivitiesByInstanceId(instanceId, 'D2');
      const hit = rows.find((r) => String(r.membership_id) === membershipId && r.display_name);
      return hit ? hit.display_name : null;
    };

    const playedWith = new PlayedWithService(playedWithConfig, nameResolver);
    const summaryDir = (process.env.PLAYED_WITH_SUMMARY_DIR || '').trim();
    // Live current-name refresh for each page's top partners (PLAYED_WITH_NAME_REFRESH_TOP=0 disables).
    const refreshTop = Number(process.env.PLAYED_WITH_NAME_REFRESH_TOP ?? 25);
    const nameCache = (process.env.PLAYED_WITH_NAME_CACHE || '').trim()
      || path.join(summaryDir || playedWithConfig.tempDir || '.', 'partner_names_cache.json');
    const names = refreshTop > 0
      ? new PartnerNameRefresher((mid) => bungieApiService.getCurrentDisplayName(mid), {
          cacheFile: nameCache, top: refreshTop,
          concurrency: Number(process.env.PLAYED_WITH_NAME_REFRESH_CONCURRENCY || 8),
          budgetMs: Number(process.env.PLAYED_WITH_NAME_REFRESH_BUDGET_MS || 4000),
          maxCallsPerMinute: Number(process.env.PLAYED_WITH_NAME_REFRESH_PER_MIN || 120),
        })
      : null;
    app.use('/played-with', createPlayedWithRouter(archiveService, playedWith, summaryDir ? new SummaryStore(summaryDir) : null, names));
    logger.info('Played With enabled', {
      legacy: !!playedWithConfig.legacyRoot,
      compact: !!playedWithConfig.compactRoot,
      splitIid: playedWithConfig.splitIid,
    });
  }

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
    startMaintenance({
      port: config.port,
      gapRoot: config.gapIndexRoot,
      compactRoot: config.compactIndexRoot,
      watermarkPath: config.watermarkPath,
      expectComplete: parseInt(process.env.HEALTH_EXPECT_COMPLETE || '256', 10),
      minFreeGiB: parseInt(process.env.HEALTH_MIN_FREE_GIB || '50', 10),
      sampleMid: process.env.HEALTH_SAMPLE_MID || '',
      sampleGame: process.env.HEALTH_SAMPLE_GAME || 'D2',
      logDir: process.env.USAGE_LOG_DIR || '',
      outDir: process.env.USAGE_OUT_DIR || '',
      retentionDays: parseInt(process.env.USAGE_RETAIN_DAYS || '180', 10),
      checkHourEt: parseInt(process.env.HEALTH_CHECK_HOUR_ET || '4', 10),
      freeGiB,
      selfToken: SELF_CHECK_TOKEN,
    });
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
