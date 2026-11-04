/**
 * Labels for the heatmap "Showing …" line and the Platform / Character "all" options.
 * When header account cards narrow the available set, "All platforms" is misleading —
 * name the scoped platforms (or count them) so cards and dropdowns stay in sync.
 */

export function describeScopedPlatforms(
  platformNames: string[],
  opts: { accountFilterActive: boolean; selectedName?: string | null } = {
    accountFilterActive: false,
  }
): string {
  if (opts.selectedName) {
    return opts.selectedName;
  }
  const names = platformNames.filter(Boolean);
  if (names.length === 0) {
    return 'All platforms';
  }
  if (names.length === 1) {
    return names[0];
  }
  if (opts.accountFilterActive) {
    return names.length <= 3 ? names.join(' · ') : `${names.length} platforms`;
  }
  return 'All platforms';
}

export function describeScopedCharacters(
  characterLabels: string[],
  opts: { accountFilterActive: boolean; selectedLabel?: string | null } = {
    accountFilterActive: false,
  }
): string {
  if (opts.selectedLabel) {
    return opts.selectedLabel;
  }
  const labels = characterLabels.filter(Boolean);
  if (labels.length === 0) {
    return 'All characters';
  }
  if (labels.length === 1) {
    return labels[0];
  }
  if (opts.accountFilterActive) {
    return `${labels.length} characters`;
  }
  return 'All characters';
}

export function buildHeatmapViewSummary(parts: {
  character: string;
  platform: string;
  year: string;
  season?: string | null;
  /** When a specific character is chosen, platform is redundant in the summary. */
  characterIsSpecific: boolean;
}): string {
  const out: string[] = [];
  out.push(parts.character);
  if (!parts.characterIsSpecific) {
    out.push(parts.platform);
  }
  out.push(parts.year);
  if (parts.season) {
    out.push(parts.season);
  }
  return out.join(' · ');
}
