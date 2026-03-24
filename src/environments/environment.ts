export const environment = {
  production: false,
  /** Verbose sync/PGCR/activity logs in services & player-search. */
  debug: false,
  /**
   * Structured `[Firsts·trace]` logs for Guardian Firsts (IndexedDB → raid/dungeon candidates → PGCR batch → story milestones).
   * When `debug` is false, `main.ts` still enables `console.log` if this is true so you can follow the pipeline in DevTools.
   */
  traceGuardianFirsts: false,
  bungie: {
    API_KEY: 'e55082388d014a79b9f5da4be0063d1c',  // Bungie API key (dev & LAN)
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