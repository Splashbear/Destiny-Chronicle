import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { BungieApiService } from './bungie-api.service';
import { DestinyManifestService } from './destiny-manifest.service';
import { AssetUrlService } from './asset-url.service';
import {
  AccomplishmentCompletedSeal,
  AccomplishmentSealTriumph,
  AccountSealTriumphsResult,
} from '../models/accomplishments-seal-triumphs.model';
import { TRIUMPHS_BY_HASH } from '../data/triumphs-catalog';

/** DestinyRecordState.RecordRedeemed — matches Titles & Seals completion check. */
const RECORD_REDEEMED = 1;

/** Current Titles parent (non-legacy). Same as TitleService. */
const TITLES_PARENT = 616318467;
/** Legacy Titles parent. */
const LEGACY_TITLES_PARENT = 1881970629;

@Injectable({ providedIn: 'root' })
export class AccomplishmentsSealTriumphsService {
  private readonly bungie = inject(BungieApiService);
  private readonly manifest = inject(DestinyManifestService);
  private readonly assetUrl = inject(AssetUrlService);

  private readonly cache = new Map<string, AccountSealTriumphsResult>();

  cacheKey(membershipType: number, membershipId: string): string {
    return `${membershipType}|${membershipId}`;
  }

  getCached(membershipType: number, membershipId: string): AccountSealTriumphsResult | null {
    return this.cache.get(this.cacheKey(membershipType, membershipId)) || null;
  }

  async loadAccountSealTriumphs(
    membershipType: number,
    membershipId: string
  ): Promise<AccountSealTriumphsResult> {
    const key = this.cacheKey(membershipType, membershipId);
    const hit = this.cache.get(key);
    if (hit) return hit;

    try {
      if (!this.manifest.isLoadedSync) {
        await firstValueFrom(this.manifest.isLoaded().pipe(filter((v) => !!v)));
      }

      const recordsRes = await firstValueFrom(
        this.bungie.getPlayerRecords(membershipType, membershipId)
      );

      if (this.isPrivacyBlocked(recordsRes)) {
        return this.cacheAndReturn(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          seals: [],
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        });
      }

      if (!recordsRes || recordsRes.ErrorCode !== 1) {
        return this.cacheAndReturn(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          seals: [],
          status: 'error',
          message: recordsRes?.Message || 'Could not load seal triumphs from Bungie',
        });
      }

      const profileRecords = recordsRes.Response?.profileRecords?.data?.records || {};
      const charRecords = recordsRes.Response?.characterRecords?.data || {};
      const nodes = this.manifest.getPresentationNodes() || {};
      const recordDefs = this.manifest.getTitleDefs() || {};

      const seals = this.buildCompletedSeals(nodes, recordDefs, profileRecords, charRecords);
      const status: AccountSealTriumphsResult['status'] = seals.length ? 'ok' : 'empty';

      return this.cacheAndReturn(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        seals,
        status,
        message: status === 'empty' ? 'No completed seals on this account' : undefined,
      });
    } catch (e: any) {
      if (this.isPrivacyError(e)) {
        return this.cacheAndReturn(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          seals: [],
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        });
      }
      return this.cacheAndReturn(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        seals: [],
        status: 'error',
        message: e?.message || 'Could not load seal triumphs from Bungie',
      });
    }
  }

  private cacheAndReturn(key: string, result: AccountSealTriumphsResult): AccountSealTriumphsResult {
    this.cache.set(key, result);
    return result;
  }

  private buildCompletedSeals(
    nodes: Record<string, any>,
    recordDefs: Record<string, any>,
    profileRecords: Record<string, any>,
    charRecords: Record<string, any>
  ): AccomplishmentCompletedSeal[] {
    const titleNodes = this.collectTitleNodes(nodes);
    const out: AccomplishmentCompletedSeal[] = [];

    for (const node of titleNodes) {
      const completionHash = node?.completionRecordHash;
      if (completionHash == null) continue;

      const record = this.findRecord(String(completionHash), profileRecords, charRecords);
      if (!record || (Number(record.state) & RECORD_REDEEMED) === 0) continue;

      const recordDef = recordDefs[String(completionHash)];
      const name = String(
        recordDef?.titleInfo?.titlesByGender?.Male ||
          node.displayProperties?.name ||
          'Seal'
      ).trim();
      const iconRaw =
        node.displayProperties?.icon ||
        node.originalIcon ||
        node.rootViewIcon ||
        '';
      const triumphs = this.buildTriumphs(node, nodes, recordDefs, String(completionHash));
      out.push({
        hash: String(node.hash ?? ''),
        completionRecordHash: String(completionHash),
        name,
        iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
        legacy: Array.isArray(node.parentNodeHashes) && node.parentNodeHashes.includes(LEGACY_TITLES_PARENT),
        triumphs,
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  private collectTitleNodes(nodes: Record<string, any>): any[] {
    const out: any[] = [];
    for (const parentHash of [TITLES_PARENT, LEGACY_TITLES_PARENT]) {
      const parent = nodes[String(parentHash)];
      if (!parent?.children?.presentationNodes) continue;
      for (const child of parent.children.presentationNodes) {
        const n = nodes[String(child.presentationNodeHash)];
        if (n) out.push(n);
      }
    }
    return out;
  }

  private buildTriumphs(
    sealNode: any,
    nodes: Record<string, any>,
    recordDefs: Record<string, any>,
    completionHash: string
  ): AccomplishmentSealTriumph[] {
    const hashes = this.recordHashesUnder(sealNode, nodes).filter((h) => h !== completionHash);
    const out: AccomplishmentSealTriumph[] = [];
    for (const h of hashes) {
      const def = recordDefs[h];
      const catalog = TRIUMPHS_BY_HASH[h];
      const name = String(catalog?.name || def?.displayProperties?.name || h).trim();
      if (!name || /^classif/i.test(name)) continue;
      const description = String(
        catalog?.description || def?.displayProperties?.description || ''
      ).trim();
      const iconRaw = def?.displayProperties?.icon || '';
      out.push({
        hash: h,
        name,
        description,
        iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
        category: catalog?.category,
        catalogOrder: catalog?.order,
      });
    }
    out.sort(
      (a, b) =>
        (a.catalogOrder ?? 1e9) - (b.catalogOrder ?? 1e9) || a.name.localeCompare(b.name)
    );
    return out;
  }

  private recordHashesUnder(node: any, nodes: Record<string, any>, depth = 0): string[] {
    if (!node || depth > 8) return [];
    const out: string[] = [];
    const records = node?.children?.records;
    if (Array.isArray(records)) {
      for (const r of records) {
        if (r?.recordHash != null) out.push(String(r.recordHash));
      }
    }
    const childNodes = node?.children?.presentationNodes;
    if (Array.isArray(childNodes)) {
      for (const c of childNodes) {
        const child = nodes[String(c.presentationNodeHash)];
        out.push(...this.recordHashesUnder(child, nodes, depth + 1));
      }
    }
    return [...new Set(out)];
  }

  private findRecord(
    hash: string,
    profileRecords: Record<string, any>,
    charRecords: Record<string, any>
  ): any | null {
    if (profileRecords?.[hash]) return profileRecords[hash];
    if (!charRecords || typeof charRecords !== 'object') return null;
    for (const ch of Object.values(charRecords) as any[]) {
      const rec = ch?.records?.[hash];
      if (rec) return rec;
    }
    return null;
  }

  private isPrivacyBlocked(res: any): boolean {
    const code = Number(res?.ErrorCode);
    return (
      code === 1665 ||
      /privacy/i.test(String(res?.ErrorStatus || '')) ||
      /privacy/i.test(String(res?.Message || ''))
    );
  }

  private isPrivacyError(e: any): boolean {
    const status = e?.error?.ErrorStatus || e?.ErrorStatus || e?.statusText;
    const code = e?.error?.ErrorCode || e?.ErrorCode;
    const msg = e?.error?.Message || e?.message || '';
    return Number(code) === 1665 || /privacy/i.test(String(status)) || /privacy/i.test(String(msg));
  }
}
