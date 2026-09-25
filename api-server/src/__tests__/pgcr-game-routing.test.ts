/**
 * D1/D2 PGCR routing and period handling.
 *
 * Regression for: GET /pgcr/:id?game=D1 returned the D2 PGCR that happens to share the
 * numeric instance ID (a stranger's activity), and live-fallback PGCRs reported
 * period = "now" because Bungie puts `period` next to activityDetails, not inside it.
 */
import express, { Express } from 'express';
import request from 'supertest';
import { createDcPgcrRouter, pruneBungiePgcr } from '../routes/dc-pgcr.routes';
import { createPgcrRouter } from '../routes/pgcr.routes';
import { BungieApiError, BungieApiService, resolvePgcrPeriod } from '../services/bungie-api.service';
import { WatermarkService } from '../services/watermark.service';

const ID = '6895137186';
const REQUESTER = '4611686018400000437';
const STRANGER = '4611686018400003107';

const d1Envelope = {
  ErrorCode: 1,
  Response: {
    data: {
      period: '2020-12-13T15:03:59Z',
      activityDetails: { referenceId: 1234230734, instanceId: ID, mode: 6, activityTypeHashOverride: 0, isPrivate: false },
      entries: [
        {
          player: { destinyUserInfo: { membershipId: REQUESTER, membershipType: 2, displayName: 'Requester' } },
          characterId: '2305843009400000028',
          values: { kills: { basic: { value: 12 } }, activityDurationSeconds: { basic: { value: 600 } } },
        },
      ],
    },
  },
};

const d2Envelope = {
  ErrorCode: 1,
  Response: {
    period: '2020-09-12T03:12:16Z',
    activityDetails: { referenceId: 3858493935, directorActivityHash: 3858493935, instanceId: ID, mode: 6, modes: [6], isPrivate: false, membershipType: 3 },
    entries: [
      {
        player: { destinyUserInfo: { membershipId: STRANGER, membershipType: 3, displayName: 'Stranger' } },
        characterId: '2305843009400003107',
        values: {},
      },
    ],
  },
};

function makeApp(bungie: Partial<BungieApiService>, archiveRows: any[] = []) {
  const archive: any = {
    isAvailable: () => true,
    getActivitiesByInstanceId: jest.fn(async (_id: string, game?: string) => archiveRows.filter((r) => !game || r.game === game)),
    getActivityByInstanceId: jest.fn(async (_id: string, game?: string) => archiveRows.filter((r) => !game || r.game === game)[0] ?? null),
  };
  const watermark = new WatermarkService('');
  (watermark as any).watermark = { max_instance_id: '15999999999', as_of: '2026-09-01' };
  const app: Express = express();
  app.use(express.json());
  app.use('/pgcr', createDcPgcrRouter(archive, bungie as BungieApiService, watermark));
  app.use('/api/pgcr', createPgcrRouter(archive, bungie as BungieApiService, watermark));
  return { app, archive };
}

describe('resolvePgcrPeriod', () => {
  it('reads top-level period and never invents one', () => {
    expect(resolvePgcrPeriod({ period: '2020-09-12T03:12:16Z', activityDetails: {} })).toBe('2020-09-12T03:12:16Z');
    expect(resolvePgcrPeriod({ activityDetails: { period: '2019-01-01T00:00:00Z' } })).toBe('2019-01-01T00:00:00Z');
    expect(resolvePgcrPeriod({ activityDetails: {} })).toBeNull();
    expect(resolvePgcrPeriod({ period: 'not a date' })).toBeNull();
  });
});

describe('pruneBungiePgcr', () => {
  it('unwraps D1 Response.data and keeps the real period', () => {
    const p = pruneBungiePgcr(d1Envelope, 'D1', ID)!;
    expect(p.game).toBe('D1');
    expect(p._source).toBe('live');
    expect(p.activityDetails.period).toBe('2020-12-13T15:03:59Z');
    expect(p.activityDetails.referenceId).toBe(1234230734);
    expect(p.entries.map((e) => e.player.destinyUserInfo.membershipId)).toEqual([REQUESTER]);
    expect(p.entries[0].values.kills.basic.value).toBe(12);
  });

  it('uses D2 Response.period (activityDetails has no period)', () => {
    const p = pruneBungiePgcr(d2Envelope, 'D2', ID)!;
    expect(p.activityDetails.period).toBe('2020-09-12T03:12:16Z');
  });

  it('returns null period instead of now when the report has no period', () => {
    const noPeriod = { Response: { ...d2Envelope.Response, period: undefined } };
    const p = pruneBungiePgcr(noPeriod, 'D2', ID)!;
    expect(p.activityDetails.period).toBeNull();
  });

  it('rejects a body for a different instance', () => {
    expect(pruneBungiePgcr(d2Envelope, 'D2', '123')).toBeNull();
  });
});

describe('GET /pgcr/:id game routing', () => {
  it('D1 request goes to the D1 endpoint and never returns the D2 PGCR with the same id', async () => {
    const getBungiePgcr = jest.fn(async (_id: string, game: string) => (game === 'D1' ? d1Envelope : d2Envelope));
    const { app, archive } = makeApp({ getBungiePgcr } as any);
    const res = await request(app).get(`/pgcr/${ID}?game=D1&format=lite`);
    expect(res.status).toBe(200);
    expect(getBungiePgcr).toHaveBeenCalledWith(ID, 'D1');
    expect(getBungiePgcr).not.toHaveBeenCalledWith(ID, 'D2');
    expect(archive.getActivitiesByInstanceId).toHaveBeenCalledWith(ID, 'D1');
    expect(res.body.game).toBe('D1');
    expect(res.body.activityDetails.period).toBe('2020-12-13T15:03:59Z');
    expect(res.body.entries.map((e: any) => e.player.destinyUserInfo.membershipId)).toEqual([REQUESTER]);
  });

  it('D1 request is not served from D2 archive rows with the same id', async () => {
    const getBungiePgcr = jest.fn(async () => d1Envelope);
    const d2Row = { instance_id: ID, period: '2020-09-12 03:12:16', activity_hash: 1, director_activity_hash: 1, mode: 6, membership_id: STRANGER, membership_type: 3, display_name: 'x', character_id: '1', completed: true, deaths: 0, kills: 0, assists: 0, duration_seconds: 1, standing: 0, starting_phase_index: 0, fireteam_id: '', is_private: false, dump_id: 'a', game: 'D2' };
    const { app } = makeApp({ getBungiePgcr } as any, [d2Row]);
    const res = await request(app).get(`/pgcr/${ID}?game=D1`);
    expect(res.body._source).toBe('live');
    expect(res.body.entries[0].player.destinyUserInfo.membershipId).toBe(REQUESTER);
    // and D2 still gets the archive row
    const res2 = await request(app).get(`/pgcr/${ID}?game=D2`);
    expect(res2.body._source).toBe('archive');
    expect(res2.body.entries[0].player.destinyUserInfo.membershipId).toBe(STRANGER);
  });

  it('D2 live fallback reports the real period, not now', async () => {
    const getBungiePgcr = jest.fn(async () => d2Envelope);
    const { app } = makeApp({ getBungiePgcr } as any);
    const res = await request(app).get(`/pgcr/${ID}?game=D2`);
    expect(res.status).toBe(200);
    expect(getBungiePgcr).toHaveBeenCalledWith(ID, 'D2');
    expect(res.body.activityDetails.period).toBe('2020-09-12T03:12:16Z');
  });

  it('upstream failure (e.g. D1 SystemDisabled) is a 502, not substitute data', async () => {
    const getBungiePgcr = jest.fn(async () => { throw new BungieApiError('disabled', 5, 'SystemDisabled', 200); });
    const { app } = makeApp({ getBungiePgcr } as any);
    const res = await request(app).get(`/pgcr/${ID}?game=D1`);
    expect(res.status).toBe(502);
    expect(res.body.errorStatus).toBe('SystemDisabled');
  });

  it('rejects unknown game', async () => {
    const { app } = makeApp({ getBungiePgcr: jest.fn() } as any);
    expect((await request(app).get(`/pgcr/${ID}?game=D3`)).status).toBe(400);
  });

  it('batch honours body.game', async () => {
    const getBungiePgcr = jest.fn(async (_id: string, game: string) => (game === 'D1' ? d1Envelope : d2Envelope));
    const { app } = makeApp({ getBungiePgcr } as any);
    const res = await request(app).post('/pgcr/batch').send({ instanceIds: [ID], game: 'D1' });
    expect(res.status).toBe(200);
    expect(getBungiePgcr).toHaveBeenCalledWith(ID, 'D1');
    expect(res.body[ID].activityDetails.period).toBe('2020-12-13T15:03:59Z');
  });
});

describe('GET /api/pgcr/:id game routing', () => {
  it('passes game through and tags the lean row with the requested game', async () => {
    const svc = new BungieApiService('k', 'https://example.test/Platform', 'https://example.test/d1/Platform');
    jest.spyOn(svc, 'getBungiePgcr').mockImplementation(async (_id: string, game: string) => (game === 'D1' ? d1Envelope : d2Envelope));
    const { app } = makeApp(svc);
    const res = await request(app).get(`/api/pgcr/${ID}?game=D1`);
    expect(res.status).toBe(200);
    expect(res.body.activity.game).toBe('D1');
    expect(res.body.activity.period).toBe('2020-12-13T15:03:59Z');
    expect(res.body.activity.membership_id).toBe(REQUESTER);
  });
});

describe('BungieApiService.getBungiePgcr', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const svc = new BungieApiService('k', 'https://example.test/Platform', 'https://example.test/d1/Platform');
  const reply = (status: number, body: any) => jest.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })) as any;

  it('uses the game-specific URL', async () => {
    global.fetch = reply(200, d1Envelope);
    await svc.getBungiePgcr(ID, 'D1');
    expect((global.fetch as any).mock.calls[0][0]).toBe(`https://example.test/d1/Platform/Destiny/Stats/PostGameCarnageReport/${ID}/`);
    global.fetch = reply(200, d2Envelope);
    await svc.getBungiePgcr(ID, 'D2');
    expect((global.fetch as any).mock.calls[0][0]).toBe(`https://example.test/Platform/Destiny2/Stats/PostGameCarnageReport/${ID}/`);
  });

  it('throws on ErrorCode != 1 (HTTP 200 SystemDisabled) and returns null for PGCR not found', async () => {
    global.fetch = reply(200, { ErrorCode: 5, ErrorStatus: 'SystemDisabled' });
    await expect(svc.getBungiePgcr(ID, 'D1')).rejects.toBeInstanceOf(BungieApiError);
    global.fetch = reply(500, { ErrorCode: 1653, ErrorStatus: 'DestinyPGCRNotFound' });
    await expect(svc.getBungiePgcr(ID, 'D2')).resolves.toBeNull();
  });
});
