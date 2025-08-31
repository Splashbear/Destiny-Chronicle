export const environment = {
  production: true,
  debug: false,
  bungie: {
    API_KEY: '60135b04ed3e4f59908ae911cfca844e',  // New production API key
    API_ROOT: 'https://www.bungie.net/Platform'
  },
  // Production-specific settings
  testMode: false,
  baseHref: '/Destiny-Chronicle/',
  mockData: {
    enabled: false
  }
}; 