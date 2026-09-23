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
  /** Route Bungie API calls through proxy.conf.js so 127.0.0.1 and localhost both work. */
  useBungieDevProxy: true,
  analytics: {
    googleMeasurementId: '',
    cloudflareToken: ''
  },
  // Experimental external PGCR API integration (disabled by default in dev)
  pgcrApiRoot: '',
  pgcrApiKey: '',
  useExternalPgcr: false,
  /** 
   * When true, use the external archive API to fetch pre-indexed player activities
   * for faster cold-start loading. Falls back to Bungie API for memberships with
   * no archived data or for activities above the archive watermark.
   * Archive API should be running at pgcrApiRoot (e.g., http://localhost:3001)
   */
  useArchiveActivities: false,
  /** When true, app runs from an imported offline archive (no Bungie API). */
  offlineMode: false,
  archiveRoot: ''
};