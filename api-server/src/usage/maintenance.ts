import fs from 'fs';
import path from 'path';

/**
 * W29 maintenance run by the API process itself: log retention, weekly usage
 * summary, nightly self-check (HEALTH.json / HEALTH.md). No visitor data is read
 * or written: usage lines only hold route, game, membership IDs looked up,
 * status, timing and row counts.
 */

export interface UsageLine {
  ts_utc?: string;
  route?: string;
  game?: string | null;
  membership_ids?: string[];
  status?: number;
  ms?: number;
  self?: boolean;
}

export interface UsageSummary {
  from: string;
  to: string;
  generated_utc: string;
  requests: number;
  self_requests_excluded: number;
  errors_4xx: number;
  errors_5xx: number;
  unique_accounts: number;
  account_lookups: number;
  ms_p50: number | null;
  ms_p95: number | null;
  by_route: Record<string, number>;
  by_game: Record<string, number>;
  top_accounts: Array<{ membership_id: string; lookups: number }>;
}

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/** Collapse numeric path segments so routes group (e.g. GET /players/:id/activities). */
export function routeKey(route: string): string {
  return route.replace(/\/\d{3,}(?=\/|$)/g, '/:id');
}

export function summarize(lines: UsageLine[], from: string, to: string, topN = 100): UsageSummary {
  const perAcct = new Map<string, number>();
  const byRoute: Record<string, number> = {};
  const byGame: Record<string, number> = {};
  const ms: number[] = [];
  let requests = 0, self = 0, e4 = 0, e5 = 0, lookups = 0;
  for (const l of lines) {
    if (l.self) { self++; continue; }
    requests++;
    const st = Number(l.status) || 0;
    if (st >= 400 && st < 500) e4++;
    if (st >= 500) e5++;
    if (typeof l.ms === 'number') ms.push(l.ms);
    const rk = routeKey(l.route || '?');
    byRoute[rk] = (byRoute[rk] || 0) + 1;
    const g = l.game || 'none';
    byGame[g] = (byGame[g] || 0) + 1;
    for (const id of l.membership_ids || []) {
      lookups++;
      perAcct.set(id, (perAcct.get(id) || 0) + 1);
    }
  }
  ms.sort((a, b) => a - b);
  const top = [...perAcct.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([membership_id, n]) => ({ membership_id, lookups: n }));
  return {
    from, to, generated_utc: new Date().toISOString(), requests, self_requests_excluded: self,
    errors_4xx: e4, errors_5xx: e5, unique_accounts: perAcct.size, account_lookups: lookups,
    ms_p50: pct(ms, 50), ms_p95: pct(ms, 95), by_route: byRoute, by_game: byGame, top_accounts: top,
  };
}

const DAY_FILE = /^usage-(\d{4}-\d{2}-\d{2})\.jsonl$/;

export function readUsageDays(dir: string, fromDay: string, toDay: string): UsageLine[] {
  const out: UsageLine[] = [];
  if (!dir || !fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    const m = f.match(DAY_FILE);
    if (!m || m[1] < fromDay || m[1] > toDay) continue;
    for (const raw of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!raw.trim()) continue;
      try { out.push(JSON.parse(raw)); } catch { /* skip torn line */ }
    }
  }
  return out;
}

/** Delete usage-YYYY-MM-DD.jsonl files older than `days`. Only touches files matching that pattern. */
export function applyRetention(dir: string, days: number, now = new Date()): string[] {
  if (!dir || !fs.existsSync(dir) || !(days > 0)) return [];
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const removed: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(DAY_FILE);
    if (m && m[1] < cutoff) {
      fs.unlinkSync(path.join(dir, f));
      removed.push(f);
    }
  }
  return removed;
}

/** Monday (UTC date) of the ISO week containing d. */
function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export function isoWeekLabel(monday: Date): string {
  const t = new Date(monday.getTime());
  t.setUTCDate(t.getUTCDate() + 3); // Thursday
  const y = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round((t.getTime() - mondayOf(jan4).getTime()) / (7 * 86400000));
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

/** Write weekly-YYYY-Www.json/.md for the last completed week if missing; also refresh SUMMARY.md (last 7 days). */
export function writeWeeklySummary(logDir: string, outDir: string, now = new Date()): string | null {
  if (!logDir || !outDir) return null;
  fs.mkdirSync(outDir, { recursive: true });
  const thisMon = mondayOf(now);
  const lastMon = new Date(thisMon.getTime() - 7 * 86400000);
  const lastSun = new Date(thisMon.getTime() - 86400000);
  const from = lastMon.toISOString().slice(0, 10);
  const to = lastSun.toISOString().slice(0, 10);
  const label = isoWeekLabel(lastMon);
  const jsonPath = path.join(outDir, `weekly-${label}.json`);
  let written: string | null = null;
  if (!fs.existsSync(jsonPath)) {
    const s = summarize(readUsageDays(logDir, from, to), from, to);
    fs.writeFileSync(jsonPath, JSON.stringify(s, null, 2));
    fs.writeFileSync(jsonPath.replace(/\.json$/, '.md'), toMarkdown(`Usage week ${label}`, s));
    written = jsonPath;
  }
  const rFrom = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const rTo = now.toISOString().slice(0, 10);
  const rolling = summarize(readUsageDays(logDir, rFrom, rTo), rFrom, rTo);
  fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), toMarkdown('Usage, last 7 days', rolling));
  return written;
}

export function toMarkdown(title: string, s: UsageSummary): string {
  const lines = [
    `# ${title}`, '', `${s.from} to ${s.to} (UTC days). Generated ${s.generated_utc}.`, '',
    `- Requests: ${s.requests} (own/smoke accounts excluded: ${s.self_requests_excluded})`,
    `- Account lookups: ${s.account_lookups}, unique accounts: ${s.unique_accounts}`,
    `- Errors: 4xx ${s.errors_4xx}, 5xx ${s.errors_5xx}`,
    `- Latency ms: p50 ${s.ms_p50 ?? '-'}, p95 ${s.ms_p95 ?? '-'}`, '',
    '## By route', ...Object.entries(s.by_route).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
    '## Top accounts', '| membership_id | lookups |', '|---|---|',
    ...s.top_accounts.map((a) => `| ${a.membership_id} | ${a.lookups} |`), '',
  ];
  return lines.join('\n');
}

export interface SelfCheckOptions {
  port: number;
  gapRoot: string;
  compactRoot: string;
  watermarkPath: string;
  expectComplete: number;
  minFreeGiB: number;
  sampleMid?: string;
  sampleGame?: string;
  outDir: string;
  freeGiB: (p: string) => number | null;
  fetchFn?: typeof fetch;
  selfToken?: string;
}

export interface CheckResult { name: string; ok: boolean; detail: string }

export async function runSelfCheck(o: SelfCheckOptions): Promise<{ ok: boolean; checks: CheckResult[] }> {
  const checks: CheckResult[] = [];
  const f = o.fetchFn || fetch;
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  try {
    const r = await f(`http://127.0.0.1:${o.port}/health`);
    const j: any = await r.json();
    add('health', r.status === 200 && j?.status === 'ok', `HTTP ${r.status}`);
  } catch (e) { add('health', false, String((e as Error).message)); }
  if (o.gapRoot) {
    let n = 0;
    try {
      for (const d of fs.readdirSync(o.gapRoot)) if (fs.existsSync(path.join(o.gapRoot, d, '_COMPLETE.json'))) n++;
    } catch { /* counted as 0 */ }
    add('gap_complete_markers', n >= o.expectComplete, `${n}/${o.expectComplete}`);
  }
  if (o.compactRoot) add('compact_root', fs.existsSync(o.compactRoot), o.compactRoot ? 'exists check' : '');
  if (o.watermarkPath) {
    let ok = false;
    try { JSON.parse(fs.readFileSync(o.watermarkPath, 'utf8')); ok = true; } catch { /* bad */ }
    add('watermark_json', ok, ok ? 'parsed' : 'unreadable');
  }
  const free = o.freeGiB(o.gapRoot || o.compactRoot || '.');
  add('free_disk', free !== null && free >= o.minFreeGiB, `${free ?? '?'} GiB free (min ${o.minFreeGiB})`);
  if (o.sampleMid) {
    const t = Date.now();
    try {
      const r = await f(`http://127.0.0.1:${o.port}/players/${o.sampleMid}/activities?game=${o.sampleGame || 'D2'}&limit=1`, {
        headers: { 'x-dc-selfcheck': o.selfToken || '' },
      } as any);
      const j: any = await r.json();
      const ok = r.status === 200 && Array.isArray(j?.activities) && j.activities.length > 0;
      add('sample_lookup', ok, `HTTP ${r.status}, ${Date.now() - t} ms`);
    } catch (e) { add('sample_lookup', false, String((e as Error).message)); }
  }
  const ok = checks.every((c) => c.ok);
  if (o.outDir) {
    fs.mkdirSync(o.outDir, { recursive: true });
    const at = new Date().toISOString();
    fs.writeFileSync(path.join(o.outDir, 'HEALTH.json'), JSON.stringify({ ok, at, checks }, null, 2));
    const md = [`# Health ${ok ? 'OK' : 'FAILED'}`, '', `Checked ${at}`, '',
      ...checks.map((c) => `- ${c.ok ? 'OK ' : 'FAIL'} ${c.name}: ${c.detail}`), ''].join('\n');
    fs.writeFileSync(path.join(o.outDir, 'HEALTH.md'), md);
    fs.appendFileSync(path.join(o.outDir, 'HEALTH_LOG.md'), `- ${at} ${ok ? 'ok' : 'FAILED: ' + checks.filter((c) => !c.ok).map((c) => c.name).join(',')}\n`);
  }
  return { ok, checks };
}

/** Hour (0-23) in America/New_York. */
export function etHour(d = new Date()): number {
  return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(d), 10);
}

export function startMaintenance(o: Omit<SelfCheckOptions, 'outDir'> & { logDir: string; outDir: string; retentionDays: number; checkHourEt: number }): void {
  if (process.env.USAGE_MAINTENANCE === 'false') return;
  let lastCheckDay = '';
  const tick = async () => {
    try {
      if (o.logDir) applyRetention(o.logDir, o.retentionDays);
      if (o.logDir && o.outDir) writeWeeklySummary(o.logDir, o.outDir);
      const day = new Date().toISOString().slice(0, 10);
      if (o.outDir && etHour() === o.checkHourEt && day !== lastCheckDay) {
        lastCheckDay = day;
        await runSelfCheck(o);
      }
    } catch { /* maintenance must never crash the API */ }
  };
  setTimeout(() => { void tick(); if (o.outDir) void runSelfCheck(o).catch(() => undefined); }, 60_000).unref();
  setInterval(() => void tick(), 15 * 60_000).unref();
}
