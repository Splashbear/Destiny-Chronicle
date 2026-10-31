import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from './bungie-api.service';
import { AssetUrlService } from './asset-url.service';
import {
  AccomplishmentD1Record,
  AccomplishmentD1RecordBook,
  AccomplishmentD1RecordBookPage,
  AccountD1RecordBooksResult,
} from '../models/accomplishments-d1.model';
import {
  AccountMedalsResult,
  AccomplishmentMedal,
  MEDAL_MODE_GROUP_ORDER,
  MedalModeGroup,
  MedalModeGroupId,
} from '../models/accomplishments-medals.model';
import {
  isAggregateMedalStat,
  isMedalHistoricalStat,
  lookupD1MedalCatalog,
  medalModeGroup,
  medalSubtype,
} from '../utils/medal-mode-groups';
import {
  D1_RECORD_BOOKS,
  lookupD1RecordCatalog,
  normalizeD1RecordName,
} from '../data/d1-record-books-catalog';

/**
 * Well-known D1 record book hashes → English names.
 * Hashes confirmed from live Advisors responses (Splashbear) + Bungie/DIM docs.
 */
const D1_RECORD_BOOK_NAMES: Record<string, string> = {
  // Live Advisors hashes (see Accomplishments UI)
  '243968262': 'Rise of Iron',
  '840570351': 'Age of Triumph',
  // 16/16 — often Sparrow Racing (8) + another small book; name from Manifest when available
  '3471683641': 'Sparrow Racing League',
  // If Advisors returns Vanguard Elite as its own book hash, add it here when discovered
  // Moments of Triumph (Year 1 / Year 2 variants)
  '2255270301': 'Moments of Triumph',
  '2175864601': 'Moments of Triumph',
  // Older / alternate hashes
  '2986954596': 'Age of Triumph',
  '1875139865': 'Rise of Iron',
  '3646410682': 'Sparrow Racing League',
  '2031239885': 'The Dark Below',
  '1887555665': 'House of Wolves',
  '2744717544': 'April Update',
  '1369572104': 'Festival of the Lost',
  '2259814245': 'The Dawning',
  '3643225510': 'Crimson Days',
  '1414574607': 'The Taken King',
  '225527030': 'The Taken King',
};

/** Map book display name → catalog book name for page/record overlay. */
const D1_BOOK_NAME_TO_CATALOG: Record<string, string> = {
  'rise of iron': 'Rise of Iron',
  'age of triumph': 'Age of Triumph',
  'moments of triumph': 'Moments of Triumph',
  'sparrow racing league': 'Sparrow Racing League',
  'sparrow racing': 'Sparrow Racing League',
  'vanguard elite': 'Rise of Iron',
};

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
    // Bump when catalog / naming / medals parse fixes change so session cache cannot serve stale rows
    return `d1|v5|${membershipType}|${membershipId}`;
  }

  clearSessionCache(): void {
    this.booksCache.clear();
    this.medalsCache.clear();
    this.bookDefCache.clear();
    this.recordDefCache.clear();
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
      const defs = await this.ensureD1StatsDefs().catch(() => ({} as Record<string, any>));
      // Prefer Stats/Account (merged characters) — same source as D1 medal handoffs.
      // Character Stats/0 is fallback; avoid Mayhem in modes (Bungie ErrorCode 7).
      let statsRes: any = null;
      try {
        statsRes = await firstValueFrom(
          this.bungie.getD1HistoricalStatsForAccount(membershipType, membershipId)
        );
      } catch {
        statsRes = null;
      }
      if (!statsRes || statsRes.ErrorCode !== 1) {
        try {
          statsRes = await firstValueFrom(
            this.bungie.getD1HistoricalStats(membershipType, membershipId, 0)
          );
        } catch {
          /* keep prior */
        }
      }

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
        const code = Number(statsRes?.ErrorCode);
        const disabled = code === 5;
        return this.cacheMedals(key, {
          membershipId,
          membershipType,
          fetchedAt: new Date().toISOString(),
          groups: [],
          totalEarned: 0,
          status: 'error',
          message: disabled
            ? 'Bungie no longer returns Destiny 1 medal stats for this account (API disabled).'
            : statsRes?.Message || 'Could not load D1 medal stats from Bungie',
        });
      }

      const counts = this.collectMedalCounts(statsRes.Response);
      const medals: AccomplishmentMedal[] = [];
      for (const [statId, count] of counts) {
        if (count <= 0) continue;
        const def =
          defs[statId] ||
          defs[statId.toLowerCase()] ||
          Object.entries(defs).find(([k]) => k.toLowerCase() === String(statId).toLowerCase())?.[1];
        const catalog = lookupD1MedalCatalog(statId);
        const rawName = String(
          def?.statName || def?.displayProperties?.name || def?.displayName || ''
        ).trim();
        const name = catalog?.name || rawName || (/^\d+$/.test(statId) ? '' : statId);
        if (!name || isAggregateMedalStat(statId, name || rawName)) continue;
        // Skip pure hash labels with no catalog match
        if (!catalog && /^\d+$/.test(name)) continue;
        if (def && !isMedalHistoricalStat(def) && !/medal/i.test(statId) && !catalog) continue;
        const description =
          catalog?.description ||
          String(def?.statDescription || def?.displayProperties?.description || '').trim();
        const iconRaw = def?.iconImage || def?.displayProperties?.icon || '';
        const opts = { name, game: 'D1' as const, def };
        medals.push({
          statId,
          name,
          description,
          iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
          count,
          modeGroup: medalModeGroup(statId, def?.modes, opts),
          subtype: medalSubtype(statId, def, opts),
          catalogOrder: catalog?.order,
        });
      }

      medals.sort(
        (a, b) =>
          (a.catalogOrder ?? 1e9) - (b.catalogOrder ?? 1e9) ||
          b.count - a.count ||
          a.name.localeCompare(b.name)
      );
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
      this.absorbAdvisorDefinitions(accountAdv);
      this.mergeBooks(merged, this.unwrapAdvisorsData(accountAdv)?.recordBooks);
    } catch (e: any) {
      if (this.isPrivacyError(e) || this.isPrivacyBlocked(e)) throw e;
    }

    try {
      const profile = await firstValueFrom(this.bungie.getD1Profile(membershipType as any, membershipId));
      const characters = this.extractD1Characters(profile).slice(0, 3);
      // Character Advisors are independent — overlap instead of stacking ~1–3s each.
      const charResults = await Promise.all(
        characters.map(async (charId) => {
          try {
            return await firstValueFrom(
              this.bungie.getD1CharacterAdvisorsV2(membershipType, membershipId, charId)
            );
          } catch {
            return null; /* character may be private / gone */
          }
        })
      );
      for (const charAdv of charResults) {
        if (!charAdv) continue;
        this.absorbAdvisorDefinitions(charAdv);
        this.mergeBooks(merged, this.unwrapAdvisorsData(charAdv)?.recordBooks);
      }
    } catch {
      /* profile optional if account advisors already populated */
    }

    return Object.keys(merged).length ? merged : {};
  }

  /** Pull DestinyRecordBookDefinition / DestinyRecordDefinition out of definitions=true Advisors. */
  private absorbAdvisorDefinitions(res: any): void {
    const response = res?.Response ?? res;
    const defs =
      response?.definitions ||
      response?.Definitions ||
      response?.data?.definitions ||
      null;
    if (!defs || typeof defs !== 'object') return;

    const books =
      defs.DestinyRecordBookDefinition ||
      defs.recordBooks ||
      defs.RecordBooks ||
      null;
    if (books && typeof books === 'object') {
      for (const [hash, def] of Object.entries(books)) {
        if (def) this.bookDefCache.set(String(hash), def);
      }
    }

    const records =
      defs.DestinyRecordDefinition || defs.records || defs.Records || null;
    if (records && typeof records === 'object') {
      for (const [hash, def] of Object.entries(records)) {
        if (def) this.recordDefCache.set(String(hash), def);
      }
    }
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
      const fromDef = String(
        def?.displayName || def?.displayProperties?.name || def?.name || ''
      ).trim();
      const fromStatic = D1_RECORD_BOOK_NAMES[String(hash)] || '';
      const name = fromDef || fromStatic || `Record Book ${hash}`;
      const iconRaw = def?.icon || def?.displayProperties?.icon || '';
      const recordsObj = (book as any)?.records || {};
      const { pages, allRecords } = await this.buildBookPages(name, def, recordsObj);
      const completedRecords = allRecords.filter((r) => r.complete);
      const completed = Math.max(
        Number((book as any)?.completedCount ?? 0),
        completedRecords.length
      );
      const total =
        Number(def?.recordCount) ||
        allRecords.length ||
        (typeof recordsObj === 'object' ? Object.keys(recordsObj).length : 0) ||
        completed;
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
        pages,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  /**
   * Build pages like DIM: Manifest pages (or catalog pages) × Advisors record progress.
   * Completion = every objective isComplete (DIM rule), not status bits alone.
   */
  private async buildBookPages(
    bookName: string,
    bookDef: any | null,
    recordsObj: Record<string, any>
  ): Promise<{ pages: AccomplishmentD1RecordBookPage[]; allRecords: AccomplishmentD1Record[] }> {
    const catalogBook = this.catalogBookForName(bookName);
    const byHash = new Map<string, any>();
    if (recordsObj && typeof recordsObj === 'object') {
      for (const [h, rec] of Object.entries(recordsObj)) {
        byHash.set(String(h), rec);
        const rh = (rec as any)?.recordHash;
        if (rh != null) byHash.set(String(rh), rec);
      }
    }

    type PagePlan = { name: string; description?: string; recordHashes: string[] };
    const pagePlans: PagePlan[] = [];

    const defPages = Array.isArray(bookDef?.pages) ? bookDef.pages : [];
    for (const page of defPages) {
      // Skip rewards-only pages (DIM: displayStyle === 1)
      if (Number(page?.displayStyle) === 1) continue;
      const pageName = String(page?.displayName || '').trim() || 'Page';
      const hashes = (Array.isArray(page?.records) ? page.records : [])
        .map((r: any) => String(r?.recordHash ?? r?.hash ?? ''))
        .filter(Boolean);
      if (!hashes.length) continue;
      pagePlans.push({
        name: pageName,
        description: String(page?.displayDescription || '').trim(),
        recordHashes: hashes,
      });
    }

    // When Manifest pages are missing, zip Advisors record hashes to catalog order
    // (ROI = 32, Age of Triumph = 96 — hash order from Advisors is usually stable).
    if (!pagePlans.length && catalogBook) {
      const hashes = [...byHash.keys()].filter((h, i, arr) => arr.indexOf(h) === i);
      const catalogFlat = catalogBook.pages.flatMap((p) =>
        p.records.map((r) => ({ page: p.name, record: r }))
      );
      if (hashes.length && catalogFlat.length && hashes.length === catalogFlat.length) {
        let offset = 0;
        for (const page of catalogBook.pages) {
          const slice = hashes.slice(offset, offset + page.records.length);
          offset += page.records.length;
          pagePlans.push({ name: page.name, recordHashes: slice });
        }
      } else if (hashes.length === 16) {
        // Common: Sparrow Racing (8) + Moments of Triumph Y2 (8) surfaced as one Advisors book
        const mot = D1_RECORD_BOOKS.find((b) => b.name === 'Moments of Triumph');
        const srl = D1_RECORD_BOOKS.find((b) => b.name === 'Sparrow Racing League');
        if (mot && srl) {
          const combined = [...mot.pages, ...srl.pages];
          let offset = 0;
          for (const page of combined) {
            const slice = hashes.slice(offset, offset + page.records.length);
            offset += page.records.length;
            pagePlans.push({ name: page.name, recordHashes: slice });
          }
        }
      }
    }

    const pages: AccomplishmentD1RecordBookPage[] = [];
    const allRecords: AccomplishmentD1Record[] = [];

    if (pagePlans.length && pagePlans.some((p) => p.recordHashes.length)) {
      for (const plan of pagePlans) {
        const catalogPage = catalogBook?.pages.find(
          (p) => normalizeD1RecordName(p.name) === normalizeD1RecordName(plan.name)
        );
        const pageRecords: AccomplishmentD1Record[] = [];
        for (let i = 0; i < plan.recordHashes.length; i++) {
          const h = plan.recordHashes[i];
          const raw = byHash.get(h);
          const catalogHint = catalogPage?.records[i] || null;
          const built = await this.buildOneRecord(h, raw, plan.name, catalogHint);
          pageRecords.push(built);
          allRecords.push(built);
        }
        if (pageRecords.length) {
          pages.push({ name: plan.name, records: pageRecords });
        }
      }
    } else if (catalogBook) {
      // No Manifest page hashes — show catalog structure, attach progress when def name matches
      const remaining = new Map(byHash);
      for (const page of catalogBook.pages) {
        const pageRecords: AccomplishmentD1Record[] = [];
        for (const catRec of page.records) {
          let matchedHash = '';
          let matchedRaw: any = null;
          for (const [h, raw] of remaining) {
            const def = await this.getRecordDef(h);
            const defName = String(def?.displayName || def?.displayProperties?.name || '').trim();
            if (defName && normalizeD1RecordName(defName) === normalizeD1RecordName(catRec.name)) {
              matchedHash = h;
              matchedRaw = raw;
              break;
            }
          }
          if (matchedHash) remaining.delete(matchedHash);
          const built = await this.buildOneRecord(
            matchedHash || `catalog:${normalizeD1RecordName(catRec.name)}`,
            matchedRaw,
            page.name,
            catRec
          );
          // Only include if we have live progress OR treat catalog-only as incomplete placeholders
          if (matchedRaw) {
            pageRecords.push(built);
            allRecords.push(built);
          }
        }
        if (pageRecords.length) pages.push({ name: page.name, records: pageRecords });
      }
      // Leftover Advisors records not matched to catalog
      for (const [h, raw] of remaining) {
        const built = await this.buildOneRecord(h, raw, undefined, null);
        allRecords.push(built);
      }
      if (allRecords.length && !pages.length) {
        pages.push({ name: 'Records', records: allRecords });
      }
    } else {
      // Flat list from Advisors only
      for (const [h, raw] of byHash) {
        const built = await this.buildOneRecord(h, raw, undefined, null);
        allRecords.push(built);
      }
      if (allRecords.length) pages.push({ name: 'Records', records: allRecords });
    }

    return { pages, allRecords };
  }

  private catalogBookForName(bookName: string) {
    const key = normalizeD1RecordName(bookName);
    const mapped = D1_BOOK_NAME_TO_CATALOG[key] || bookName;
    return (
      D1_RECORD_BOOKS.find((b) => normalizeD1RecordName(b.name) === normalizeD1RecordName(mapped)) ||
      null
    );
  }

  private async buildOneRecord(
    hash: string,
    raw: any | null | undefined,
    pageName: string | undefined,
    catalogHint: { name: string; description: string; order?: number } | null
  ): Promise<AccomplishmentD1Record> {
    const def = hash.startsWith('catalog:') ? null : await this.getRecordDef(hash);
    const fromDef = String(def?.displayName || def?.displayProperties?.name || '').trim();
    const catalog =
      (fromDef ? lookupD1RecordCatalog(fromDef) : null) ||
      (catalogHint ? lookupD1RecordCatalog(catalogHint.name) : null);
    const name =
      fromDef ||
      catalog?.name ||
      catalogHint?.name ||
      (hash.startsWith('catalog:') ? catalogHint?.name || 'Record' : `Record ${hash}`);
    const description =
      String(def?.description || def?.displayProperties?.description || '').trim() ||
      catalog?.description ||
      catalogHint?.description ||
      '';
    const iconRaw = def?.icon || def?.displayProperties?.icon || '';
    const objectives = Array.isArray(raw?.objectives) ? raw.objectives : [];
    const complete = this.isRecordComplete(raw);
    return {
      hash: String(hash),
      name,
      description,
      iconPath: iconRaw ? this.assetUrl.resolve(iconRaw) : '',
      page: pageName || catalog?.page,
      complete,
      progressText: this.formatObjectives(objectives),
    };
  }

  /** DIM rule: complete when every objective reports isComplete. */
  private isRecordComplete(rec: any): boolean {
    if (!rec) return false;
    const objectives = rec.objectives;
    if (Array.isArray(objectives) && objectives.length) {
      return objectives.every((o: any) => o?.isComplete === true);
    }
    // Fallback when objectives missing: status bit / redeemed
    const status = Number(rec.status ?? 0);
    return status === 1 || (status & 1) === 1;
  }

  private formatObjectives(objectives: any[]): string | undefined {
    if (!objectives?.length) return undefined;
    const parts = objectives.map((o) => {
      if (o?.isComplete) return 'Complete';
      const progress = o?.progress;
      const required = o?.completionValue ?? o?.destination ?? o?.objectiveHash;
      if (progress != null && required != null && required !== '') {
        return `${Number(progress).toLocaleString()} / ${Number(required).toLocaleString()}`;
      }
      if (progress != null) return String(progress);
      return '';
    }).filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
  }

  private unwrapDefinition(raw: any): any | null {
    if (!raw || typeof raw !== 'object') return null;
    // D1 Manifest responses vary: Response, Response.data, or bare definition
    const candidates = [raw?.data, raw?.Response?.data, raw?.Response, raw];
    for (const c of candidates) {
      if (c && typeof c === 'object' && (c.displayName || c.displayProperties || c.icon || c.hash)) {
        return c;
      }
    }
    return raw?.data ?? raw;
  }

  private defCacheGet(cache: Map<string, any>, hash: string): any | undefined {
    if (cache.has(hash)) return cache.get(hash);
    const n = Number(hash);
    if (Number.isFinite(n)) {
      const unsigned = String(n >>> 0);
      const signed = String(n | 0);
      if (cache.has(unsigned)) return cache.get(unsigned);
      if (cache.has(signed)) return cache.get(signed);
    }
    return undefined;
  }

  private async getBookDef(hash: string): Promise<any | null> {
    const hit = this.defCacheGet(this.bookDefCache, hash);
    if (hit !== undefined) return hit || null;
    try {
      const raw = await firstValueFrom(
        this.bungie.getD1SingleDefinition('DestinyRecordBookDefinition', hash)
      );
      const def = this.unwrapDefinition(raw);
      this.bookDefCache.set(String(hash), def);
      return def;
    } catch {
      this.bookDefCache.set(String(hash), null);
      return null;
    }
  }

  private async getRecordDef(hash: string): Promise<any | null> {
    const hit = this.defCacheGet(this.recordDefCache, hash);
    if (hit !== undefined) return hit || null;
    try {
      const raw = await firstValueFrom(
        this.bungie.getD1SingleDefinition('DestinyRecordDefinition', hash)
      );
      const def = this.unwrapDefinition(raw);
      this.recordDefCache.set(String(hash), def);
      return def;
    } catch {
      this.recordDefCache.set(String(hash), null);
      return null;
    }
  }

  private async ensureD1StatsDefs(): Promise<Record<string, any>> {
    if (this.d1StatsDefs) return this.d1StatsDefs;
    if (!this.d1StatsDefsPromise) {
      this.d1StatsDefsPromise = (async (): Promise<Record<string, any>> => {
        const res = await firstValueFrom(this.bungie.getD1HistoricalStatsDefinitions());
        let raw: any = null;
        if (res?.ErrorCode === 1 && res.Response && typeof res.Response === 'object') {
          raw = res.Response;
        } else if (res && typeof res === 'object' && !('ErrorCode' in (res as any))) {
          raw = res;
        }
        if (!raw) throw new Error(res?.Message || 'Failed to load D1 historical stats definitions');
        // Normalize to lowercase keys so catalog + API casing both hit
        const normalized: Record<string, any> = {};
        for (const [k, v] of Object.entries(raw)) {
          normalized[k] = v;
          normalized[String(k).toLowerCase()] = v;
          const sid = String((v as any)?.statId || '').trim();
          if (sid) {
            normalized[sid] = v;
            normalized[sid.toLowerCase()] = v;
          }
        }
        this.d1StatsDefs = normalized;
        return this.d1StatsDefs;
      })().catch((err) => {
        this.d1StatsDefsPromise = null;
        throw err;
      });
    }
    return this.d1StatsDefsPromise;
  }

  private collectMedalCounts(response: any): Map<string, number> {
    const into = new Map<string, number>();
    const data = response?.data ?? response?.Response?.data ?? response?.Response ?? response;
    if (!data || typeof data !== 'object') return into;

    // Account endpoint: prefer merged aggregates (max across modes, no double-count)
    const fromMerged = new Map<string, number>();
    this.walkMedalStatsNode(data.mergedAllCharacters, fromMerged);
    this.walkMedalStatsNode(data.mergedDeletedCharacters, fromMerged);
    if (fromMerged.size > 0) {
      return fromMerged;
    }

    this.walkMedalStatsNode(data, into);
    // Character Stats/0 keys mode blocks at the top level (allPvP, allPvE, …)
    for (const [k, v] of Object.entries(data)) {
      if (/^all/i.test(k) || /pvp|pve|strike|raid|iron|trial|arena|rift|racing|supremacy|zone|patrol|story/i.test(k)) {
        this.walkMedalStatsNode(v, into);
      }
    }
    return into;
  }

  private walkMedalStatsNode(node: any, into: Map<string, number>): void {
    if (!node || typeof node !== 'object') return;
    this.absorbAllTime(node.allTime, into);
    this.walkMedalStatsNode(node.merged, into);
    const results = node.results;
    if (results && typeof results === 'object') {
      for (const modeBlock of Object.values(results) as any[]) {
        this.absorbAllTime(modeBlock?.allTime, into);
        this.walkMedalStatsNode(modeBlock, into);
      }
    }
    const characters = node.characters;
    if (characters && typeof characters === 'object') {
      for (const ch of Object.values(characters) as any[]) {
        this.walkMedalStatsNode(ch, into);
        this.walkMedalStatsNode(ch?.merged, into);
      }
    }
    // Only walk these when present on this node (Account root) — avoid re-entry loops
    if (node.mergedAllCharacters) this.walkMedalStatsNode(node.mergedAllCharacters, into);
    if (node.mergedDeletedCharacters) this.walkMedalStatsNode(node.mergedDeletedCharacters, into);
  }

  private absorbAllTime(allTime: any, into: Map<string, number>): void {
    if (!allTime || typeof allTime !== 'object') return;
    for (const [statId, raw] of Object.entries(allTime)) {
      const value = Number((raw as any)?.basic?.value ?? (raw as any)?.value ?? 0);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (!/medal/i.test(statId)) continue;
      if (isAggregateMedalStat(statId)) continue;
      into.set(statId, Math.max(into.get(statId) || 0, value));
    }
  }

  private groupMedals(medals: AccomplishmentMedal[]): MedalModeGroup[] {
    const map = new Map<MedalModeGroupId, AccomplishmentMedal[]>();
    for (const id of MEDAL_MODE_GROUP_ORDER) map.set(id, []);
    for (const medal of medals) {
      const id: MedalModeGroupId =
        medal.modeGroup === 'Other' || !map.has(medal.modeGroup) ? 'Crucible' : medal.modeGroup;
      map.get(id)!.push(medal);
    }
    return MEDAL_MODE_GROUP_ORDER.map((id) => ({ id, medals: map.get(id)! }));
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
