import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { clientSource, extractLookup, installApiGuard } from '../usage/usage';

describe('extractLookup', () => {
  it('reads the account from /players/:id/activities', () => {
    expect(extractLookup('/players/4611686018465122437/activities?game=D2&limit=10', {})).toEqual({
      membershipIds: ['4611686018465122437'],
      instanceId: null,
    });
  });
  it('reads membershipId query and batch bodies, dedupes, drops junk', () => {
    expect(extractLookup('/api/pgcr/activities?membershipId=4611686018429785995', null).membershipIds).toEqual([
      '4611686018429785995',
    ]);
    const b = { membershipIds: ['4611686018465122437', { membershipId: '4611686018443970323' }, '4611686018465122437', 'x<script>'] };
    expect(extractLookup('/players/activities/batch', b).membershipIds).toEqual([
      '4611686018465122437',
      '4611686018443970323',
    ]);
  });
  it('reads PGCR instance ids, not as accounts', () => {
    expect(extractLookup('/pgcr/15994814966?game=D2', {})).toEqual({ membershipIds: [], instanceId: '15994814966' });
    expect(extractLookup('/api/pgcr/4186826216', {}).instanceId).toBe('4186826216');
  });
});

describe('usage log lines', () => {
  let dir: string;
  const env = { ...process.env };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-usage-'));
    process.env.USAGE_LOG_DIR = dir;
    process.env.USAGE_EXCLUDE_MIDS = '4611686018443970323';
  });
  afterEach(() => {
    process.env = { ...env };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function lines(): Promise<any[]> {
    for (let i = 0; i < 40; i++) {
      const f = fs.readdirSync(dir).find((n) => n.endsWith('.jsonl'));
      if (f) {
        const t = fs.readFileSync(path.join(dir, f), 'utf8').trim();
        if (t.split('\n').length >= 2) return t.split('\n').map((l) => JSON.parse(l));
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('no usage lines');
  }

  it('records looked-up accounts, flags excluded ones as self, never stores visitor info', async () => {
    const app = express();
    app.use(express.json());
    installApiGuard(app);
    const r = express.Router();
    r.get('/:membershipId/activities', (_q, s) => { s.json({ activities: [1, 2] }); });
    app.use('/players', r);
    await request(app).get('/players/4611686018465122437/activities?game=D2').set('X-Forwarded-For', '203.0.113.9').set('User-Agent', 'ua-test');
    await request(app).get('/players/4611686018443970323/activities?game=D2');
    const [a, b] = await lines();
    expect(a.membership_ids).toEqual(['4611686018465122437']);
    expect(a.self).toBe(false);
    expect(a.route).toBe('GET /players/4611686018465122437/activities');
    expect(a.rows).toBe(2);
    expect(b.membership_ids).toEqual([]);
    expect(b.self).toBe(true);
    const raw = JSON.stringify([a, b]);
    expect(raw).not.toMatch(/203\.0\.113\.9|ua-test|127\.0\.0\.1|::1|4611686018443970323/);
    expect(b.route).toBe('GET /players/:excluded/activities');
    for (const l of [a, b]) expect(Object.keys(l).filter((k) => /^(ip|remote|addr|user_agent|ua|referer|forwarded|headers)/i.test(k))).toEqual([]);
    expect(a.source).toBe('other');
  });

  async function oneLine(header?: string): Promise<any> {
    const app = express();
    app.use(express.json());
    installApiGuard(app);
    app.get('/players/:membershipId/activities', (_q, s) => { s.json({ activities: [], coverage: { source: 'archive', level: 'partial' } }); });
    const before = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).reduce((n, f) => n + fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).length, 0) : 0;
    const req = request(app).get('/players/111111111/activities');
    if (header !== undefined) req.set('X-DC-Client', header);
    await req;
    for (let i = 0; i < 40; i++) {
      const f = fs.readdirSync(dir).find((n) => n.endsWith('.jsonl'));
      if (f) {
        const rows = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean);
        if (rows.length > before) return JSON.parse(rows[rows.length - 1]);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('no usage line');
  }

  it('labels web, bot, and anything else as other, and never stores the raw header', async () => {
    expect(clientSource('web')).toBe('web');
    expect(clientSource('discord-bot')).toBe('bot');
    expect(clientSource(['discord-bot'])).toBe('bot');
    expect(clientSource(' WEB ')).toBe('web');
    expect(clientSource('not-a-client')).toBe('other');
    expect(clientSource('discord-bot; web')).toBe('other');
    expect(clientSource(undefined)).toBe('other');

    const web = await oneLine('web');
    expect(web.source).toBe('web');
    expect(web.coverage_source).toBe('archive');
    const bot = await oneLine('discord-bot');
    expect(bot.source).toBe('bot');
    const junk = await oneLine('<script>alert(1)</script>');
    expect(junk.source).toBe('other');
    const raw = JSON.stringify([web, bot, junk]);
    expect(raw).not.toMatch(/discord-bot|<script>|not-a-client/);
    expect(Object.keys(junk).filter((k) => /^(ip|remote|addr|user_agent|ua|referer|forwarded|headers)/i.test(k))).toEqual([]);
  });
});
