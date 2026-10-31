/**
 * Resolve a PGCR / activity image URL from a referenceId via the manifest.
 */
export function resolveActivityPgcrImage(opts: {
  referenceId: string | number | undefined | null;
  isD1: boolean;
  getPgcrImage: (refId: string | number, isD1: boolean) => string | null | undefined;
  resolveAssetUrl?: (path: string) => string;
}): string | null {
  const { referenceId, isD1, getPgcrImage, resolveAssetUrl } = opts;
  if (!referenceId) return null;
  const path = getPgcrImage(referenceId, isD1);
  if (!path) return null;
  if (isD1 || !resolveAssetUrl) return path;
  return resolveAssetUrl(path);
}
