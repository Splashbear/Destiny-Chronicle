/**
 * API server configuration from environment variables.
 */
export interface ApiConfig {
  port: number;
  
  // Archive paths (configurable via env vars)
  leanActivitiesPath: string;
  membershipPath: string;
  watermarkPath: string;
  playerActivitiesLitePath: string;
  
  // Multi-tier archive paths
  midLightExtractDir: string;
  compactIndexRoot: string;
  /** Brief 5 Option A: gap-fill ready/ root (20-col lean). Empty = disabled. */
  gapIndexRoot: string;
  /** W11: membership_id-sorted gap root; preferred per-bucket when complete. */
  gapIndexSortedRoot: string;
  /** When true, merge GAP_INDEX_ROOT lean rows with compact/lite results. */
  enableGapLean: boolean;
  
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
  PLAYER_ACTIVITIES_LITE_PATH: 'PLAYER_ACTIVITIES_LITE_PATH',
  MID_LIGHT_EXTRACT_DIR: 'MID_LIGHT_EXTRACT_DIR',
  COMPACT_INDEX_ROOT: 'COMPACT_INDEX_ROOT',
  GAP_INDEX_ROOT: 'GAP_INDEX_ROOT',
  GAP_INDEX_SORTED_ROOT: 'GAP_INDEX_SORTED_ROOT',
  ENABLE_GAP_LEAN: 'ENABLE_GAP_LEAN',
  BUNGIE_API_KEY: 'BUNGIE_API_KEY',
  BUNGIE_API_ROOT: 'BUNGIE_API_ROOT',
  ENABLE_CORS: 'PGCR_ENABLE_CORS',
  LOG_LEVEL: 'PGCR_LOG_LEVEL',
} as const;
