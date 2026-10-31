import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from '../core/data/bungie-api.service';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import {
  accountHasGames,
  characterCountFromD2ProfileResponse,
  isMeaningfulLastPlayed,
  linkedProfilePlayByMembership,
  sortSearchAccountsByPlayActivity,
} from '../utils/search-account-activity';

/** Platforms that are almost always unused link leftovers for cross-save Guardians. */
const OFTEN_EMPTY_MEMBERSHIP_TYPES = new Set([5, 6]); // Stadia, Epic

/**
 * GAME_FILTER_SPEC 2.1 — mark empty search platforms (Stadia/Epic/…) before the picker opens.
 */
@Injectable({ providedIn: 'root' })
export class SearchAccountPlayService {
  constructor(private bungie: BungieApiService) {}

  async enrichSearchAccounts(input: {
    d1: PlayerSearchDisplay[];
    d2: PlayerSearchDisplay[];
    crossSave: PlayerSearchDisplay | null;
  }): Promise<{
    d1: PlayerSearchDisplay[];
    d2: PlayerSearchDisplay[];
    crossSave: PlayerSearchDisplay | null;
  }> {
    let d1 = input.d1.map((p) => ({ ...p }));
    let d2 = input.d2.map((p) => ({ ...p }));
    let crossSave = input.crossSave ? { ...input.crossSave } : null;

    const seed = crossSave || d2[0] || d1[0];
    if (!seed) {
      return { d1, d2, crossSave };
    }

    let profiles: any[] = [];
    try {
      const linked = await firstValueFrom(
        this.bungie.getLinkedProfiles(seed.membershipType as any, seed.membershipId)
      );
      profiles = (linked?.Response?.profiles as any[]) || [];
    } catch (err) {
      console.warn('[Search] LinkedProfiles play enrichment failed', err);
    }

    const byMem = linkedProfilePlayByMembership(profiles);
    const applyLinked = (player: PlayerSearchDisplay): PlayerSearchDisplay => {
      const typed = byMem.get(`${player.membershipType}|${player.membershipId}`);
      const bare = byMem.get(player.membershipId);
      const hit = typed || bare;
      if (hit && hit.dateLastPlayed !== undefined) {
        player.dateLastPlayed = hit.dateLastPlayed || undefined;
      }
      if (hit?.isCrossSavePrimary) {
        player.isCrossSavePrimary = true;
      }
      const has = accountHasGames({
        dateLastPlayed: player.dateLastPlayed,
        characterCount: player.characterCount,
        archiveGameCount: player.archiveGameCount,
      });
      if (has !== null) player.hasGames = has;
      return player;
    };

    d2 = d2.map(applyLinked);
    d1 = d1.map(applyLinked);
    if (crossSave) {
      const match = d2.find((p) => p.membershipId === crossSave!.membershipId);
      crossSave = match ? { ...match } : applyLinked(crossSave);
    }

    // Stadia / Epic are almost always unused cross-save leftovers. When stronger
    // platforms (PS/Xbox/Steam/…) are also listed, force them empty — LinkedProfiles
    // and GetProfile often echo the primary's last-played/characters onto them.
    const hasCorePlatform = d2.some(
      (p) => !OFTEN_EMPTY_MEMBERSHIP_TYPES.has(Number(p.membershipType))
    );
    if (hasCorePlatform) {
      for (const player of d2) {
        if (!OFTEN_EMPTY_MEMBERSHIP_TYPES.has(Number(player.membershipType))) continue;
        if (player.isCrossSavePrimary) continue;
        player.hasGames = false;
      }
    } else if (profiles.length > 0) {
      for (const player of d2) {
        if (!OFTEN_EMPTY_MEMBERSHIP_TYPES.has(Number(player.membershipType))) continue;
        const typed = byMem.get(`${player.membershipType}|${player.membershipId}`);
        if (!typed || !isMeaningfulLastPlayed(typed.dateLastPlayed)) {
          player.hasGames = false;
        }
      }
    }

    // Character check for unknowns / confirm empties. Do not let cross-save GetProfile
    // (which often returns the primary's characters on Stadia/Epic) flip a LinkedProfiles
    // "empty" signal back to hasGames=true.
    await Promise.all(
      d2.map(async (player) => {
        if (player.hasGames === false) return;
        try {
          const profile = await firstValueFrom(
            this.bungie.getProfile(player.membershipType as any, player.membershipId)
          );
          const count = characterCountFromD2ProfileResponse(profile);
          if (count === null) {
            if (player.hasGames !== true) player.hasGames = false;
            return;
          }
          player.characterCount = count;
          if (count === 0) {
            player.hasGames = false;
          } else if (player.hasGames == null) {
            player.hasGames = true;
          }
          const lastPlayed = profile?.Response?.profile?.data?.dateLastPlayed;
          if (typeof lastPlayed === 'string' && !player.dateLastPlayed) {
            player.dateLastPlayed = lastPlayed;
          }
        } catch {
          if (player.hasGames == null) {
            const has = accountHasGames({ dateLastPlayed: player.dateLastPlayed });
            if (has !== null) player.hasGames = has;
          }
        }
      })
    );

    const d1Need = d1.filter((p) => p.hasGames == null);
    await Promise.all(
      d1Need.map(async (player) => {
        try {
          const summary = await firstValueFrom(
            this.bungie.getD1Profile(player.membershipType as any, player.membershipId)
          );
          const chars = summary?.Response?.data?.characters;
          const count = Array.isArray(chars)
            ? chars.length
            : chars && typeof chars === 'object'
              ? Object.keys(chars).length
              : 0;
          player.characterCount = count;
          player.hasGames = count > 0;
        } catch {
          /* leave unknown */
        }
      })
    );

    d1 = sortSearchAccountsByPlayActivity(d1);
    d2 = sortSearchAccountsByPlayActivity(d2);
    crossSave = d2.find((p) => p.isCrossSavePrimary) || crossSave;

    return { d1, d2, crossSave };
  }
}
