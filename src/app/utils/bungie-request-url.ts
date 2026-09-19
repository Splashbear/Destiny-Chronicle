import { environment } from '../../environments/environment';

const BUNGIE_ORIGIN = 'https://www.bungie.net';
const STATS_ORIGIN = 'https://stats.bungie.net';

/** In ng serve, rewrite Bungie URLs to same-origin paths handled by proxy.conf.js. */
export function bungieRequestUrl(url: string): string {
  if (!environment.useBungieDevProxy) {
    return url;
  }
  if (url.startsWith(BUNGIE_ORIGIN)) {
    return url.slice(BUNGIE_ORIGIN.length) || '/';
  }
  // D2 PGCRs historically use stats.bungie.net; the /Platform proxy still serves them.
  if (url.startsWith(STATS_ORIGIN)) {
    return url.slice(STATS_ORIGIN.length) || '/';
  }
  return url;
}
