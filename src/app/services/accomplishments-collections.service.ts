import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { BungieApiService } from './bungie-api.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { AssetUrlService } from './asset-url.service';
import {
  AccomplishmentBadge,
  AccomplishmentEmblem,
  AccountCollectionsResult,
} from '../models/accomplishments-collections.model';

/** DestinyCollectibleState.NotAcquired */
const NOT_ACQUIRED = 1;

/** Fallback when profile omits the badges root hash (Forsaken-era constant). */
const FALLBACK_BADGES_ROOT = 498211331;
/** Fallback Collections categories root. */
const FALLBACK_COLLECTIONS_ROOT = 3790247699;

@Injectable({ providedIn: 'root' })
export class AccomplishmentsCollectionsService {
  private readonly bungie = inject(BungieApiService);
  private readonly manifest = inject(DestinyManifestService);
  private readonly assetUrl = inject(AssetUrlService);

  private readonly cache = new Map<string, AccountCollectionsResult>();

  cacheKey(membershipType: number, membershipId: string): string {
    return `${membershipType}|${membershipId}`;
  }

  getCached(membershipType: number, membershipId: string): AccountCollectionsResult | null {
    return this.cache.get(this.cacheKey(membershipType, membershipId)) || null;
  }

  async loadAccountCollections(
    membershipType: number,
    membershipId: string
  ): Promise<AccountCollectionsResult> {
    const key = this.cacheKey(membershipType, membershipId);
    const hit = this.cache.get(key);
    if (hit) return hit;

    try {
      if (!this.manifest.isLoadedSync) {
        await firstValueFrom(this.manifest.isLoaded().pipe(filter((v) => !!v)));
      }

      // Collectible JSON and profile are independent — overlap wall time.
      const [, profileRes] = await Promise.all([
        this.manifest.ensureCollectibleDefs(),
        firstValueFrom(
          this.bungie.getProfileComponents(membershipType, membershipId, [100, 200, 800])
        ),
      ]);

      if (this.isPrivacyBlocked(profileRes)) {
        return this.cacheAndReturn(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          badges: [],
          emblems: [],
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        });
      }

      if (!profileRes || profileRes.ErrorCode !== 1) {
        return this.cacheAndReturn(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          badges: [],
          emblems: [],
          status: 'error',
          message: profileRes?.Message || 'Could not load collections from Bungie',
        });
      }

      const acquired = this.mergeAcquiredCollectibles(profileRes.Response);
      const nodes = this.manifest.getPresentationNodes() || {};
      const profileCol = profileRes.Response?.profileCollectibles?.data;
      const badgesRoot =
        Number(profileCol?.collectionBadgesRootNodeHash) || FALLBACK_BADGES_ROOT;
      const collectionsRoot =
        Number(profileCol?.collectionCategoriesRootNodeHash) || FALLBACK_COLLECTIONS_ROOT;

      const badges = this.buildBadges(nodes, badgesRoot, acquired);
      const emblems = this.buildEmblems(nodes, collectionsRoot, acquired);

      const status: AccountCollectionsResult['status'] =
        badges.length || emblems.length ? 'ok' : 'empty';

      return this.cacheAndReturn(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        badges,
        emblems,
        status,
        message: status === 'empty' ? 'No badges or emblems found for this account' : undefined,
      });
    } catch (e: any) {
      if (this.isPrivacyError(e)) {
        return this.cacheAndReturn(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          badges: [],
          emblems: [],
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        });
      }
      return this.cacheAndReturn(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        badges: [],
        emblems: [],
        status: 'error',
        message: e?.message || 'Could not load collections from Bungie',
      });
    }
  }

  private cacheAndReturn(key: string, result: AccountCollectionsResult): AccountCollectionsResult {
    this.cache.set(key, result);
    return result;
  }

  private mergeAcquiredCollectibles(response: any): Set<string> {
    const acquired = new Set<string>();
    const absorb = (map: Record<string, any> | null | undefined) => {
      if (!map) return;
      for (const [hash, entry] of Object.entries(map)) {
        const state = Number((entry as any)?.state ?? 0);
        if ((state & NOT_ACQUIRED) === 0) {
          acquired.add(String(hash));
        }
      }
    };
    absorb(response?.profileCollectibles?.data?.collectibles);
    const charCols = response?.characterCollectibles?.data;
    if (charCols && typeof charCols === 'object') {
      for (const ch of Object.values(charCols) as any[]) {
        absorb(ch?.collectibles);
      }
    }
    return acquired;
  }

  private buildBadges(
    nodes: Record<string, any>,
    badgesRootHash: number,
    acquired: Set<string>
  ): AccomplishmentBadge[] {
    const root = nodes[String(badgesRootHash)];
    if (!root) return [];
    const badgeNodes = this.childPresentationNodes(root, nodes);
    const out: AccomplishmentBadge[] = [];
    for (const badgeNode of badgeNodes) {
      const hashes = this.collectibleHashesUnder(badgeNode, nodes);
      if (!hashes.length) continue;
      let got = 0;
      for (const h of hashes) {
        if (acquired.has(h)) got += 1;
      }
      const total = hashes.length;
      const complete = got >= total && total > 0;
      const name = String(badgeNode?.displayProperties?.name || 'Badge').trim();
      const iconRaw =
        badgeNode?.displayProperties?.icon ||
        badgeNode?.originalIcon ||
        badgeNode?.rootViewIcon ||
        '';
      out.push({
        hash: String(badgeNode.hash ?? ''),
        name,
        iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
        acquired: got,
        total,
        complete,
        remaining: Math.max(0, total - got),
      });
    }
    out.sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  private buildEmblems(
    nodes: Record<string, any>,
    collectionsRootHash: number,
    acquired: Set<string>
  ): AccomplishmentEmblem[] {
    const root = nodes[String(collectionsRootHash)];
    if (!root) return [];
    const emblemsNode =
      this.childPresentationNodes(root, nodes).find((n) =>
        /^emblems$/i.test(String(n?.displayProperties?.name || '').trim())
      ) ||
      this.findNodeByName(nodes, 'Emblems');
    if (!emblemsNode) return [];

    const hashes = this.collectibleHashesUnder(emblemsNode, nodes);
    const out: AccomplishmentEmblem[] = [];
    for (const h of hashes) {
      if (!acquired.has(h)) continue;
      const def = this.manifest.getCollectibleDef(h);
      const name = String(def?.displayProperties?.name || h).trim();
      const iconRaw = def?.displayProperties?.icon || '';
      out.push({
        hash: h,
        name,
        iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  private findNodeByName(nodes: Record<string, any>, name: string): any | null {
    const needle = name.trim().toLowerCase();
    for (const n of Object.values(nodes)) {
      if (String((n as any)?.displayProperties?.name || '').trim().toLowerCase() === needle) {
        return n;
      }
    }
    return null;
  }

  private childPresentationNodes(node: any, nodes: Record<string, any>): any[] {
    const children = node?.children?.presentationNodes;
    if (!Array.isArray(children)) return [];
    return children
      .map((c: any) => nodes[String(c.presentationNodeHash)])
      .filter(Boolean);
  }

  private collectibleHashesUnder(node: any, nodes: Record<string, any>, depth = 0): string[] {
    if (!node || depth > 8) return [];
    const out: string[] = [];
    const cols = node?.children?.collectibles;
    if (Array.isArray(cols)) {
      for (const c of cols) {
        const h = c?.collectibleHash;
        if (h != null) out.push(String(h));
      }
    }
    for (const child of this.childPresentationNodes(node, nodes)) {
      out.push(...this.collectibleHashesUnder(child, nodes, depth + 1));
    }
    return [...new Set(out)];
  }

  private isPrivacyBlocked(res: any): boolean {
    const code = Number(res?.ErrorCode);
    return code === 1665 || /privacy/i.test(String(res?.ErrorStatus || '')) || /privacy/i.test(String(res?.Message || ''));
  }

  private isPrivacyError(e: any): boolean {
    const status = e?.error?.ErrorStatus || e?.ErrorStatus || e?.statusText;
    const code = e?.error?.ErrorCode || e?.ErrorCode;
    const msg = e?.error?.Message || e?.message || '';
    return Number(code) === 1665 || /privacy/i.test(String(status)) || /privacy/i.test(String(msg));
  }
}
