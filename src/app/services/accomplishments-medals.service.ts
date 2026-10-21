import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { BungieApiService } from './bungie-api.service';
import { AssetUrlService } from './asset-url.service';
import { DestinyManifestService } from './destiny-manifest.service';
import {
  AccountMedalsResult,
  AccomplishmentMedal,
  MEDAL_MODE_GROUP_ORDER,
  MedalModeGroup,
  MedalModeGroupId,
  MedalSubtypeId,
} from '../models/accomplishments-medals.model';
import { D2_MEDALS_ORDER } from '../data/d2-medals-catalog';

@Injectable({ providedIn: 'root' })
export class AccomplishmentsMedalsService {
  private readonly bungie = inject(BungieApiService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly manifest = inject(DestinyManifestService);

  /** Session cache: platform|membershipId → result */
  private readonly cache = new Map<string, AccountMedalsResult>();

  cacheKey(membershipType: number, membershipId: string): string {
    // v4: full MEDALS_LIST rows (incl. unearned) + record-def icons
    return `v4|${membershipType}|${membershipId}`;
  }

  getCached(membershipType: number, membershipId: string): AccountMedalsResult | null {
    return this.cache.get(this.cacheKey(membershipType, membershipId)) || null;
  }

  clearSessionCache(): void {
    this.cache.clear();
  }

  async loadAccountMedals(membershipType: number, membershipId: string): Promise<AccountMedalsResult> {
    const key = this.cacheKey(membershipType, membershipId);
    const hit = this.cache.get(key);
    if (hit) return hit;

    try {
      if (!this.manifest.isLoadedSync) {
        await firstValueFrom(this.manifest.isLoaded().pipe(filter((v) => !!v)));
      }

      // MEDALS_LIST entries are DestinyRecordDefinition hashes under the Medals
      // presentation tree — not historical-stat ids.
      const recordsRes = await firstValueFrom(
        this.bungie.getPlayerRecords(membershipType, membershipId)
      );

      if (this.isPrivacyBlocked(recordsRes)) {
        const hidden: AccountMedalsResult = {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'hidden',
          message: "Hidden by this player's privacy settings",
        };
        this.cache.set(key, hidden);
        return hidden;
      }

      if (!recordsRes || recordsRes.ErrorCode !== 1) {
        const err: AccountMedalsResult = {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'error',
          message: recordsRes?.Message || 'Could not load medal records from Bungie',
        };
        this.cache.set(key, err);
        return err;
      }

      const profileRecords = recordsRes.Response?.profileRecords?.data?.records || {};
      const charRecords = recordsRes.Response?.characterRecords?.data || {};
      const recordDefs = this.manifest.getTitleDefs() || {};

      const medals: AccomplishmentMedal[] = [];
      for (const entry of D2_MEDALS_ORDER) {
        const mode = this.asMode(entry.mode);
        const subtype = this.asSubtype(entry.subtype);
        if (!mode || !subtype) continue;
        const count = this.recordMedalCount(entry.hash, profileRecords, charRecords);
        const def = recordDefs[entry.hash] || recordDefs[String(entry.hash)];
        const iconRaw = String(def?.displayProperties?.icon || '').trim();
        medals.push({
          statId: entry.hash,
          name: entry.name,
          description: entry.description || String(def?.displayProperties?.description || '').trim(),
          iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
          count,
          modeGroup: mode,
          subtype,
          catalogOrder: entry.order,
        });
      }

      // Catalog order within each mode/subtype; earned first within a subtype is nicer for reading
      medals.sort(
        (a, b) =>
          (a.catalogOrder ?? 1e9) - (b.catalogOrder ?? 1e9) ||
          b.count - a.count ||
          a.name.localeCompare(b.name)
      );
      const groups = this.groupMedals(medals);
      const totalEarned = medals.reduce((sum, m) => sum + (m.count > 0 ? m.count : 0), 0);
      const earnedTypes = medals.filter((m) => m.count > 0).length;
      const result: AccountMedalsResult = {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        groups,
        totalEarned,
        status: medals.length ? 'ok' : 'empty',
        message: medals.length
          ? undefined
          : earnedTypes
            ? undefined
            : 'No medals in the catalog for this account',
      };
      this.cache.set(key, result);
      return result;
    } catch (e: any) {
      if (this.isPrivacyError(e)) {
        const hidden: AccountMedalsResult = {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'hidden',
          message: "Hidden by this player's privacy settings",
        };
        this.cache.set(key, hidden);
        return hidden;
      }
      const err: AccountMedalsResult = {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        groups: [],
        totalEarned: 0,
        status: 'error',
        message: e?.message || 'Could not load medal records from Bungie',
      };
      this.cache.set(key, err);
      return err;
    }
  }

  private recordMedalCount(
    hash: string,
    profileRecords: Record<string, any>,
    charRecords: Record<string, any>
  ): number {
    let max = 0;
    const candidates: any[] = [profileRecords?.[hash], profileRecords?.[String(hash)]];
    if (charRecords && typeof charRecords === 'object') {
      for (const block of Object.values(charRecords) as any[]) {
        candidates.push(block?.records?.[hash], block?.records?.[String(hash)]);
      }
    }
    for (const rec of candidates) {
      if (!rec) continue;
      for (const o of rec.objectives || []) {
        const v = Number(o?.progress ?? 0);
        if (Number.isFinite(v) && v > max) max = v;
      }
      for (const o of rec.intervalObjectives || []) {
        const v = Number(o?.progress ?? 0);
        if (Number.isFinite(v) && v > max) max = v;
      }
    }
    return max;
  }

  private asMode(raw: string): MedalModeGroupId | null {
    if (raw === 'Crucible' || raw === 'Gambit' || raw === 'Vanguard') return raw;
    return null;
  }

  private asSubtype(raw: string): MedalSubtypeId | null {
    return raw as MedalSubtypeId;
  }

  private groupMedals(medals: AccomplishmentMedal[]): MedalModeGroup[] {
    const map = new Map<MedalModeGroupId, AccomplishmentMedal[]>();
    for (const id of MEDAL_MODE_GROUP_ORDER) {
      map.set(id, []);
    }
    for (const medal of medals) {
      const id: MedalModeGroupId =
        medal.modeGroup === 'Other' || !map.has(medal.modeGroup) ? 'Crucible' : medal.modeGroup;
      map.get(id)!.push(medal);
    }
    return MEDAL_MODE_GROUP_ORDER.map((id) => ({ id, medals: map.get(id)! }));
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
