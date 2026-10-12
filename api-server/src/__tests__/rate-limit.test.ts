import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { clientKey, installApiGuard } from '../usage/usage';

const fake = (remoteAddress: string, headers: Record<string, string> = {}) => ({ socket: { remoteAddress }, headers } as any);

describe('clientKey', () => {
  it('trusts CF-Connecting-IP only from loopback (the local tunnel)', () => {
    expect(clientKey(fake('127.0.0.1', { 'cf-connecting-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientKey(fake('::1', { 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientKey(fake('::ffff:127.0.0.1', { 'cf-connecting-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });
  it('ignores spoofed headers from non-loopback clients', () => {
    expect(clientKey(fake('192.168.68.78', { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4' }))).toBe('192.168.68.78');
  });
  it('ignores junk header values', () => {
    expect(clientKey(fake('127.0.0.1', { 'cf-connecting-ip': 'not-an-ip' }))).toBe('127.0.0.1');
  });
});

describe('rate limits', () => {
  const env = { ...process.env };
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-rl-'));
    process.env.USAGE_LOG_DIR = dir;
    process.env.PGCR_RATE_PER_MIN = '3';
    process.env.PGCR_GLOBAL_RATE_PER_MIN = '5';
  });
  afterEach(() => {
    process.env = { ...env };
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const mk = () => {
    const app = express();
    app.use(express.json());
    installApiGuard(app);
    app.get('/ping', (_q, s) => { s.json({ ok: true }); });
    return app;
  };

  it('limits each tunnel visitor separately, with Retry-After, and never writes IPs', async () => {
    const app = mk();
    for (let i = 0; i < 3; i++) expect((await request(app).get('/ping').set('CF-Connecting-IP', '198.51.100.7')).status).toBe(200);
    const r = await request(app).get('/ping').set('CF-Connecting-IP', '198.51.100.7');
    expect(r.status).toBe(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect((await request(app).get('/ping').set('CF-Connecting-IP', '198.51.100.8')).status).toBe(200);
    await new Promise((res) => setTimeout(res, 200));
    const logged = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toMatch(/198\.51\.100|127\.0\.0\.1|::1|::ffff/);
  });

  it('applies a global cap across visitors', async () => {
    const app = mk();
    const ips = ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4', '203.0.113.5'];
    for (const ip of ips) expect((await request(app).get('/ping').set('CF-Connecting-IP', ip)).status).toBe(200);
    const r = await request(app).get('/ping').set('CF-Connecting-IP', '203.0.113.6');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeDefined();
  });
});
