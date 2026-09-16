import { environment } from '../../environments/environment';

const BUNGIE_ORIGIN = 'https://www.bungie.net';

/** In ng serve, rewrite Bungie URLs to same-origin paths handled by proxy.conf.js. */
export function bungieRequestUrl(url: string): string {
  if (!environment.useBungieDevProxy) {
    return url;
  }
  if (url.startsWith(BUNGIE_ORIGIN)) {
    return url.slice(BUNGIE_ORIGIN.length) || '/';
  }
  return url;
}
