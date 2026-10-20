import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from './bungie-api.service';
import { AssetUrlService } from './asset-url.service';
import {
  AccomplishmentD1Record,
  AccomplishmentD1RecordBook,
  AccountD1RecordBooksResult,
} from '../models/accomplishments-d1.model';
import {
  AccountMedalsResult,
  AccomplishmentMedal,
  MEDAL_MODE_GROUP_ORDER,
  MedalModeGroup,
  MedalModeGroupId,
} from '../models/accomplishments-medals.model';
import { isMedalHistoricalStat, medalModeGroup, medalSubtype } from '../utils/medal-mode-groups';

/** D1 record status: redeemed / complete (community + DIM convention). */
const D1_RECORD_COMPLETE = 1;

@Injectable({ providedIn: 'root' })
export class AccomplishmentsD1Service {
  private readonly bungie = inject(BungieApiService);
  private readonly assetUrl = inject(AssetUrlService);

  private readonly booksCache = new Map<string, AccountD1RecordBooksResult>();
  private readonly medalsCache = new Map<string, AccountMedalsResult>();
  private readonly bookDefCache = new Map<string, any>();
  private readonly recordDefCache = new Map<string, any>();
  private d1StatsDefs: Record<string, any> | null = null;
  private d1StatsDefsPromise: Promise<Record<string, any>> | null = null;

  cacheKey(membershipType: number, membershipId: string): string {
    return `d1|${membershipType}|${membershipId}`;
  }

  async loadRecordBooks(
    membershipType: number,
    membershipId: string
  ): Promise<AccountD1RecordBooksResult> {
    const key = this.cacheKey(membershipType, membershipId);
    const hit = this.booksCache.get(key);
    if (hit) return hit;

    try {
      const booksMap = await this.collectRecordBooksMap(membershipType, membershipId);
      if (booksMap == null) {
        return this.cacheBooks(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          books: [],
          status: 'error',
          message: 'Could not load D1 record books from Bungie',
        });
      }

      const books = await this.buildBooks(booksMap);
      return this.cacheBooks(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        books,
        status: books.length ? 'ok' : 'empty',
        message: books.length ? undefined : 'No D1 record books found for this account',
      });
    } catch (e: any) {
      if (this.isPrivacyError(e)) {
        return this.cacheBooks(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          books: [],
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        });
      }
      return this.cacheBooks(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        books: [],
        status: 'error',
        message: e?.message || 'Could not load D1 record books from Bungie',
      });
    }
  }

  async loadMedals(membershipType: number, membershipId: string): Promise<AccountMedalsResult> {
    const key = this.cacheKey(membershipType, membershipId);
    const hit = this.medalsCache.get(key);
    if (hit) return hit;

    try {
      const [defs, statsRes] = await Promise.all([
        this.ensureD1StatsDefs(),
        firstValueFrom(this.bungie.getD1HistoricalStats(membershipType, membershipId, 0, 'None')),
      ]);

      if (this.isPrivacyBlocked(statsRes)) {
        return this.cacheMedals(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        });
      }

      if (!statsRes || statsRes.ErrorCode !== 1) {
        return this.cacheMedals(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'error',
          message: statsRes?.Message || 'Could not load D1 medal stats from Bungie',
        });
      }

      const counts = this.collectMedalCounts(statsRes.Response);
      const medals: AccomplishmentMedal[] = [];
      for (const [statId, count] of counts) {
        if (count <= 0) continue;
        const def = defs[statId];
        if (def && !isMedalHistoricalStat(def) && !/medal/i.test(statId)) continue;
        const name = String(def?.statName || def?.displayProperties?.name || statId).trim();
        const description = String(
          def?.statDescription || def?.displayProperties?.description || ''
        ).trim();
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
      const totalEarned = medals.reduce((s, m) => s + m.count, 0);
      return this.cacheMedals(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        groups,
        totalEarned,
        status: medals.length ? 'ok' : 'empty',
        message: medals.length ? undefined : 'No D1 medals found for this account',
      });
    } catch (e: any) {
      if (this.isPrivacyError(e)) {
        return this.cacheMedals(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'hidden',
          message: 'Hidden by this player\'s privacy settings',
        });
      }
      return this.cacheMedals(key, {
        membershipId,
        membershipType,
        fetchedAt: new Date().toISOString(),
        groups: [],
        totalEarned: 0,
        status: 'error',
        message: e?.message || 'Could not load D1 medal stats from Bungie',
      });
    }
  }

  private async collectRecordBooksMap(
    membershipType: number,
    membershipId: string
  ): Promise<Record<string, any> | null> {
    const merged: Record<string, any> = {};

    try {
      const accountAdv = await firstValueFrom(
        this.bungie.getD1AccountAdvisors(membershipType, membershipId)
      );
      if (this.isPrivacyBlocked(accountAdv)) {
        throw Object.assign(new Error('privacy'), { ErrorCode: 1665 });
      }
      this.mergeBooks(merged, this.unwrapAdvisorsData(accountAdv)?.recordBooks);
    } catch (e: any) {
      if (this.isPrivacyError(e) || this.isPrivacyBlocked(e)) throw e;
    }

    try {
      const profile = await firstValueFrom(this.bungie.getD1Profile(membershipType as any, membershipId));
      const characters = this.extractD1Characters(profile);
      for (const charId of characters.slice(0, 3)) {
        try {
          const charAdv = await firstValueFrom(
            this.bungie.getD1CharacterAdvisorsV2(membershipType, membershipId, charId)
          );
          this.mergeBooks(merged, this.unwrapAdvisorsData(charAdv)?.recordBooks);
        } catch {
          /* character may be private / gone */
        }
      }
    } catch {
      /* profile optional if account advisors already populated */
    }

    return Object.keys(merged).length ? merged : {};
  }

  private unwrapAdvisorsData(res: any): any {
    if (!res) return null;
    if (res.ErrorCode != null && res.ErrorCode !== 1) return null;
    const response = res.Response ?? res;
    return response?.data ?? response;
  }

  private extractD1Characters(profileRes: any): string[] {
    const data = profileRes?.Response?.data ?? profileRes?.data ?? profileRes?.Response ?? profileRes;
    const chars = data?.characters;
    if (!Array.isArray(chars)) return [];
    return chars
      .map((c: any) => String(c?.characterBase?.characterId || c?.characterId || ''))
      .filter(Boolean);
  }

  /** Prefer higher completedCount when merging across characters. */
  private mergeBooks(into: Record<string, any>, books: Record<string, any> | null | undefined): void {
    if (!books || typeof books !== 'object') return;
    for (const [hash, book] of Object.entries(books)) {
      const cur = into[hash];
      const nextCount = Number((book as any)?.completedCount ?? 0);
      const curCount = Number(cur?.completedCount ?? 0);
      if (!cur || nextCount >= curCount) {
        into[hash] = book;
      }
    }
  }

  private async buildBooks(booksMap: Record<string, any>): Promise<AccomplishmentD1RecordBook[]> {
    const out: AccomplishmentD1RecordBook[] = [];
    for (const [hash, book] of Object.entries(booksMap)) {
      const def = await this.getBookDef(hash);
      const name = String(def?.displayName || def?.displayProperties?.name || `Record Book ${hash}`).trim();
      const iconRaw = def?.icon || def?.displayProperties?.icon || '';
      const recordsObj = (book as any)?.records || {};
      const total =
        Number(def?.recordCount) ||
        (typeof recordsObj === 'object' ? Object.keys(recordsObj).length : 0) ||
        Number((book as any)?.completedCount) ||
        0;
      const completedRecords = await this.buildCompletedRecords(recordsObj);
      const completed = Math.max(
        Number((book as any)?.completedCount ?? 0),
        completedRecords.length
      );
      const percent = Number((book as any)?.percentComplete);
      out.push({
        hash: String(hash),
        name,
        iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
        completed,
        total: total || completed,
        percentComplete: Number.isFinite(percent)
          ? Math.round(percent * (percent <= 1 ? 100 : 1))
          : total
            ? Math.round((completed / total) * 100)
            : 0,
        completedRecords,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  private async buildCompletedRecords(recordsObj: any): Promise<AccomplishmentD1Record[]> {
    if (!recordsObj || typeof recordsObj !== 'object') return [];
    const out: AccomplishmentD1Record[] = [];
    for (const [hash, rec] of Object.entries(recordsObj) as [string, any][]) {
      if (!this.isRecordComplete(rec)) continue;
      const def = await this.getRecordDef(hash);
      const name = String(def?.displayName || def?.displayProperties?.name || hash).trim();
      const iconRaw = def?.icon || def?.displayProperties?.icon || '';
      out.push({
        hash: String(hash),
        name,
        iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  private isRecordComplete(rec: any): boolean {
    if (!rec) return false;
    const status = Number(rec.status ?? 0);
    if (status === D1_RECORD_COMPLETE) return true;
    const objectives = rec.objectives;
    if (Array.isArray(objectives) && objectives.length) {
      return objectives.every((o: any) => o?.isComplete === true);
    }
    return false;
  }

  private async getBookDef(hash: string): Promise<any | null> {
    if (this.bookDefCache.has(hash)) return this.bookDefCache.get(hash) || null;
    try {
      const raw = await firstValueFrom(
        this.bungie.getD1SingleDefinition('DestinyRecordBookDefinition', hash)
      );
      const def = raw?.data ?? raw;
      this.bookDefCache.set(hash, def);
      return def;
    } catch {
      this.bookDefCache.set(hash, null);
      return null;
    }
  }

  private async getRecordDef(hash: string): Promise<any | null> {
    if (this.recordDefCache.has(hash)) return this.recordDefCache.get(hash) || null;
    try {
      const raw = await firstValueFrom(
        this.bungie.getD1SingleDefinition('DestinyRecordDefinition', hash)
      );
      const def = raw?.data ?? raw;
      this.recordDefCache.set(hash, def);
      return def;
    } catch {
      this.recordDefCache.set(hash, null);
      return null;
    }
  }

  private async ensureD1StatsDefs(): Promise<Record<string, any>> {
    if (this.d1StatsDefs) return this.d1StatsDefs;
    if (!this.d1StatsDefsPromise) {
      this.d1StatsDefsPromise = (async (): Promise<Record<string, any>> => {
        const res = await firstValueFrom(this.bungie.getD1HistoricalStatsDefinitions());
        if (res?.ErrorCode === 1 && res.Response && typeof res.Response === 'object') {
          this.d1StatsDefs = res.Response;
          return this.d1StatsDefs;
        }
        // Some D1 responses nest under Response without ErrorCode wrapper when proxied
        if (res && typeof res === 'object' && !('ErrorCode' in (res as any))) {
          this.d1StatsDefs = res as Record<string, any>;
          return this.d1StatsDefs;
        }
        throw new Error(res?.Message || 'Failed to load D1 historical stats definitions');
      })().catch((err) => {
        this.d1StatsDefsPromise = null;
        throw err;
      });
    }
    return this.d1StatsDefsPromise;
  }

  private collectMedalCounts(response: any): Map<string, number> {
    const into = new Map<string, number>();
    const data = response?.data ?? response;
    this.absorbAllTime(data?.allTime, into);
    const results = data?.results;
    if (results && typeof results === 'object') {
      for (const modeBlock of Object.values(results) as any[]) {
        this.absorbAllTime(modeBlock?.allTime, into);
      }
    }
    // Character aggregate envelope (rare on D1)
    const characters = data?.characters;
    if (characters && typeof characters === 'object') {
      for (const ch of Object.values(characters) as any[]) {
        this.absorbAllTime(ch?.allTime, into);
      }
    }
    return into;
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

  private groupMedals(medals: AccomplishmentMedal[]): MedalModeGroup[] {
    const map = new Map<MedalModeGroupId, AccomplishmentMedal[]>();
    for (const id of MEDAL_MODE_GROUP_ORDER) map.set(id, []);
    for (const medal of medals) map.get(medal.modeGroup)!.push(medal);
    return MEDAL_MODE_GROUP_ORDER.map((id) => ({ id, medals: map.get(id)! })).filter(
      (g) => g.medals.length > 0
    );
  }

  private cacheBooks(key: string, result: AccountD1RecordBooksResult): AccountD1RecordBooksResult {
    this.booksCache.set(key, result);
    return result;
  }

  private cacheMedals(key: string, result: AccountMedalsResult): AccountMedalsResult {
    this.medalsCache.set(key, result);
    return result;
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
