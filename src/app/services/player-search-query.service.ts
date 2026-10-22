import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from '../core/data/bungie-api.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import {
  PlayerSearchBundle,
  mapMembershipsByIdResponse,
  mapSearchAllGamesToBundle,
  mapD2DestinyPlayerArray,
  pickCrossSavePlayer,
} from '../utils/player-search-results';

export type MembershipIdLookupResult =
  | { ok: true; bundle: PlayerSearchBundle }
  | { ok: false; errorMessage: string };

/**
 * Bungie player-search queries + response mapping (CODE_CLEANUP_SPEC).
 * UI orchestration (clear, picker, select) stays on PlayerSearchComponent.
 */
@Injectable({ providedIn: 'root' })
export class PlayerSearchQueryService {
  private readonly bungie = inject(BungieApiService);

  async searchAllGames(query: string): Promise<PlayerSearchBundle> {
    const [d2Resp, d1Xbox, d1Psn] = await firstValueFrom(this.bungie.searchAllGames(query));
    return mapSearchAllGamesToBundle(query, d2Resp, d1Xbox, d1Psn);
  }

  /**
   * Raw SearchAllGames tuple for callers that still branch on exact-# side effects
   * (processExactD2SearchResponse opens picker / selects before D1 mapping).
   */
  async searchAllGamesRaw(query: string): Promise<[any, any[] | null, any[] | null]> {
    return firstValueFrom(this.bungie.searchAllGames(query));
  }

  async lookupMembershipId(membershipId: string): Promise<MembershipIdLookupResult> {
    try {
      const membershipResp = await firstValueFrom(this.bungie.getMembershipData(membershipId));
      if (!membershipResp || membershipResp.ErrorCode !== 1 || !membershipResp.Response) {
        return { ok: false, errorMessage: 'Invalid membership ID or account not found.' };
      }
      const destinyMemberships = membershipResp.Response.destinyMemberships || [];
      const bungieNetUser = membershipResp.Response.bungieNetUser;
      if (destinyMemberships.length === 0) {
        return { ok: false, errorMessage: 'No Destiny accounts found for that membership ID.' };
      }
      return {
        ok: true,
        bundle: mapMembershipsByIdResponse(destinyMemberships, bungieNetUser),
      };
    } catch (error: any) {
      console.error('[Search] Membership ID lookup error:', error);
      return {
        ok: false,
        errorMessage: error?.error?.Message || 'Error looking up membership ID.',
      };
    }
  }

  /** Map exact Bungie Name SearchDestinyPlayer response (no UI side effects). */
  mapExactD2Response(response: any): {
    players: PlayerSearchDisplay[];
    crossSave: PlayerSearchDisplay | null;
    empty: boolean;
  } {
    if (!response || response.ErrorCode !== 1 || !response.Response?.length) {
      return { players: [], crossSave: null, empty: true };
    }
    const players = mapD2DestinyPlayerArray(response.Response);
    return {
      players,
      crossSave: pickCrossSavePlayer(players, 'override'),
      empty: false,
    };
  }

  /**
   * Prefix GlobalName search → Destiny memberships (no UI side effects).
   * Returns API error details when Bungie ErrorCode !== 1.
   */
  async searchD2Prefix(
    searchTerm: string,
    getPlatformName: (membershipType: number | undefined) => string
  ): Promise<
    | { ok: true; players: PlayerSearchDisplay[]; crossSave: PlayerSearchDisplay | null }
    | { ok: false; kind: 'api' | 'empty-users' | 'empty-memberships'; status?: string; message?: string }
  > {
    const prefixResp = await firstValueFrom(this.bungie.searchUsersPrefix(searchTerm));
    const results = prefixResp?.Response?.searchResults as any[] | undefined;
    if (!prefixResp || prefixResp.ErrorCode !== 1) {
      return {
        ok: false,
        kind: 'api',
        status: prefixResp?.ErrorStatus || 'Unknown',
        message: prefixResp?.Message || 'No additional details.',
      };
    }
    if (!results || results.length === 0) {
      return { ok: false, kind: 'empty-users' };
    }

    const players: PlayerSearchDisplay[] = [];
    for (const user of results) {
      const bungieName = `${user.bungieGlobalDisplayName}#${user.bungieGlobalDisplayNameCode}`;
      const memberships = user.destinyMemberships as any[];
      for (const m of memberships || []) {
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

    if (players.length === 0) {
      return { ok: false, kind: 'empty-memberships' };
    }

    const unique = players.filter((p, idx, arr) => {
      const key = `${p.game || 'D2'}|${p.membershipId}`;
      return arr.findIndex(x => `${x.game || 'D2'}|${x.membershipId}` === key) === idx;
    });

    return {
      ok: true,
      players: unique,
      crossSave: unique.find(p => p.isCrossSavePrimary) || null,
    };
  }
}
