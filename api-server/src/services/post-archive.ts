import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { isSocialHubActivity } from '../utils/social-hubs';
import {
  DUNGEON_MODE, DUNGEON_ROW_CAP, GLITCH_DUNGEON_ROW_CAP, GLITCH_FROM, GLITCH_RAID_ROW_CAP, GLITCH_TO_EXCL,
  RAID_MODE, RAID_ROW_CAP,
} from './played-with.service';

/**
 * Games newer than the archive (instance id >= PLAYED_WITH_COMPACT_MAX_IID) filled from Bungie.
 * Slim rosters are stored once per game in a shared side store, so a game two looked-up players shared
 * is fetched once:  <root>/<iid / 1e6>/<iid>.json.gz  =  { i, p, m, h, r: [[membershipId, name], ...] }
 * (one roster row per character entry, as in the archive). Nothing is ever deleted here.
 */
export interface SlimPgcr { i: string; p: string; m: number; h: number; r: Array<[string, string]> }
export interface HistoryGame { instanceId: string; period: string; mode: number; hash: number; durationSeconds: number }

const iso = (p: string) => new Date(p).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Same rules as the archive scan: bots, social hubs, raid 18 / dungeon 9 roster rows (36 / 18 in the glitch window). */
export function rosterAllowed(g: SlimPgcr, botIds: ReadonlySet<string>): boolean {
  if (isSocialHubActivity({ mode: g.m, activity_hash: g.h })) return false;
  if (g.r.some(([mid]) => botIds.has(mid))) return false;
  const day = g.p.slice(0, 10);
  const glitch = day >= GLITCH_FROM && day < GLITCH_TO_EXCL;
  if (g.m === RAID_MODE && g.r.length > (glitch ? GLITCH_RAID_ROW_CAP : RAID_ROW_CAP)) return false;
  if (g.m === DUNGEON_MODE && g.r.length > (glitch ? GLITCH_DUNGEON_ROW_CAP : DUNGEON_ROW_CAP)) return false;
  return true;
}

/** Bungie PGCR response -> slim roster. Names are Bungie names (Name#1234) when set, else the platform name. */
export function slimFromBungie(instanceId: string, data: any): SlimPgcr {
  const r = data?.Response ?? data;
  const entries: any[] = r?.entries || [];
  return {
    i: String(instanceId),
    p: iso(r?.period),
    m: Number(r?.activityDetails?.mode) || 0,
    h: Number(r?.activityDetails?.directorActivityHash ?? r?.activityDetails?.referenceId) || 0,
    r: entries.map((e) => {
      const u = e?.player?.destinyUserInfo || {};
      const g = String(u.bungieGlobalDisplayName || '').trim();
      const code = u.bungieGlobalDisplayNameCode;
      const name = g ? (code != null ? `${g}#${String(code).padStart(4, '0')}` : g) : String(u.displayName || '').trim();
      return [String(u.membershipId), name] as [string, string];
    }),
  };
}

export class PostArchiveStore {
  constructor(readonly root: string) {}
  file(iid: string) { return path.join(this.root, String(Math.floor(Number(iid) / 1e6)), `${iid}.json.gz`); }
  get(iid: string): SlimPgcr | null {
    try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(this.file(iid))).toString('utf8')); } catch { return null; }
  }
  put(g: SlimPgcr): void {
    const f = this.file(g.i); fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(g)));
    fs.renameSync(tmp, f);
  }
}

type FetchFn = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** Minimal Bungie client for the worker: API key header, retry with backoff on throttling / 5xx. */
export class BungieLite {
  calls = 0;
  constructor(private key: string, private root = 'https://www.bungie.net/Platform', private fetchFn: FetchFn = (globalThis as any).fetch) {}
  async get(url: string, tries = 5): Promise<any> {
    for (let a = 0; ; a++) {
      this.calls++;
      let status = 0; let body: any = null;
      try {
        const res = await this.fetchFn(url.startsWith('http') ? url : `${this.root}${url}`, { headers: { 'X-API-Key': this.key } });
        status = res.status; body = await res.json().catch(() => null);
      } catch (e) { status = -1; body = { ErrorStatus: String(e) }; }
      if (body && body.ErrorCode === 1) return body.Response;
      const retry = status === -1 || status === 429 || status >= 500 || body?.ErrorCode === 36 || body?.ErrorCode === 51 || body?.ThrottleSeconds > 0;
      if (!retry || a + 1 >= tries) {
        const err: any = new Error(`Bungie ${status} ${body?.ErrorStatus ?? ''}`.trim()); err.errorStatus = body?.ErrorStatus; err.status = status; throw err;
      }
      await new Promise((r) => setTimeout(r, Math.max(1000 * (body?.ThrottleSeconds || 0), 500 * 2 ** a)));
    }
  }
}

export interface AccountInfo { membershipType: number; name: string; characterIds: string[] }

/** Platform, current name, and every character (deleted ones too, via account stats). */
export async function accountInfo(b: BungieLite, membershipId: string, typeHint?: number): Promise<AccountInfo> {
  let membershipType = typeHint || 0; let name = '';
  try {
    const lp = await b.get(`/Destiny2/-1/Profile/${membershipId}/LinkedProfiles/`);
    const all = [...(lp?.profiles || []), ...(lp?.profilesWithErrors || []).map((x: any) => x.infoCard)].filter(Boolean);
    const me = all.find((p: any) => String(p.membershipId) === membershipId);
    if (me) {
      membershipType = membershipType || Number(me.membershipType);
      const g = String(me.bungieGlobalDisplayName || '').trim();
      name = g ? `${g}#${String(me.bungieGlobalDisplayNameCode ?? '').padStart(4, '0')}` : String(me.displayName || '');
    }
  } catch { /* fall through with the hint */ }
  if (!membershipType) throw new Error(`no membershipType for ${membershipId}`);
  const st = await b.get(`/Destiny2/${membershipType}/Account/${membershipId}/Stats/?groups=1`);
  const characterIds = (st?.characters || []).map((c: any) => String(c.characterId));
  return { membershipType, name, characterIds };
}

/**
 * Activity history newer than the archive: pages (mode None, 250/page, newest first) per character until a
 * page reaches below `floorIid` (archive top or this account's saved newest game). Social hubs are dropped.
 */
export async function historyAbove(b: BungieLite, info: AccountInfo, membershipId: string, floorIid: bigint): Promise<HistoryGame[]> {
  const out = new Map<string, HistoryGame>();
  for (const cid of info.characterIds) {
    for (let page = 0; page < 400; page++) {
      let r: any;
      try { r = await b.get(`/Destiny2/${info.membershipType}/Account/${membershipId}/Character/${cid}/Stats/Activities/?mode=0&count=250&page=${page}`); }
      catch (e: any) { if (/Privacy|NotFound/i.test(String(e.errorStatus))) break; throw e; }
      const acts: any[] = r?.activities || [];
      let below = false;
      for (const a of acts) {
        const iid = String(a.activityDetails?.instanceId);
        if (!/^\d+$/.test(iid)) continue;
        if (BigInt(iid) <= floorIid) { below = true; continue; }
        const g: HistoryGame = { instanceId: iid, period: iso(a.period), mode: Number(a.activityDetails?.mode) || 0, hash: Number(a.activityDetails?.directorActivityHash ?? a.activityDetails?.referenceId) || 0, durationSeconds: Number(a.values?.activityDurationSeconds?.basic?.value) || 0 };
        if (isSocialHubActivity({ mode: g.mode, activity_hash: g.hash })) continue;
        const cur = out.get(iid);
        if (!cur || g.durationSeconds > cur.durationSeconds) out.set(iid, g);
      }
      if (below || acts.length < 250) break;
    }
  }
  return [...out.values()];
}

/** Fetch PGCRs not yet in the store, `parallel` at a time. Returns ids that failed (left for the next refresh). */
export async function fetchMissing(b: BungieLite, store: PostArchiveStore, ids: string[], parallel = 10, onDone?: (done: number, total: number) => void): Promise<string[]> {
  const todo = ids.filter((i) => !fs.existsSync(store.file(i)));
  const failed: string[] = []; let next = 0; let done = 0;
  onDone?.(0, todo.length);
  await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, async () => {
    while (next < todo.length) {
      const iid = todo[next++];
      try { store.put(slimFromBungie(iid, await b.get(`https://stats.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/${iid}/`))); }
      catch { failed.push(iid); }
      onDone?.(++done, todo.length);
    }
  }));
  return failed;
}
