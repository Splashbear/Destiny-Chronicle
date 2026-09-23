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
  baseHref: '/Destiny-Chronicle/',
  mockData: {
    enabled: false
  },
  // Analytics - see docs/analytics-setup.md for setup instructions
  analytics: {
    googleMeasurementId: 'G-C9CRM83JS2',
    cloudflareToken: ''       // e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  },
  // External PGCR API integration (disabled by default until configured)
  pgcrApiRoot: '',        // e.g. 'https://pgcr-api.example.com' or 'http://localhost:3001'
  pgcrApiKey: '',
  useExternalPgcr: false,  // set true to enable calling external PGCR API
  /** 
   * When true, use the external archive API to fetch pre-indexed player activities
   * for faster cold-start loading. Falls back to Bungie API for memberships with
   * no archived data or for activities above the archive watermark.
   */
  useArchiveActivities: false,
  offlineMode: false,
  archiveRoot: ''
}; 