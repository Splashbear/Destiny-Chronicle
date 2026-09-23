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
    
    // Bungie API - REQUIRED via environment variable
    bungieApiKey: process.env[ENV_KEYS.BUNGIE_API_KEY] || '',
    bungieApiRoot: process.env[ENV_KEYS.BUNGIE_API_ROOT] || 'https://www.bungie.net/Platform',
    
    // Server options
    enableCors: process.env[ENV_KEYS.ENABLE_CORS] === 'true',
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
