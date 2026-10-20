import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from './bungie-api.service';
import { AssetUrlService } from './asset-url.service';
import {
  AccountMedalsResult,
  AccomplishmentMedal,
  MEDAL_MODE_GROUP_ORDER,
  MedalModeGroup,
  MedalModeGroupId,
} from '../models/accomplishments-medals.model';
import { isMedalHistoricalStat, medalModeGroup, medalSubtype } from '../utils/medal-mode-groups';

@Injectable({ providedIn: 'root' })
export class AccomplishmentsMedalsService {
  private readonly bungie = inject(BungieApiService);
  private readonly assetUrl = inject(AssetUrlService);

  /** Session cache: platform|membershipId → result */
  private readonly cache = new Map<string, AccountMedalsResult>();
  private historicalDefs: Record<string, any> | null = null;
  private historicalDefsPromise: Promise<Record<string, any>> | null = null;

  cacheKey(membershipType: number, membershipId: string): string {
    return `${membershipType}|${membershipId}`;
  }

  getCached(membershipType: number, membershipId: string): AccountMedalsResult | null {
    return this.cache.get(this.cacheKey(membershipType, membershipId)) || null;
  }

  clearSessionCache(): void {
    this.cache.clear();
  }

  async ensureHistoricalDefs(): Promise<Record<string, any>> {
    if (this.historicalDefs) return this.historicalDefs;
    if (!this.historicalDefsPromise) {
      this.historicalDefsPromise = (async () => {
        const res = await firstValueFrom(this.bungie.getHistoricalStatsDefinitions());
        if (res?.ErrorCode === 1 && res.Response && typeof res.Response === 'object') {
          this.historicalDefs = res.Response;
          return this.historicalDefs;
        }
        throw new Error(res?.Message || 'Failed to load historical stats definitions');
      })().catch((err) => {
        this.historicalDefsPromise = null;
        throw err;
      });
    }
    return this.historicalDefsPromise;
  }

  async loadAccountMedals(membershipType: number, membershipId: string): Promise<AccountMedalsResult> {
    const key = this.cacheKey(membershipType, membershipId);
    const hit = this.cache.get(key);
    if (hit) return hit;

    try {
      const [defs, statsRes] = await Promise.all([
        this.ensureHistoricalDefs(),
        firstValueFrom(this.bungie.getHistoricalStatsForAccount(membershipType, membershipId, [3])),
      ]);

      if (this.isPrivacyBlocked(statsRes)) {
        const hidden: AccountMedalsResult = {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        };
        this.cache.set(key, hidden);
        return hidden;
      }

      if (!statsRes || statsRes.ErrorCode !== 1) {
        const err: AccountMedalsResult = {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'error',
          message: statsRes?.Message || 'Could not load medal stats from Bungie',
        };
        this.cache.set(key, err);
        return err;
      }

      const counts = this.collectMedalCounts(statsRes.Response);
      const medals: AccomplishmentMedal[] = [];
      for (const [statId, count] of counts) {
        if (count <= 0) continue;
        const def = defs[statId];
        if (def && !isMedalHistoricalStat(def)) {
          // Skip non-medal stats that sometimes appear in the medals group payload
          if (!/medal/i.test(statId)) continue;
        }
        const name = String(def?.statName || def?.displayProperties?.name || statId).trim();
        const description = String(def?.statDescription || def?.displayProperties?.description || '').trim();
        const iconRaw = def?.iconImage || def?.displayProperties?.icon || '';
        medals.push({
          statId,
          name,
          description,
          iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
          count,
          modeGroup: medalModeGroup(statId, def?.modes),
          subtype: medalSubtype(statId, def),
        });
      }

      medals.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const groups = this.groupMedals(medals);
      const totalEarned = medals.reduce((sum, m) => sum + m.count, 0);
      const result: AccountMedalsResult = {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        groups,
        totalEarned,
        status: medals.length ? 'ok' : 'empty',
        message: medals.length ? undefined : 'No medals earned on this account',
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
          message: 'Hidden by this player\'s privacy settings',
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
        message: e?.message || 'Could not load medal stats from Bungie',
      };
      this.cache.set(key, err);
      return err;
    }
  }

  private groupMedals(medals: AccomplishmentMedal[]): MedalModeGroup[] {
    const map = new Map<MedalModeGroupId, AccomplishmentMedal[]>();
    for (const id of MEDAL_MODE_GROUP_ORDER) {
      map.set(id, []);
    }
    for (const medal of medals) {
      map.get(medal.modeGroup)!.push(medal);
    }
    return MEDAL_MODE_GROUP_ORDER
      .map((id) => ({ id, medals: map.get(id)! }))
      .filter((g) => g.medals.length > 0);
  }

  /**
   * Prefer mergedAllCharacters (account aggregate). If empty, sum per-character medals.
   * Within one character/merged node, take max across mode buckets so the same medal is not double-counted.
   */
  private collectMedalCounts(response: any): Map<string, number> {
    const fromMerged = new Map<string, number>();
    this.walkStatsNode(response?.mergedAllCharacters, fromMerged);
    this.walkStatsNode(response?.mergedDeletedCharacters, fromMerged);
    if (fromMerged.size > 0) {
      return fromMerged;
    }

    const fromChars = new Map<string, number>();
    const characters = response?.characters;
    const list = Array.isArray(characters)
      ? characters
      : characters && typeof characters === 'object'
        ? Object.values(characters)
        : [];
    for (const ch of list) {
      const perChar = new Map<string, number>();
      this.walkStatsNode(ch, perChar);
      for (const [statId, value] of perChar) {
        fromChars.set(statId, (fromChars.get(statId) || 0) + value);
      }
    }
    return fromChars;
  }

  private walkStatsNode(node: any, into: Map<string, number>): void {
    if (!node) return;
    const results = node.results;
    if (results && typeof results === 'object') {
      for (const modeBlock of Object.values(results) as any[]) {
        this.absorbAllTime(modeBlock?.allTime, into);
      }
    }
    this.absorbAllTime(node.allTime, into);
  }

  private absorbAllTime(allTime: any, into: Map<string, number>): void {
    if (!allTime || typeof allTime !== 'object') return;
    for (const [statId, raw] of Object.entries(allTime)) {
      const value = Number((raw as any)?.basic?.value ?? (raw as any)?.value ?? 0);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (!/medal/i.test(statId)) continue;
      into.set(statId, Math.max(into.get(statId) || 0, value));
    }
  }

  private isPrivacyBlocked(res: any): boolean {
    const code = Number(res?.ErrorCode);
    // 1665 PrivacyRestrictionCommon
    return code === 1665 || /privacy/i.test(String(res?.ErrorStatus || '')) || /privacy/i.test(String(res?.Message || ''));
  }

  private isPrivacyError(e: any): boolean {
    const status = e?.error?.ErrorStatus || e?.ErrorStatus || e?.statusText;
    const code = e?.error?.ErrorCode || e?.ErrorCode;
    const msg = e?.error?.Message || e?.message || '';
    return Number(code) === 1665 || /privacy/i.test(String(status)) || /privacy/i.test(String(msg));
  }
}
