import fs from 'fs';
import path from 'path';

/**
 * Played With summary queue + store (file based, no extra DB).
 *
 * Layout under PLAYED_WITH_SUMMARY_DIR:
 *   queue.json        owned by the worker only (atomic tmp+rename writes); the API reads it for status.
 *   requests.jsonl    append-only; the API appends {ids, priority, source, at} on a lookup miss,
 *                     the worker ingests and truncates it. Only membership ids are stored (no visitor data).
 *   seeds.json        optional priority list [[label, "id+id", ...]] read by the worker at start.
 *   summaries/<key>.json  legacy combined summary (key = sorted membership ids joined by "+"); read-only fallback.
 *   summaries/acct/<id>.json.gz  v2 per-account summary (see played-with-account.ts). Queue items are now one
 *                     membership id each; multi-id requests are split, and legacy multi-id items are migrated by
 *                     queueing their accounts (the old items stay in queue.json untouched and are never picked).
 */
export type QueueStatus = 'pending' | 'running' | 'done' | 'failed';
export interface QueueItem {
  key: string;
  ids: string[];
  label?: string;
  priority: number; // 0 = seed, 10 = first lookup, 12 = migration, 15 = stale refresh on lookup
  source: 'seed' | 'lookup' | 'refresh' | 'migrate';
  /** Bungie membershipType when known (seeds carry it); otherwise resolved at build time. */
  membershipType?: number;
  bungieGames?: number;
  bungieTopIid?: string;
  status: QueueStatus;
  enqueuedAt: string;
  attempts: number;
  builtAt?: string;
  checkedAt?: string;
  games?: number;
  maxInstanceId?: string;
  partners?: number;
  buildMs?: number;
  error?: string;
  /** Real counts written by the worker while building (null/absent when not building). */
  progress?: BuildProgress;
}
export interface BuildProgress {
  stage: 'loading_games' | 'scanning' | 'ranking' | 'bungie_history' | 'bungie_pgcrs';
  accountsLoaded: number;
  accountsTotal: number;
  games: number;
  batchesDone?: number;
  batchesTotal?: number;
  /** Bungie step: games newer than the archive found / PGCRs fetched of those missing. */
  bungieGames?: number;
  pgcrsDone?: number;
  pgcrsTotal?: number;
  updatedAt: string;
}
export interface Queue { items: Record<string, QueueItem> }
export interface SummaryFile {
  key: string;
  ids: string[];
  label?: string;
  builtAt: string;
  games: number;
  maxInstanceId: string;
  partners: unknown[];
  coverage: unknown;
}

export const summaryKey = (ids: string[]): string =>
  [...new Set(ids.map(String).filter((s) => /^\d{1,20}$/.test(s)))].sort().join('+');

export class SummaryStore {
  constructor(readonly dir: string) {}
  get queuePath() { return path.join(this.dir, 'queue.json'); }
  get requestsPath() { return path.join(this.dir, 'requests.jsonl'); }
  get seedsPath() { return path.join(this.dir, 'seeds.json'); }
  summaryPath(key: string) { return path.join(this.dir, 'summaries', `${key}.json`); }

  ensure(): void { fs.mkdirSync(path.join(this.dir, 'summaries'), { recursive: true }); }

  readQueue(): Queue {
    try { return JSON.parse(fs.readFileSync(this.queuePath, 'utf8')) as Queue; } catch { return { items: {} }; }
  }

  writeQueue(q: Queue): void {
    const tmp = `${this.queuePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(q));
    fs.renameSync(tmp, this.queuePath);
  }

  readSummary(key: string): SummaryFile | null {
    try { return JSON.parse(fs.readFileSync(this.summaryPath(key), 'utf8')) as SummaryFile; } catch { return null; }
  }

  writeSummary(s: SummaryFile): void {
    const p = this.summaryPath(s.key); const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s));
    fs.renameSync(tmp, p);
  }

  /** API side: request a build. Append-only so the API never races the worker on queue.json. */
  request(ids: string[], source: 'lookup' | 'seed' | 'refresh' = 'lookup'): void {
    this.ensure();
    fs.appendFileSync(this.requestsPath, JSON.stringify({ ids, source, at: new Date().toISOString() }) + '\n');
  }

  /** API side: queue position (1-based) of a key among pending items, or null if not queued. */
  status(key: string): { status: QueueStatus | 'requested'; position: number | null; progress?: BuildProgress } {
    const q = this.readQueue(); const it = q.items[key];
    if (!it) return { status: 'requested', position: null };
    if (it.status !== 'pending') return { status: it.status, position: null, progress: it.progress };
    const ahead = Object.values(q.items).filter((x) => x.status === 'pending' && order(x, it) < 0).length;
    return { status: 'pending', position: ahead + 1 };
  }

  /** Worker side: fold requests.jsonl and seeds.json into the queue. */
  ingest(q: Queue, now = new Date()): number {
    let added = 0; let seq = 0; // +1 ms per item keeps arrival order stable within one ingest
    const add = (ids: string[], source: QueueItem['source'], priority: number, label?: string, types?: Map<string, number>) => {
      for (const id of new Set(ids.map(String).filter((x) => /^\d{1,20}$/.test(x)))) {
        const cur = q.items[id];
        if (types?.get(id) && cur && !cur.membershipType) cur.membershipType = types.get(id);
        if (cur) {
          if (cur.status === 'failed' && cur.attempts < 3) cur.status = 'pending';
          if (source === 'refresh' && cur.status === 'done') { cur.status = 'pending'; cur.priority = priority; cur.source = source; }
          else if (cur.status === 'pending' && priority < cur.priority) { cur.priority = priority; cur.source = source; }
          continue;
        }
        if (source === 'refresh') continue; // refresh only applies to built accounts
        q.items[id] = { key: id, ids: [id], label, priority, source, status: 'pending', enqueuedAt: new Date(now.getTime() + seq++).toISOString(), attempts: 0, membershipType: types?.get(id) };
        added++;
      }
    };
    // Migration: accounts of legacy combined items get their own builds (the legacy item is left as is).
    for (const it of Object.values(q.items)) if (it.key.includes('+') && it.status === 'done') add(it.ids, 'migrate', 12, it.label);
    try {
      const seeds = JSON.parse(fs.readFileSync(this.seedsPath, 'utf8').replace(/^\uFEFF/, '')) as unknown[];
      for (const s of seeds) {
        if (!Array.isArray(s) || typeof s[1] !== 'string') continue;
        // optional third field "type/id;type/id" gives each account's membershipType
        const types = new Map<string, number>();
        for (const t of String(s[2] || '').split(';')) { const m = /^(\d+)\/(\d+)/.exec(t.trim()); if (m) types.set(m[2], Number(m[1])); }
        add(s[1].split('+'), 'seed', 0, String(s[0]), types);
      }
    } catch { /* no seeds */ }
    if (fs.existsSync(this.requestsPath)) {
      const work = `${this.requestsPath}.ingest`;
      fs.renameSync(this.requestsPath, work);
      for (const line of fs.readFileSync(work, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (Array.isArray(r.ids)) r.source === 'refresh' ? add(r.ids.map(String), 'refresh', 15) : add(r.ids.map(String), 'lookup', 10);
        } catch { /* skip bad line */ }
      }
      fs.unlinkSync(work);
    }
    return added;
  }
}

export function order(a: QueueItem, b: QueueItem): number {
  return a.priority - b.priority || a.enqueuedAt.localeCompare(b.enqueuedAt) || a.key.localeCompare(b.key);
}

/** Next item: pending by priority, else a done item due for a refresh check. */
export function pickNext(q: Queue, refreshMs: number, now = Date.now()): QueueItem | null {
  // Legacy combined items (key with "+") are never built again; their accounts are migrated instead.
  const items = Object.values(q.items).filter((x) => !x.key.includes('+'));
  const pending = items.filter((x) => x.status === 'pending' || x.status === 'running').sort(order);
  if (pending.length) return pending[0];
  const due = items
    .filter((x) => x.status === 'done' && now - Date.parse(x.checkedAt || x.builtAt || x.enqueuedAt) > refreshMs)
    .sort((a, b) => Date.parse(a.checkedAt || a.builtAt || '') - Date.parse(b.checkedAt || b.builtAt || ''));
  return due[0] || null;
}