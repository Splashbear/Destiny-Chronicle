/** Sort year keys newest-first (CODE_CLEANUP_SPEC). */
export function getSortedYears(yearGroups: Record<string, unknown>): string[] {
  return Object.keys(yearGroups).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
}

const PREFERRED_TYPE_ORDER = [
  'Raid',
  'Dungeon',
  'Nightfall',
  'Strike',
  'Crucible',
  'Other',
];

/** Sort activity type keys with preferred order, non-empty only. */
export function getSortedTypes(
  typeGroups: Record<string, { length?: number } | unknown[]>
): string[] {
  const filteredTypes = Object.keys(typeGroups).filter((type) => {
    const group = typeGroups[type] as { length?: number } | unknown[] | null;
    return group && (group as any).length > 0;
  });
  return filteredTypes.sort((a, b) => {
    const aIdx = PREFERRED_TYPE_ORDER.indexOf(a);
    const bIdx = PREFERRED_TYPE_ORDER.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}
