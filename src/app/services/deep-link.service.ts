import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from '../core/data/bungie-api.service';
import {
  DeepLink,
  DeepLinkAccount,
  DeepLinkPlayerPayload,
  deepLinkNeedsProfile,
  deepLinkPlayerPayload,
  resolveDeepLinkGame,
} from '../utils/deep-link';

/** One Bungie lookup per account, never longer than this: the page must not wait on it. */
export const DEEP_LINK_PROFILE_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });
}

/**
 * Turns `?a=` accounts into the same player payloads a permalink restore uses, so the
 * normal loader (DC API list first, then Bungie fill-in) does the rest. Search is skipped.
 */
@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  constructor(private bungie: BungieApiService) {}

  async resolvePlayers(link: DeepLink): Promise<DeepLinkPlayerPayload[]> {
    const rows = await Promise.all(link.accounts.map((a) => this.resolveOne(a)));
    return rows;
  }

  private async resolveOne(account: DeepLinkAccount): Promise<DeepLinkPlayerPayload> {
    const profile = await withTimeout(this.lookupProfile(account), DEEP_LINK_PROFILE_TIMEOUT_MS, null);
    const game = resolveDeepLinkGame(account, deepLinkNeedsProfile(account) ? profile : null);
    const name = profile?.bungieGlobalDisplayName
      ? `${profile.bungieGlobalDisplayName}${
          profile.bungieGlobalDisplayNameCode != null
            ? '#' + String(profile.bungieGlobalDisplayNameCode).padStart(4, '0')
            : ''
        }`
      : profile?.displayName;
    return deepLinkPlayerPayload(account, game, name);
  }

  /** LinkedProfiles row for this exact platform + membershipId, or null. */
  private async lookupProfile(account: DeepLinkAccount): Promise<any | null> {
    const linked = await firstValueFrom(
      this.bungie.getLinkedProfiles(account.membershipType as any, account.membershipId)
    );
    const rows: any[] = [
      ...((linked?.Response?.profiles as any[]) || []),
      ...((linked?.Response?.profilesWithErrors as any[]) || []).map((e) => e?.infoCard).filter(Boolean),
    ];
    return (
      rows.find(
        (r) =>
          String(r.membershipId) === account.membershipId &&
          Number(r.membershipType) === account.membershipType
      ) ?? null
    );
  }
}
