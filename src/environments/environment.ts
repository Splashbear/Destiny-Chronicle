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
  // Dev server proxies /dc-archive to the public archive (see proxy.conf.js).
  pgcrApiRoot: '/dc-archive',
  pgcrApiKey: '',
  useExternalPgcr: true,
  /** 
   * When true, use the external archive API to fetch pre-indexed player activities
   * for faster cold-start loading. Falls back to Bungie API for memberships with
   * no archived data or for activities above the archive watermark.
   * Dev archive calls go through pgcrApiRoot (/dc-archive on ng serve).
   */
  useArchiveActivities: true,
  /**
   * W2/W12/W31: After a D2 archive hit, fetch Bungie history newest-first and
   * stop at archiveCompleteBelowIid (10B), not the player's newest archived
   * game. That fills compact holes in 10B–16B and games newer than the
   * watermark. D1 still full-crawls. Known sub-10B holes stay on-demand.
   * Full crawl only when the archive is absent.
   */
  archiveBungieDeltaFill: true,
  /**
   * W55: D1 account load reads older history from the archive API, then still
   * full-crawls live Bungie. Off by default. D1 coverage is never treated as
   * complete. D2 is unchanged.
   */
  enableD1Archive: false,
  /**
   * Played With tab. On so the local server matches the live site.
   * Requests go through the /dc-archive proxy.
   */
  enablePlayedWith: true,
  /** When true, app runs from an imported offline archive (no Bungie API). */
  offlineMode: false,
  archiveRoot: ''
};