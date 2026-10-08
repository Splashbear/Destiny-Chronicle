/**
 * Build usage/daily/YYYY-MM-DD.md, usage/SUMMARY.md, and a CSV from JSONL logs.
 * Excludes self=true rows from the main totals. Does not read visitor fields (none are stored).
 *
 * Usage: node scripts/usage-summary.mjs [logDir] [outDir]
 * Env: USAGE_LOG_DIR, USAGE_OUT_DIR, USAGE_RETAIN_DAYS (default 180)
 */
import fs from 'fs';
import path from 'path';

const logDir = process.argv[2] || process.env.USAGE_LOG_DIR || '';
const outDir = process.argv[3] || process.env.USAGE_OUT_DIR || path.join(path.dirname(logDir || '.'), 'usage');
const retainDays = parseInt(process.env.USAGE_RETAIN_DAYS || '180', 10);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)));
  return sorted[i];
}

function loadLines(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('usage-') && f.endsWith('.jsonl'));
  const rows = [];
  for (const f of files) {
    const day = f.slice(6, 16);
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        row._day = day;
        rows.push(row);
      } catch {
        /* skip torn line */
      }
    }
  }
  return rows;
}

function prune(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  const cutoff = Date.now() - retainDays * 86400000;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith('usage-') || !f.endsWith('.jsonl')) continue;
    const day = f.slice(6, 16);
    const t = Date.parse(day + 'T00:00:00Z');
    if (Number.isFinite(t) && t < cutoff) fs.unlinkSync(path.join(dir, f));
  }
}

function summarize(rows) {
  const outside = rows.filter((r) => !r.self);
  const ms = outside.map((r) => r.ms).filter((n) => typeof n === 'number').sort((a, b) => a - b);
  const byAccount = new Map();
  for (const r of outside) {
    for (const id of r.membership_ids || []) {
      byAccount.set(id, (byAccount.get(id) || 0) + 1);
    }
  }
  const top = [...byAccount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  const hours = {};
  for (const r of outside) {
    const h = String(r.ts_utc || '').slice(11, 13) || '??';
    hours[h] = (hours[h] || 0) + 1;
  }
  const endpoints = {};
  let errors = 0;
  let rate = 0;
  let fallback = 0;
  let archive = 0;
  let d1 = 0;
  let d2 = 0;
  for (const r of outside) {
    endpoints[r.route] = (endpoints[r.route] || 0) + 1;
    if (r.status >= 400) errors += 1;
    if (r.status === 429) rate += 1;
    const src = String(r.source || '');
    if (src.includes('bungie') || src === 'absent' || src === 'none') fallback += 1;
    else if (src) archive += 1;
    if (r.game === 'D1') d1 += 1;
    if (r.game === 'D2') d2 += 1;
  }
  return {
    requests: outside.length,
    self: rows.length - outside.length,
    uniqueAccounts: byAccount.size,
    top,
    hours,
    endpoints,
    errors,
    rate,
    fallback,
    archive,
    d1,
    d2,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    slowest: [...outside].sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, 5),
  };
}

function mdFor(title, s) {
  const top = s.top.map(([id, n]) => `| ${id} | ${n} |`).join('\n') || '| (none) | 0 |';
  const slow = s.slowest
    .map((r) => `| ${r.ts_utc} | ${r.route} | ${r.ms} | ${r.status} |`)
    .join('\n');
  return `# ${title}

- Requests (excluding self): **${s.requests}**
- Self requests: **${s.self}**
- Unique accounts: **${s.uniqueAccounts}**
- D1 / D2: **${s.d1}** / **${s.d2}**
- Archive-labeled / fallback-labeled: **${s.archive}** / **${s.fallback}**
- Errors: **${s.errors}**  Rate-limit 429: **${s.rate}**
- p50 / p95 ms: **${s.p50 ?? 'n/a'}** / **${s.p95 ?? 'n/a'}**

## Top accounts

| membership id | requests |
|---|---:|
${top}

## Slowest

| time | route | ms | status |
|---|---|---:|---:|
${slow || '| n/a | | | |'}
`;
}

function main() {
  if (!logDir) {
    console.error('USAGE_LOG_DIR or argv log dir required');
    process.exit(1);
  }
  prune(logDir);
  const rows = loadLines(logDir);
  fs.mkdirSync(path.join(outDir, 'daily'), { recursive: true });
  const days = [...new Set(rows.map((r) => r._day))].sort();
  const csv = ['day,requests,self,unique_accounts,errors,p50_ms,p95_ms'];
  for (const day of days) {
    const s = summarize(rows.filter((r) => r._day === day));
    fs.writeFileSync(path.join(outDir, 'daily', `${day}.md`), mdFor(day, s));
    csv.push([day, s.requests, s.self, s.uniqueAccounts, s.errors, s.p50 ?? '', s.p95 ?? ''].join(','));
  }
  const all = summarize(rows);
  fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), mdFor('Usage summary', all));
  fs.writeFileSync(path.join(outDir, 'usage.csv'), csv.join('\n') + '\n');
  const weekAgo = Date.now() - 7 * 86400000;
  const weekRows = rows.filter((r) => Date.parse(r.ts_utc || 0) >= weekAgo);
  fs.writeFileSync(path.join(outDir, 'WEEKLY.md'), mdFor('Weekly usage', summarize(weekRows)));
  console.log(`wrote ${outDir} days=${days.length} rows=${rows.length}`);
}

main();
