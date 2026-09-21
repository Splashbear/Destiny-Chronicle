/**
 * API server configuration from environment variables.
 */
export interface ApiConfig {
  port: number;
  
  // Travis-PC paths (configurable via env vars)
  leanActivitiesPath: string;
  membershipPath: string;
  watermarkPath: string;
  
  // Bungie API
  bungieApiKey: string;
  bungieApiRoot: string;
  
  // Server options
  enableCors: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Environment variable keys.
 */
export const ENV_KEYS = {
  PORT: 'PGCR_API_PORT',
  LEAN_ACTIVITIES_PATH: 'PGCR_LEAN_ACTIVITIES_PATH',
  MEMBERSHIP_PATH: 'PGCR_MEMBERSHIP_PATH',
  WATERMARK_PATH: 'PGCR_WATERMARK_PATH',
  BUNGIE_API_KEY: 'BUNGIE_API_KEY',
  BUNGIE_API_ROOT: 'BUNGIE_API_ROOT',
  ENABLE_CORS: 'PGCR_ENABLE_CORS',
  LOG_LEVEL: 'PGCR_LOG_LEVEL',
} as const;
