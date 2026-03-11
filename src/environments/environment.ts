export const environment = {
  production: false,
  debug: true,
  bungie: {
    API_KEY: '60135b04ed3e4f59908ae911cfca844e',  // New development API key
    API_ROOT: 'https://www.bungie.net/Platform'
  },
  analytics: {
    googleMeasurementId: '',
    cloudflareToken: ''
  },
  // Experimental external PGCR API integration (disabled by default in dev)
  pgcrApiRoot: '',        // e.g. 'https://pgcr-api.example.com'
  useExternalPgcr: false  // set true to enable calling external PGCR API
}; 