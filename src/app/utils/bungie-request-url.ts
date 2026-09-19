import { environment } from '../../environments/environment';

const PROXY_HOSTS = new Set(['www.bungie.net', 'stats.bungie.net']);

/** Rewrite an exact Bungie host to a same-origin path. Rejects lookalike hosts. */
export function toSameOriginBungiePath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  if (!PROXY_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
}

/** In ng serve, rewrite Bungie URLs to same-origin paths handled by proxy.conf.js. */
export function bungieRequestUrl(url: string): string {
  if (!environment.useBungieDevProxy) {
    return url;
  }
  return toSameOriginBungiePath(url) ?? url;
}
