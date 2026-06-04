export const environment = {
  production: true,
  debug: false,
  traceGuardianFirsts: false,
  bungie: {
    API_KEY: 'e55082388d014a79b9f5da4be0063d1c',  // Bungie API key (production)
    API_ROOT: 'https://www.bungie.net/Platform'
  },
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
  pgcrApiRoot: '',        // e.g. 'https://pgcr-api.example.com'
  useExternalPgcr: false,  // set true to enable calling external PGCR API
  offlineMode: false,
  archiveRoot: ''
}; 