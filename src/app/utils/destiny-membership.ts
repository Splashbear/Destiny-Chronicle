/**
 * Bungie membership helpers shared by player search.
 * Type 254 (BungieNext) must use crossSaveOverride for Destiny2 Profile / history calls.
 */

export function effectiveMembershipType(m: {
  membershipType: number;
  crossSaveOverride?: number;
}): number {
  if (m.membershipType === 254 && m.crossSaveOverride && m.crossSaveOverride > 0) {
    return m.crossSaveOverride;
  }
  return m.membershipType;
}

/** True when GlobalName prefix search returned at least one destiny membership. */
export function prefixSearchHasDestinyMemberships(resp: {
  ErrorCode?: number;
  Response?: { searchResults?: Array<{ destinyMemberships?: unknown[] }> };
} | null | undefined): boolean {
  if (!resp || resp.ErrorCode !== 1) return false;
  const results = resp.Response?.searchResults;
  if (!Array.isArray(results) || results.length === 0) return false;
  return results.some(
    u => Array.isArray(u?.destinyMemberships) && u.destinyMemberships.length > 0,
  );
}

export interface LinkedDestinyProfile {
  membershipType: number;
  membershipId: string;
  displayName?: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: number | string;
  isCrossSavePrimary?: boolean;
  crossSaveOverride?: number;
}

/**
 * Map LinkedProfiles.profiles into D2 search rows.
 * Used when D2 name search is empty but D1 SearchDestinyPlayer still finds a
 * legacy gamertag (e.g. Hollz333) — LinkedProfiles still returns the D2 mid.
 */
export function mapLinkedProfilesToD2SearchRows(
  profiles: LinkedDestinyProfile[] | null | undefined,
  fallbackDisplayName?: string,
): Array<{
  displayName: string;
  membershipId: string;
  membershipType: number;
  game: 'D2';
  isCrossSavePrimary?: boolean;
  crossSaveOverride?: number;
}> {
  if (!Array.isArray(profiles) || profiles.length === 0) return [];
  const out: Array<{
    displayName: string;
    membershipId: string;
    membershipType: number;
    game: 'D2';
    isCrossSavePrimary?: boolean;
    crossSaveOverride?: number;
  }> = [];
  const seen = new Set<string>();
  for (const p of profiles) {
    if (!p?.membershipId) continue;
    const membershipType = effectiveMembershipType(p);
    const key = `${membershipType}|${p.membershipId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hasBungieName =
      !!p.bungieGlobalDisplayName &&
      p.bungieGlobalDisplayNameCode !== undefined &&
      p.bungieGlobalDisplayNameCode !== null &&
      String(p.bungieGlobalDisplayNameCode).length > 0;
    const displayName = hasBungieName
      ? `${p.bungieGlobalDisplayName}#${p.bungieGlobalDisplayNameCode}`
      : (p.displayName || fallbackDisplayName || 'Unknown');
    out.push({
      displayName,
      membershipId: p.membershipId,
      membershipType,
      game: 'D2',
      isCrossSavePrimary: p.isCrossSavePrimary,
      crossSaveOverride: p.crossSaveOverride,
    });
  }
  return out;
}
