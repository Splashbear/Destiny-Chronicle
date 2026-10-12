import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/** Current Bungie name for a membership id, or null if Bungie has none. Throws on transport/API errors. */
export type CurrentNameFetcher = (membershipId: string) => Promise<string | null>;

export interface NameRefreshOptions {
  /** JSON cache file: { [membershipId]: { n: name, at: epoch ms } }. Holds partner ids and names only. */
  cacheFile: string;
  /** how many top partners to refresh per page load (0 disables). */
  top?: number;
  ttlMs?: number;
  concurrency?: number;
  /** stop waiting after this long; calls still running finish in the background and fill the cache. */
  budgetMs?: number;
  /** hard cap on Bungie calls per rolling minute across all visitors. */
  maxCallsPerMinute?: number;
}

export interface NameRefreshStats { considered: number; cached: number; fetched: number; failed: number; skippedRate: number; lateFinished: number; ms: number }

interface Named { membershipId: string; displayName?: string; nameSource?: string }

/**
 * Refreshes the displayed name of a player's top partners to their current Bungie name.
 * Cached on disk with a TTL; any failure (Bungie down, throttled, timeout, budget) keeps the index name.
 * 'Private Guardian' rows (no name anywhere) are left as they are.
 */
export class PartnerNameRefresher {
  private cache = new Map<string, { n: string | null; at: number }>();
  private calls: number[] = [];
  private inflight = new Map<string, Promise<string | null>>();
  private saveTimer: NodeJS.Timeout | null = null;
  readonly top: number; private readonly ttlMs: number; private readonly concurrency: number;
  private readonly budgetMs: number; private readonly maxPerMin: number;
  /** total Bungie calls made by this process (for measurement). */
  bungieCalls = 0;

  constructor(private readonly fetchName: CurrentNameFetcher, private readonly opts: NameRefreshOptions, private readonly now: () => number = Date.now) {
    this.top = Math.max(0, opts.top ?? 25);
    this.ttlMs = opts.ttlMs ?? 24 * 3600_000;
    this.concurrency = Math.max(1, opts.concurrency ?? 8);
    this.budgetMs = opts.budgetMs ?? 4000;
    this.maxPerMin = opts.maxCallsPerMinute ?? 120;
    try {
      const raw = JSON.parse(fs.readFileSync(opts.cacheFile, 'utf8')) as Record<string, { n: string | null; at: number }>;
      for (const [k, v] of Object.entries(raw)) if (v && typeof v.at === 'number') this.cache.set(k, v);
    } catch { /* no cache yet */ }
  }

  private fresh(mid: string) {
    const c = this.cache.get(mid);
    return c && this.now() - c.at < this.ttlMs ? c : null;
  }

  private takeToken(): boolean {
    const t = this.now();
    while (this.calls.length && t - this.calls[0] > 60_000) this.calls.shift();
    if (this.calls.length >= this.maxPerMin) return false;
    this.calls.push(t);
    return true;
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 1000);
    this.saveTimer.unref?.();
  }

  saveNow() {
    try {
      fs.mkdirSync(path.dirname(this.opts.cacheFile), { recursive: true });
      const tmp = this.opts.cacheFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.cache)));
      fs.renameSync(tmp, this.opts.cacheFile);
    } catch (e) {
      logger.warn('Partner name cache save failed', { error: String(e) });
    }
  }

  private lookup(mid: string): Promise<string | null> {
    let p = this.inflight.get(mid);
    if (!p) {
      this.bungieCalls++;
      p = this.fetchName(mid)
        .then((n) => { this.cache.set(mid, { n: n || null, at: this.now() }); this.scheduleSave(); return n || null; })
        .finally(() => this.inflight.delete(mid));
      this.inflight.set(mid, p);
    }
    return p;
  }

  /** Mutates the top partners' displayName / nameSource in place. */
  async refresh(partners: Named[]): Promise<NameRefreshStats> {
    const t0 = this.now();
    const st: NameRefreshStats = { considered: 0, cached: 0, fetched: 0, failed: 0, skippedRate: 0, lateFinished: 0, ms: 0 };
    if (!this.top) return st;
    const todo: Named[] = [];
    for (const p of partners.slice(0, this.top)) {
      if (p.nameSource === 'private' || !/^\d+$/.test(p.membershipId)) continue;
      st.considered++;
      const c = this.fresh(p.membershipId);
      if (c) { st.cached++; if (c.n) { p.displayName = c.n; p.nameSource = 'bungie'; } }
      else todo.push(p);
    }
    let i = 0; let open = true;
    const worker = async () => {
      while (open && i < todo.length) {
        const p = todo[i++];
        if (!this.takeToken()) { st.skippedRate++; continue; }
        try {
          const n = await this.lookup(p.membershipId);
          if (!open) { st.lateFinished++; continue; }
          st.fetched++;
          if (n) { p.displayName = n; p.nameSource = 'bungie'; }
        } catch (e) {
          st.failed++;
          logger.debug('Partner name refresh failed', { error: String(e) });
        }
      }
    };
    const all = Promise.all(Array.from({ length: Math.min(this.concurrency, todo.length) }, worker));
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([all, new Promise<void>((r) => { timer = setTimeout(r, this.budgetMs); })]);
    if (timer) clearTimeout(timer);
    open = false;
    st.ms = this.now() - t0;
    return st;
  }
}
