/**
 * Load an image URL as a data URL so html2canvas can export it.
 * Bungie CDN only allows CORS from bungie.net, so we try:
 * 1) same-origin /img|/common (dev proxy / edge rewrite)
 * 2) the original URL
 * 3) wsrv.nl as a CORS-enabled fetch of public Bungie art (share export only)
 */
export async function inlineImageDataUrl(
  url: string | null | undefined
): Promise<string | null> {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
    return url || null;
  }

  const candidates: string[] = [];
  let absolute = url;
  try {
    const parsed = new URL(url, typeof location !== 'undefined' ? location.href : 'https://destinychronicle.com');
    absolute = parsed.href;
    if (/bungie\.net$/i.test(parsed.hostname) || (typeof location !== 'undefined' && parsed.origin === location.origin)) {
      candidates.push(parsed.pathname + parsed.search);
    }
    candidates.push(parsed.href);
    if (/bungie\.net$/i.test(parsed.hostname)) {
      candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(parsed.href)}`);
    }
  } catch {
    candidates.push(url);
  }

  for (const src of candidates) {
    try {
      const res = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream' && blob.type !== '') {
        continue;
      }
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl?.startsWith('data:image')) return dataUrl;
      // Some proxies omit type; still accept JPEG/PNG magic via data URL from FileReader.
      if (dataUrl?.startsWith('data:application/octet-stream') || dataUrl?.startsWith('data:')) {
        return dataUrl.replace(/^data:application\/octet-stream/, 'data:image/jpeg');
      }
    } catch {
      // try next candidate
    }
  }
  return absolute.startsWith('data:') ? absolute : null;
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
