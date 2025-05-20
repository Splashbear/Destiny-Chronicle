export const environment = {
  production: false,
  debug: true,
  bungie: {
    API_KEY: 'e55082388d014a79b9f5da4be0063d1c',
    API_ROOT: 'https://www.bungie.net/Platform'
  },
  // Test-specific settings
  testMode: true,
  baseHref: '/test/',
  // Add any test-specific endpoints or mock data here
  mockData: {
    enabled: true,
    // Add mock data paths if needed
  }
}; 