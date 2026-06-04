/** FNV-1a hash for stable asset filenames from Bungie CDN paths. */
export function hashAssetPath(path: string): string {
  let h = 2166136261;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function extensionFromBungiePath(path: string): string {
  const q = path.split('?')[0];
  const dot = q.lastIndexOf('.');
  if (dot >= 0 && dot > q.lastIndexOf('/')) {
    const ext = q.slice(dot).toLowerCase();
    if (ext.length <= 5) {
      return ext;
    }
  }
  return '.jpg';
}

export function normalizeBungiePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath || typeof urlOrPath !== 'string') {
    return null;
  }
  const trimmed = urlOrPath.trim();
  if (!trimmed || trimmed.startsWith('assets/') || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return null;
  }
  if (trimmed.startsWith('https://www.bungie.net')) {
    return trimmed.slice('https://www.bungie.net'.length);
  }
  if (trimmed.startsWith('http://www.bungie.net')) {
    return trimmed.slice('http://www.bungie.net'.length);
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  return null;
}

export const BUNGIE_ORIGIN = 'https://www.bungie.net';

export function bungieAbsoluteUrl(path: string): string {
  if (path.startsWith('http')) {
    return path;
  }
  return path.startsWith('/') ? BUNGIE_ORIGIN + path : path;
}
