import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { getPlatformName } from './platform-name';

export interface PlayerSearchBundle {
  d1: PlayerSearchDisplay[];
  d2: PlayerSearchDisplay[];
  crossSave: PlayerSearchDisplay | null;
}

/** Deduplicate by game|membershipId (D1 and D2 can share an id). */
export function dedupePlayerSearchDisplay(arr: PlayerSearchDisplay[]): PlayerSearchDisplay[] {
  const seen = new Set<string>();
  const out: PlayerSearchDisplay[] = [];
  for (const p of arr) {
    const key = `${(p as any).game || 'D2'}|${p.membershipId}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

export function playerSearchKey(p: { membershipId: string; game?: 'D1' | 'D2' }): string {
  return `${p.game || 'D2'}|${p.membershipId}`;
}

/** Cross-save primary from D2 rows. */
export function pickCrossSavePlayer(
  d2: PlayerSearchDisplay[],
  mode: 'primary' | 'override' = 'primary'
): PlayerSearchDisplay | null {
  if (mode === 'override') {
    return d2.find(p => p.crossSaveOverride && p.crossSaveOverride > 0) || null;
  }
  return d2.find(p => p.isCrossSavePrimary) || null;
}

/** Sole account when exactly one of d1/d2 is present (crossSave preferred). */
export function pickSoleSearchPlayer(
  d1: PlayerSearchDisplay[],
  d2: PlayerSearchDisplay[],
  crossSave: PlayerSearchDisplay | null
): PlayerSearchDisplay | null {
  return crossSave || d2[0] || d1[0] || null;
}

export function mapD1SearchPlayers(
  d1Xbox: any[] | null | undefined,
  d1Psn: any[] | null | undefined
): PlayerSearchDisplay[] {
  const d1Players = [...(d1Xbox || []), ...(d1Psn || [])];
  return d1Players.map(pl => ({
    ...pl,
    game: 'D1' as const,
    platform: getPlatformName(pl.membershipType),
  }));
}

/** DestinyPlayer array from SearchDestinyPlayer / exact Bungie Name. */
export function mapD2DestinyPlayerArray(responsePlayers: any[]): PlayerSearchDisplay[] {
  return responsePlayers.map((player: any) => ({
    ...player,
    game: 'D2' as const,
    platform: getPlatformName(player.membershipType),
  })) as PlayerSearchDisplay[];
}

/** Flatten User/Search/GlobalName searchResults into D2 display rows. */
export function mapD2PrefixSearchResults(searchResults: any[]): PlayerSearchDisplay[] {
  const players: PlayerSearchDisplay[] = [];
  for (const user of searchResults) {
    const bungieName = `${user.bungieGlobalDisplayName}#${user.bungieGlobalDisplayNameCode}`;
    const memberships = user.destinyMemberships as any[];
    for (const m of memberships) {
      const effectiveType =
        m.membershipType === 254 && m.crossSaveOverride && m.crossSaveOverride > 0
          ? m.crossSaveOverride
          : m.membershipType;
      players.push({
        displayName: bungieName,
        membershipId: m.membershipId,
        membershipType: effectiveType,
        game: 'D2',
        platform: getPlatformName(effectiveType),
        isCrossSavePrimary: m.isCrossSavePrimary,
        crossSaveOverride: m.crossSaveOverride,
      } as PlayerSearchDisplay);
    }
  }
  return dedupePlayerSearchDisplay(players);
}

/**
 * Map SearchAllGames-style D2 response into display rows + cross-save pick.
 * Exact (#) and DestinyPlayer-array paths use override-based cross-save;
 * prefix searchResults use isCrossSavePrimary.
 */
export function mapD2SearchAllResponse(
  query: string,
  d2Resp: any
): { d2: PlayerSearchDisplay[]; crossSave: PlayerSearchDisplay | null } {
  if (query.includes('#')) {
    if (d2Resp && d2Resp.ErrorCode === 1 && Array.isArray(d2Resp.Response) && d2Resp.Response.length > 0) {
      const d2 = mapD2DestinyPlayerArray(d2Resp.Response);
      return { d2, crossSave: pickCrossSavePlayer(d2, 'override') };
    }
    return { d2: [], crossSave: null };
  }

  if (d2Resp && d2Resp.ErrorCode === 1) {
    if (Array.isArray(d2Resp.Response) && d2Resp.Response.length > 0) {
      const d2 = mapD2DestinyPlayerArray(d2Resp.Response);
      return { d2, crossSave: pickCrossSavePlayer(d2, 'override') };
    }
    const results = d2Resp?.Response?.searchResults as any[] | undefined;
    if (results && results.length > 0) {
      const d2 = mapD2PrefixSearchResults(results);
      return { d2, crossSave: pickCrossSavePlayer(d2, 'primary') };
    }
  }
  return { d2: [], crossSave: null };
}

export function mapSearchAllGamesToBundle(
  query: string,
  d2Resp: any,
  d1Xbox: any[] | null | undefined,
  d1Psn: any[] | null | undefined
): PlayerSearchBundle {
  const { d2, crossSave } = mapD2SearchAllResponse(query, d2Resp);
  const d1 = mapD1SearchPlayers(d1Xbox, d1Psn);
  return { d1, d2, crossSave };
}

/** GetMembershipsById → D1/D2 display rows. */
export function mapMembershipsByIdResponse(
  destinyMemberships: any[],
  bungieNetUser: { displayName?: string } | null | undefined
): PlayerSearchBundle {
  const d1: PlayerSearchDisplay[] = [];
  const d2: PlayerSearchDisplay[] = [];

  for (const membership of destinyMemberships) {
    const effectiveType =
      membership.membershipType === 254 && membership.crossSaveOverride && membership.crossSaveOverride > 0
        ? membership.crossSaveOverride
        : membership.membershipType;

    const isD1 =
      (membership.membershipType === 1 || membership.membershipType === 2) && !membership.crossSaveOverride;

    const player: PlayerSearchDisplay = {
      displayName: bungieNetUser?.displayName || membership.displayName || 'Unknown',
      membershipId: membership.membershipId,
      membershipType: effectiveType,
      game: isD1 ? 'D1' : 'D2',
      platform: getPlatformName(effectiveType),
      isCrossSavePrimary: membership.isCrossSavePrimary || false,
      crossSaveOverride: membership.crossSaveOverride || 0,
    };

    if (isD1) {
      d1.push(player);
    } else {
      d2.push(player);
    }
  }

  return {
    d1,
    d2,
    crossSave: pickCrossSavePlayer(d2, 'primary'),
  };
}
