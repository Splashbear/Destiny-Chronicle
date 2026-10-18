export const environment = {
  production: true,
  debug: false,
  traceGuardianFirsts: false,
  bungie: {
    API_KEY: 'e55082388d014a79b9f5da4be0063d1c',  // Bungie API key (production)
    API_ROOT: 'https://www.bungie.net/Platform'
  },
  useBungieDevProxy: false,
  // Production-specific settings
  testMode: false,
  baseHref: '/',
  mockData: {
    enabled: false
  },
  // Analytics - see docs/analytics-setup.md for setup instructions
  analytics: {
    googleMeasurementId: 'G-C9CRM83JS2',
    cloudflareToken: ''       // e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  },
  // External PGCR API integration (disabled by default until configured)
  pgcrApiRoot: 'https://api.destinychronicle.com',
  pgcrApiKey: '',
  useExternalPgcr: true,
  /** 
   * When true, use the external archive API to fetch pre-indexed player activities
   * for faster cold-start loading. Falls back to Bungie API for memberships with
   * no archived data or for activities above the archive watermark.
   */
  useArchiveActivities: true,
  /**
   * W2/W12/W31: D2 Bungie catch-up stops at archiveCompleteBelowIid (10B),
   * not the player's newest archived game, so 10Bâ€“16B holes are not skipped.
   * D1 still full-crawls. Off only if this flag is set false.
   */
  archiveBungieDeltaFill: true,
  /**
   * W55: D1 archive read. Off on the live site. Turn on only for a test build.
   * D2 archive behavior is unchanged.
   */
  enableD1Archive: false,
  /** Played With tab + archive summary API (queued builds for cold accounts). */
  enablePlayedWith: true,
  offlineMode: false,
  archiveRoot: ''
}; 