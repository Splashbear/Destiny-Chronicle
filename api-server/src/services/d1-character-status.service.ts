import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Current (non-deleted) D1 characters per account, from Bungie's D1 account endpoint
 * (`/d1/Platform/Destiny/{membershipType}/Account/{membershipId}/`), which lists only the
 * characters still on the account. Site figures count only these characters: players often
 * deleted a character to roll a new one, and those games are not part of the account's record.
 *
 * Cached in a small JSON file keyed by `D1|membershipType|membershipId` (default TTL 7 days).
 * Fail open: when Bungie cannot be reached and nothing is cached, callers get null and must
 * not filter. A stale cache entry is used when a refresh fails.
 */
export interface D1CharacterCacheEntry {
  game: 'D1';
  membershipType: number;
  membershipId: string;
  characterIds: string[];
  fetchedAt: string;
}

interface CacheFile {
  version: 1;
  entries: Record<string, D1CharacterCacheEntry>;
}

export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface D1CharacterStatusOptions {
  apiKey: string;
  cachePath: string;
  d1ApiRoot?: string;
  ttlMs?: number;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  now?: () => number;
}

export const D1_CHARACTER_TTL_MS = 7 * 24 * 3600 * 1000;
/** D1 only had Xbox (1) and PlayStation (2) accounts. */
const D1_MEMBERSHIP_TYPES = [1, 2];

export function d1CharacterCacheKey(membershipType: number, membershipId: string): string {
  return `D1|${membershipType}|${membershipId}`;
}

export class D1CharacterStatusService {
  private readonly apiKey: string;
  private readonly cachePath: string;
  private readonly d1ApiRoot: string;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private cache: CacheFile | null = null;
  private inflight = new Map<string, Promise<Set<string> | null>>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(opts: D1CharacterStatusOptions) {
    this.apiKey = opts.apiKey;
    this.cachePath = opts.cachePath;
    this.d1ApiRoot = (opts.d1ApiRoot || 'https://www.bungie.net/d1/Platform').replace(/\/+$/, '');
    this.ttlMs = opts.ttlMs ?? D1_CHARACTER_TTL_MS;
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init) as any);
    this.now = opts.now ?? (() => Date.now());
  }

  private async load(): Promise<CacheFile> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse(await fs.readFile(this.cachePath, 'utf8'));
      this.cache = raw && raw.entries ? { version: 1, entries: raw.entries } : { version: 1, entries: {} };
    } catch {
      this.cache = { version: 1, entries: {} };
    }
    return this.cache;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      if (!this.cachePath || !this.cache) return;
      try {
        await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
        const tmp = `${this.cachePath}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(this.cache, null, 1), 'utf8');
        await fs.rename(tmp, this.cachePath);
      } catch (error) {
        logger.warn('D1 character cache write failed', { cachePath: this.cachePath, error: String(error) });
      }
    });
    return this.writeChain;
  }

  /** Seed or overwrite one cache entry (used by tests and one-off seeding). */
  async put(entry: Omit<D1CharacterCacheEntry, 'game'> & { game?: 'D1' }): Promise<void> {
    const c = await this.load();
    c.entries[d1CharacterCacheKey(entry.membershipType, entry.membershipId)] = { ...entry, game: 'D1' };
    await this.persist();
  }

  private fresh(e: D1CharacterCacheEntry | undefined): boolean {
    if (!e) return false;
    const t = Date.parse(e.fetchedAt);
    return Number.isFinite(t) && this.now() - t < this.ttlMs;
  }

  /** Bungie call. Returns ids, `null` when Bungie has no D1 account of that type, throws on errors. */
  private async fetchCurrent(membershipType: number, membershipId: string): Promise<string[] | null> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const url = `${this.d1ApiRoot}/Destiny/${membershipType}/Account/${membershipId}/`;
      const res = await this.fetchFn(url, { headers: { 'X-API-Key': this.apiKey }, signal: ctl.signal });
      let body: any = null;
      try { body = await res.json(); } catch { body = null; }
      const code = body?.ErrorCode;
      if (res.ok && code === 1) {
        const chars = body?.Response?.data?.characters;
        if (!Array.isArray(chars)) throw new Error('D1 account response has no characters list');
        return chars
          .map((c: any) => String(c?.characterBase?.characterId ?? c?.characterId ?? ''))
          .filter((id: string) => /^\d+$/.test(id));
      }
      // Account not found for this platform (wrong membershipType / no D1 account).
      if (code === 1601 || code === 1620 || code === 1618 || res.status === 404) return null;
      throw new Error(`Bungie D1 account error: HTTP ${res.status} ${body?.ErrorStatus ?? ''}`.trim());
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Current character ids for a D1 account, or null when unknown (caller must not filter).
   * membershipType: 1/2 when known from the rows; otherwise both D1 platforms are tried.
   */
  async getCurrentCharacterIds(membershipId: string, membershipType?: number | null): Promise<Set<string> | null> {
    if (!/^\d+$/.test(String(membershipId))) return null;
    const types = membershipType && D1_MEMBERSHIP_TYPES.includes(membershipType) ? [membershipType] : D1_MEMBERSHIP_TYPES;
    const flightKey = `${types.join(',')}|${membershipId}`;
    const existing = this.inflight.get(flightKey);
    if (existing) return existing;
    const p = this.resolve(membershipId, types).finally(() => this.inflight.delete(flightKey));
    this.inflight.set(flightKey, p);
    return p;
  }

  private async resolve(membershipId: string, types: number[]): Promise<Set<string> | null> {
    const c = await this.load();
    for (const ty of types) {
      const e = c.entries[d1CharacterCacheKey(ty, membershipId)];
      if (this.fresh(e)) return new Set(e!.characterIds);
    }
    if (!this.apiKey) {
      const stale = types.map(ty => c.entries[d1CharacterCacheKey(ty, membershipId)]).find(Boolean);
      if (stale) return new Set(stale.characterIds);
      logger.warn('D1 character filter skipped: no Bungie API key and no cache', { membershipId });
      return null;
    }
    let lastError: unknown = null;
    for (const ty of types) {
      try {
        const ids = await this.fetchCurrent(ty, membershipId);
        if (ids === null) continue;
        c.entries[d1CharacterCacheKey(ty, membershipId)] = {
          game: 'D1', membershipType: ty, membershipId, characterIds: ids, fetchedAt: new Date(this.now()).toISOString(),
        };
        await this.persist();
        return new Set(ids);
      } catch (error) {
        lastError = error;
      }
    }
    const stale = types.map(ty => c.entries[d1CharacterCacheKey(ty, membershipId)]).find(Boolean);
    if (stale) {
      logger.warn('D1 character refresh failed; using stale cache', { membershipId, error: String(lastError) });
      return new Set(stale.characterIds);
    }
    logger.warn('D1 character filter skipped (fail open): Bungie unavailable and no cache', {
      membershipId,
      error: lastError ? String(lastError) : 'no D1 account found',
    });
    return null;
  }
}