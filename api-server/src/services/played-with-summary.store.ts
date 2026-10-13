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
 *   summaries/<key>.json  one finished summary per account (key = sorted membership ids joined by "+").
 */
export type QueueStatus = 'pending' | 'running' | 'done' | 'failed';
export interface QueueItem {
  key: string;
  ids: string[];
  label?: string;
  priority: number; // 0 = seed, 10 = first lookup, 20 = refresh
  source: 'seed' | 'lookup' | 'refresh';
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
  stage: 'loading_games' | 'scanning' | 'ranking';
  accountsLoaded: number;
  accountsTotal: number;
  games: number;
  batchesDone?: number;
  batchesTotal?: number;
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
  request(ids: string[], source: 'lookup' | 'seed' = 'lookup'): void {
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
    const add = (ids: string[], source: QueueItem['source'], priority: number, label?: string) => {
      const key = summaryKey(ids); if (!key) return;
      const cur = q.items[key];
      if (cur) {
        if (cur.status === 'failed' && cur.attempts < 3) cur.status = 'pending';
        if (cur.status === 'pending' && priority < cur.priority) { cur.priority = priority; cur.source = source; }
        return;
      }
      q.items[key] = { key, ids: key.split('+'), label, priority, source, status: 'pending', enqueuedAt: new Date(now.getTime() + seq++).toISOString(), attempts: 0 };
      added++;
    };
    try {
      const seeds = JSON.parse(fs.readFileSync(this.seedsPath, 'utf8').replace(/^\uFEFF/, '')) as unknown[];
      for (const s of seeds) {
        if (Array.isArray(s) && typeof s[1] === 'string') add(s[1].split('+'), 'seed', 0, String(s[0]));
      }
    } catch { /* no seeds */ }
    if (fs.existsSync(this.requestsPath)) {
      const work = `${this.requestsPath}.ingest`;
      fs.renameSync(this.requestsPath, work);
      for (const line of fs.readFileSync(work, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { const r = JSON.parse(line); if (Array.isArray(r.ids)) add(r.ids.map(String), 'lookup', 10); } catch { /* skip bad line */ }
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
  const pending = Object.values(q.items).filter((x) => x.status === 'pending' || x.status === 'running').sort(order);
  if (pending.length) return pending[0];
  const due = Object.values(q.items)
    .filter((x) => x.status === 'done' && now - Date.parse(x.checkedAt || x.builtAt || x.enqueuedAt) > refreshMs)
    .sort((a, b) => Date.parse(a.checkedAt || a.builtAt || '') - Date.parse(b.checkedAt || b.builtAt || ''));
  return due[0] || null;
}