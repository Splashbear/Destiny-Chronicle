import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyRetention, isoWeekLabel, routeKey, runSelfCheck, summarize, writeWeeklySummary } from '../usage/maintenance';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dc-maint-'));

describe('summarize', () => {
  it('counts per account and overall, skips self lines', () => {
    const s = summarize(
      [
        { route: 'GET /players/111111111/activities', game: 'D2', membership_ids: ['111111111'], status: 200, ms: 10 },
        { route: 'GET /players/111111111/activities', game: 'D2', membership_ids: ['111111111'], status: 200, ms: 30 },
        { route: 'POST /players/activities/batch', game: 'D1', membership_ids: ['222222222', '111111111'], status: 500, ms: 20 },
        { route: 'GET /players/999999999/activities', membership_ids: [], status: 200, ms: 5, self: true },
      ],
      '2026-10-05',
      '2026-10-11'
    );
    expect(s.requests).toBe(3);
    expect(s.self_requests_excluded).toBe(1);
    expect(s.unique_accounts).toBe(2);
    expect(s.account_lookups).toBe(4);
    expect(s.top_accounts[0]).toEqual({ membership_id: '111111111', lookups: 3 });
    expect(s.errors_5xx).toBe(1);
    expect(s.ms_p50).toBe(20);
    expect(s.by_route['GET /players/:id/activities']).toBe(2);
  });
  it('groups numeric route segments', () => {
    expect(routeKey('GET /pgcr/15994814966')).toBe('GET /pgcr/:id');
  });
});

describe('retention and weekly summary', () => {
  it('deletes only old usage-*.jsonl files', () => {
    const d = tmp();
    for (const f of ['usage-2026-01-01.jsonl', 'usage-2026-10-10.jsonl', 'notes.txt', 'usage-2026-01-01.md']) fs.writeFileSync(path.join(d, f), '');
    const removed = applyRetention(d, 30, new Date('2026-10-12T12:00:00Z'));
    expect(removed).toEqual(['usage-2026-01-01.jsonl']);
    expect(fs.readdirSync(d).sort()).toEqual(['notes.txt', 'usage-2026-01-01.md', 'usage-2026-10-10.jsonl']);
  });
  it('writes last completed ISO week once, plus rolling SUMMARY.md', () => {
    const logs = tmp();
    const out = tmp();
    const line = (ts: string, id: string) => JSON.stringify({ ts_utc: ts, route: `GET /players/${id}/activities`, membership_ids: [id], status: 200, ms: 5 });
    fs.writeFileSync(path.join(logs, 'usage-2026-10-06.jsonl'), line('2026-10-06T01:00:00Z', '111111111') + '\n');
    fs.writeFileSync(path.join(logs, 'usage-2026-10-11.jsonl'), line('2026-10-11T01:00:00Z', '111111111') + '\n{torn');
    fs.writeFileSync(path.join(logs, 'usage-2026-10-12.jsonl'), line('2026-10-12T01:00:00Z', '222222222') + '\n');
    const now = new Date('2026-10-12T15:00:00Z');
    const p = writeWeeklySummary(logs, out, now);
    expect(path.basename(p!)).toBe('weekly-2026-W41.json');
    const s = JSON.parse(fs.readFileSync(p!, 'utf8'));
    expect(s.from).toBe('2026-10-05');
    expect(s.to).toBe('2026-10-11');
    expect(s.top_accounts).toEqual([{ membership_id: '111111111', lookups: 2 }]);
    expect(fs.existsSync(path.join(out, 'weekly-2026-W41.md'))).toBe(true);
    expect(fs.readFileSync(path.join(out, 'SUMMARY.md'), 'utf8')).toContain('222222222');
    expect(writeWeeklySummary(logs, out, now)).toBeNull();
  });
  it('labels ISO weeks across a year boundary', () => {
    expect(isoWeekLabel(new Date('2026-12-28T00:00:00Z'))).toBe('2026-W53');
    expect(isoWeekLabel(new Date('2027-01-04T00:00:00Z'))).toBe('2027-W01');
  });
});

describe('runSelfCheck', () => {
  it('writes HEALTH.json/md and fails on missing markers', async () => {
    const gap = tmp();
    const out = tmp();
    fs.mkdirSync(path.join(gap, 'mid_bucket=0'));
    fs.writeFileSync(path.join(gap, 'mid_bucket=0', '_COMPLETE.json'), '{}');
    const wm = path.join(out, 'wm.json');
    fs.writeFileSync(wm, '{"x":1}');
    const fetchFn: any = async (url: string) => ({
      status: 200,
      json: async () => (url.endsWith('/health') ? { status: 'ok' } : { activities: [1] }),
    });
    const r = await runSelfCheck({
      port: 1, gapRoot: gap, compactRoot: gap, watermarkPath: wm, expectComplete: 2, minFreeGiB: 1,
      sampleMid: '111111111', outDir: out, freeGiB: () => 100, fetchFn,
    });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === 'gap_complete_markers')).toMatchObject({ ok: false, detail: '1/2' });
    expect(r.checks.find((c) => c.name === 'sample_lookup')!.ok).toBe(true);
    const h = JSON.parse(fs.readFileSync(path.join(out, 'HEALTH.json'), 'utf8'));
    expect(h.ok).toBe(false);
    expect(fs.readFileSync(path.join(out, 'HEALTH.md'), 'utf8')).toContain('FAIL gap_complete_markers');
  });
});
