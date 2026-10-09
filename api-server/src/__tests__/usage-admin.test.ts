import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { checkUsageAdminRequest, installUsageAdminRoute, USAGE_ADMIN_HEADER } from '../usage/usage-admin';

const TOKEN = 'test-token-0123456789abcdef';
const ON = { USAGE_ADMIN: 'true', USAGE_ADMIN_TOKEN: TOKEN } as NodeJS.ProcessEnv;

describe('checkUsageAdminRequest', () => {
  it('is off by default', () => {
    expect(checkUsageAdminRequest({ [USAGE_ADMIN_HEADER]: TOKEN }, {} as NodeJS.ProcessEnv).status).toBe(404);
  });
  it('refuses when the token is unset or too short', () => {
    expect(checkUsageAdminRequest({}, { USAGE_ADMIN: 'true' } as NodeJS.ProcessEnv).status).toBe(404);
    expect(checkUsageAdminRequest({ [USAGE_ADMIN_HEADER]: 'short' }, { USAGE_ADMIN: 'true', USAGE_ADMIN_TOKEN: 'short' } as NodeJS.ProcessEnv).status).toBe(404);
  });
  it('does not trust a local-looking request without a token', () => {
    expect(checkUsageAdminRequest({ host: '127.0.0.1:3001' }, ON).status).toBe(401);
  });
  it('refuses proxied (Cloudflare tunnel) requests without the right token', () => {
    for (const h of ['cf-connecting-ip', 'x-forwarded-for', 'cf-ray']) {
      expect(checkUsageAdminRequest({ [h]: '1.2.3.4' }, ON).status).toBe(403);
      expect(checkUsageAdminRequest({ [h]: '1.2.3.4', [USAGE_ADMIN_HEADER]: 'wrong-token-0123456789abcd' }, ON).status).toBe(403);
    }
  });
  it('accepts the right token, even through a proxy', () => {
    expect(checkUsageAdminRequest({ [USAGE_ADMIN_HEADER]: TOKEN }, ON).status).toBe(200);
    expect(checkUsageAdminRequest({ [USAGE_ADMIN_HEADER]: TOKEN, 'cf-ray': 'x' }, ON).status).toBe(200);
  });
  it('rejects a token that only shares a prefix', () => {
    expect(checkUsageAdminRequest({ [USAGE_ADMIN_HEADER]: TOKEN + 'x' }, ON).status).toBe(401);
  });
});

describe('GET /admin/usage route', () => {
  let server: Server;
  let base = '';
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.USAGE_ADMIN = 'true';
    process.env.USAGE_ADMIN_TOKEN = TOKEN;
    delete process.env.USAGE_SUMMARY_PATH;
    const app = express();
    installUsageAdminRoute(app, { windowMs: 60_000, limit: 4 });
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    process.env = saved;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('ignores a token in the query string, accepts the header, then rate limits', async () => {
    const q = await fetch(`${base}/admin/usage?token=${TOKEN}`);
    expect(q.status).toBe(401);
    const cf = await fetch(`${base}/admin/usage`, { headers: { 'cf-connecting-ip': '1.2.3.4' } });
    expect(cf.status).toBe(403);
    const ok = await fetch(`${base}/admin/usage`, { headers: { [USAGE_ADMIN_HEADER]: TOKEN } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'no-summary-yet' });
    await fetch(`${base}/admin/usage`, { headers: { [USAGE_ADMIN_HEADER]: TOKEN } });
    const limited = await fetch(`${base}/admin/usage`, { headers: { [USAGE_ADMIN_HEADER]: TOKEN } });
    expect(limited.status).toBe(429);
  });
});