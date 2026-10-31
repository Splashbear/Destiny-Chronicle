/** Privacy-safe platform label for account_lookup analytics (CODE_CLEANUP_SPEC). */
export function platformLabelForAnalytics(platform: string): string {
  const p = (platform || '').toLowerCase();
  if (p.includes('xbox')) return 'xbox';
  if (p.includes('playstation') || p === 'psn') return 'psn';
  if (p.includes('steam')) return 'steam';
  if (p.includes('epic')) return 'egs';
  if (p.includes('stadia')) return 'stadia';
  if (p.includes('blizzard')) return 'blizzard';
  if (!p || p === 'unknown') return 'unknown';
  return 'other';
}

export function aggregateLookupPlatform(platforms: string[]): string {
  const labels = [...new Set(platforms.map((p) => platformLabelForAnalytics(p)))];
  if (labels.length === 0) return 'unknown';
  if (labels.length === 1) return labels[0];
  return 'mixed';
}

export function aggregateLookupGame(
  games: Array<'D1' | 'D2'>
): 'D1' | 'D2' | 'mixed' {
  const uniq = [...new Set(games)];
  if (uniq.length === 1) return uniq[0];
  if (uniq.length === 0) return 'D2';
  return 'mixed';
}

export function resolveLookupSource(
  sources: Set<'archive' | 'bungie'>
): 'archive' | 'bungie' | 'mixed' {
  const hasArchive = sources.has('archive');
  const hasBungie = sources.has('bungie');
  if (hasArchive && hasBungie) return 'mixed';
  if (hasArchive) return 'archive';
  return 'bungie';
}
