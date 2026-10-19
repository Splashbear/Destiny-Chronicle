import express from 'express';
import request from 'supertest';
import { CORS_ALLOW_HEADERS, installCors } from '../http/cors';

describe('CORS allow headers', () => {
  it('lets a browser preflight send X-DC-Client', async () => {
    expect(CORS_ALLOW_HEADERS.split(',').map((s) => s.trim())).toEqual(
      expect.arrayContaining(['Content-Type', 'X-API-Key', 'X-DC-Client'])
    );
    const app = express();
    installCors(app, { enable: true, origin: 'https://destinychronicle.com' });
    app.get('/players/:id/activities', (_q, s) => { s.json({ ok: true }); });
    const res = await request(app)
      .options('/players/111111111/activities')
      .set('Origin', 'https://destinychronicle.com')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'content-type,x-dc-client');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-headers']).toContain('X-DC-Client');
    expect(res.headers['access-control-allow-origin']).toBe('https://destinychronicle.com');
  });
});
