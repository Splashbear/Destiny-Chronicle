import { ApiConfig, ENV_KEYS } from '../types/config.types';

/**
 * Load configuration from environment variables with sensible defaults.
 */
export function loadConfig(): ApiConfig {
  const leanActivitiesPath = process.env[ENV_KEYS.LEAN_ACTIVITIES_PATH] || '';
  const playerActivitiesLitePath = process.env[ENV_KEYS.PLAYER_ACTIVITIES_LITE_PATH] || '';
  
  const config: ApiConfig = {
    port: parseInt(process.env[ENV_KEYS.PORT] || '3001', 10),
    
    // Archive paths - MUST be configured in production
    leanActivitiesPath,
    membershipPath: process.env[ENV_KEYS.MEMBERSHIP_PATH] || '',
    watermarkPath: process.env[ENV_KEYS.WATERMARK_PATH] || '',
    playerActivitiesLitePath: playerActivitiesLitePath || leanActivitiesPath,
    
    // Multi-tier archive paths
    midLightExtractDir: process.env[ENV_KEYS.MID_LIGHT_EXTRACT_DIR] || '',
    compactIndexRoot: process.env[ENV_KEYS.COMPACT_INDEX_ROOT] || '',
    gapIndexRoot: process.env[ENV_KEYS.GAP_INDEX_ROOT] || '',
    gapIndexSortedRoot: process.env[ENV_KEYS.GAP_INDEX_SORTED_ROOT] || '',
    // Default OFF — staging on :3002 sets ENABLE_GAP_LEAN=true; live :3001 must not.
    enableGapLean: process.env[ENV_KEYS.ENABLE_GAP_LEAN] === 'true',
    gapRelaxComplete: process.env[ENV_KEYS.GAP_RELAX_COMPLETE] === 'true',
    
    // Destiny 1 index paths (off by default)
    d1IndexRoot: process.env[ENV_KEYS.D1_INDEX_ROOT] || '',
    d1PlayedWithRoot: process.env[ENV_KEYS.D1_PLAYED_WITH_ROOT] || '',
    
    // Bungie API - REQUIRED via environment variable
    bungieApiKey: process.env[ENV_KEYS.BUNGIE_API_KEY] || '',
    bungieApiRoot: process.env[ENV_KEYS.BUNGIE_API_ROOT] || 'https://www.bungie.net/Platform',
    
    // Fix-on-view for flagged PGCRs
    flagLookupRoot: process.env[ENV_KEYS.FLAG_LOOKUP_ROOT] || '',
    pgcrOverrideStoreRoot: process.env[ENV_KEYS.PGCR_OVERRIDE_STORE_ROOT] || '',
    fixOnViewEnabled: process.env[ENV_KEYS.FIX_ON_VIEW_ENABLED] === 'true',
    fixOnViewWaitMs: parseInt(process.env[ENV_KEYS.FIX_ON_VIEW_WAIT_MS] || '2000', 10),
    flagFilter: (process.env[ENV_KEYS.FLAG_FILTER] === 'sharp' ? 'sharp' : 'all') as 'all' | 'sharp',
    
    // Server options
    enableCors: process.env[ENV_KEYS.ENABLE_CORS] === 'true',
    corsOrigin: process.env[ENV_KEYS.CORS_ORIGIN] || '',
    logLevel: (process.env[ENV_KEYS.LOG_LEVEL] as ApiConfig['logLevel']) || 'info',
  };
  
  return config;
}

/**
 * Validate that required configuration is present.
 */
export function validateConfig(config: ApiConfig): string[] {
  const errors: string[] = [];
  
  const hasArchivePath = !!(config.leanActivitiesPath || config.playerActivitiesLitePath);
  const hasValidApiKey = config.bungieApiKey && 
    !config.bungieApiKey.includes('placeholder') && 
    !config.bungieApiKey.includes('test_');
  
  if (!hasValidApiKey && !hasArchivePath) {
    errors.push('BUNGIE_API_KEY is required when archive paths are not configured');
  }
  
  // Note: Archive paths are optional - server can work with live Bungie API only
  // but will log warnings if archive is not configured
  
  return errors;
}
