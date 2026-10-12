import { SOCIAL_HUB_ACTIVITY_HASHES } from '../utils/social-hubs';
import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'duckdb-async';
import { logger } from '../utils/logger';

/**
 * Played With reader over two band layouts (both `<root>/iid_band=N/*.parquet`, N = instance_id / 1e6):
 *  - legacy  (instance ids below splitIid): string ids, has display_name + team.
 *  - compact (splitIid .. compactMaxIid): shrunk numeric ids, no display_name / team.
 *    Built per 10M source file; a band is only read when that file's done marker exists.
 * Instances outside covered bands are reported as uncovered so the client falls back to Bungie.
 */

export const BAND_SIZE = 1_000_000;
export const SOURCE_FILE_SPAN = 10_000_000;

export interface PlayedWithConfig {
  legacyRoot: string;
  compactRoot: string;
  compactDoneDir: string;
  splitIid: number;
  compactMaxIid: number;
  threads: number;
  memoryLimit: string;
  /** DuckDB spill directory; must be on a data drive (never the server's working directory). */
  tempDir?: string;
  /** games containing any of these membership ids are skipped (bots). */
  excludeIds?: string[];
}

export function loadPlayedWithConfig(env: NodeJS.ProcessEnv = process.env): PlayedWithConfig | null {
  const legacyRoot = (env.PLAYED_WITH_LEGACY_ROOT || env.PLAYED_WITH_ROOT || '').trim();
  const compactRoot = (env.PLAYED_WITH_COMPACT_ROOT || '').trim();
  if (!legacyRoot && !compactRoot) return null;
  const compactDoneDir = (env.PLAYED_WITH_COMPACT_DONE_DIR || '').trim()
    || (compactRoot ? path.join(path.dirname(compactRoot), '_w38_state', 'done') : '');
  return {
    legacyRoot,
    compactRoot,
    compactDoneDir,
    splitIid: Number(env.PLAYED_WITH_SPLIT_IID || 10_000_000_000),
    compactMaxIid: Number(env.PLAYED_WITH_COMPACT_MAX_IID || 16_000_000_000),
    threads: Math.max(1, parseInt(env.PLAYED_WITH_DUCKDB_THREADS || '2', 10) || 2),
    memoryLimit: (env.PLAYED_WITH_DUCKDB_MEMORY || '2GB').replace(/'/g, ''),
    tempDir: (env.PLAYED_WITH_DUCKDB_TEMP_DIR || '').trim() || defaultTempDir(compactRoot || legacyRoot),
    excludeIds: [...new Set([...KNOWN_BOT_IDS, ...(env.PLAYED_WITH_EXCLUDE_IDS || '').split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x))])],
  };
}

/** Default spill dir: next to the index on its data drive, e.g. <index parent>/_duckdb_tmp. */
export function defaultTempDir(root: string): string {
  return path.join(path.dirname(path.resolve(root)), '_duckdb_tmp');
}

/** Done-marker stem for the 10M source file that holds a band, e.g. band 10003 -> "10000000000-10010000000". */
export function sourceStemForBand(band: number): string {
  const lo = Math.floor((band * BAND_SIZE) / SOURCE_FILE_SPAN) * SOURCE_FILE_SPAN;
  return `${lo}-${lo + SOURCE_FILE_SPAN}`;
}

export interface BandPlan {
  legacy: Map<number, string[]>;
  compact: Map<number, string[]>;
  /** instance ids we cannot answer from the index (unfinished band, above range, no root). */
  uncovered: string[];
  uncoveredReasons: Record<string, number>;
}

export function planBands(
  instanceIds: Iterable<string>,
  cfg: Pick<PlayedWithConfig, 'legacyRoot' | 'compactRoot' | 'splitIid' | 'compactMaxIid'>,
  compactDoneStems: ReadonlySet<string>
): BandPlan {
  const plan: BandPlan = { legacy: new Map(), compact: new Map(), uncovered: [], uncoveredReasons: {} };
  const miss = (id: string, why: string) => {
    plan.uncovered.push(id);
    plan.uncoveredReasons[why] = (plan.uncoveredReasons[why] || 0) + 1;
  };
  const push = (m: Map<number, string[]>, band: number, id: string) => {
    const l = m.get(band);
    if (l) l.push(id); else m.set(band, [id]);
  };
  for (const id of new Set(instanceIds)) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) { miss(id, 'invalid'); continue; }
    const band = Math.floor(n / BAND_SIZE);
    if (n < cfg.splitIid) {
      if (cfg.legacyRoot) push(plan.legacy, band, id); else miss(id, 'no_legacy_root');
    } else if (n < cfg.compactMaxIid) {
      if (!cfg.compactRoot) miss(id, 'no_compact_root');
      else if (!compactDoneStems.has(sourceStemForBand(band))) miss(id, 'band_not_built');
      else push(plan.compact, band, id);
    } else {
      miss(id, 'above_index');
    }
  }
  return plan;
}

export interface PlayerInstance {
  instanceId: string;
  durationSeconds: number;
  period?: string;
}

export interface PartnerRow {
  membershipId: string;
  displayName: string;
  activitiesTogether: number;
  timeTogetherSeconds: number;
  lastPlayedTogether?: string;
  /** most recent shared instance (used to fill missing names from the PGCR). */
  lastInstanceId?: string;
}

export interface PlayedWithCoverage {
  complete: boolean;
  totalInstances: number;
  coveredInstances: number;
  uncoveredInstances: number;
  uncoveredReasons: Record<string, number>;
  legacyBands: number;
  compactBands: number;
}

export interface PlayedWithResult {
  partners: PartnerRow[];
  coverage: PlayedWithCoverage;
}

export type NameResolver = (instanceId: string, membershipId: string) => Promise<string | null>;

function bandFiles(root: string, band: number): string[] {
  const dir = path.join(root, `iid_band=${band}`);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.parquet')).map((f) => path.join(dir, f).replace(/\\/g, '/'));
  } catch {
    return [];
  }
}

/** Both formats normalized to ISO-8601 UTC 'YYYY-MM-DDTHH:MM:SSZ' so max()/arg_max compare correctly. */
const PERIOD_LEGACY = `strftime(CAST(replace(replace(CAST(period AS VARCHAR), 'T', ' '), 'Z', '') AS TIMESTAMP), '%Y-%m-%dT%H:%M:%SZ')`;
const PERIOD_COMPACT = `strftime(CAST(period AS TIMESTAMP), '%Y-%m-%dT%H:%M:%SZ')`;

/**
 * Social hubs (Tower, Farm, ...) are excluded from Played With, same rule as the activity list (W6/PR #22):
 * mode 40, or mode 0 with a known hub activity hash; never mode 0 alone. Both band formats carry
 * mode + activity_hash per row, so this also covers accounts found only in 10-16B (no mode in their
 * activity list) - those bands are still read, the hub rows are dropped in the scan.
 */
export const HUB_CLAUSE = ` AND NOT (COALESCE(mode, -1) = 40 OR (COALESCE(mode, -1) = 0 AND activity_hash IN (${[...SOCIAL_HUB_ACTIVITY_HASHES].join(',')})))`;

/**
 * Oversized games (checkpoint-bot lobbies, Bungie mega-PGCRs) are dropped from Played With only.
 * Raids are 6-player; roster rows are per character, so up to 6 players x 3 characters = 18 rows.
 * The 12-person raid glitch (2021-02-26 .. 2021-03-16 UTC) is kept: cap 36 (12 x 3) in that window.
 * Dungeons are 3-player: more than 9 rows (3 x 3) is skipped, no glitch exception.
 * Other activity types are not capped here (they only lose games that contain an excluded bot).
 */
export const RAID_MODE = 4;
export const RAID_ROW_CAP = 18;
export const GLITCH_RAID_ROW_CAP = 36;
export const DUNGEON_MODE = 82;
export const DUNGEON_ROW_CAP = 9; // 3 players x 3 characters, no glitch exception
export const GLITCH_FROM = '2021-02-26';
export const GLITCH_TO_EXCL = '2021-03-17';
const ROSTER_OK = `NOT (COALESCE(md, -1) = ${RAID_MODE} AND nrows > CASE WHEN per >= '${GLITCH_FROM}' AND per < '${GLITCH_TO_EXCL}' THEN ${GLITCH_RAID_ROW_CAP} ELSE ${RAID_ROW_CAP} END)
  AND NOT (COALESCE(md, -1) = ${DUNGEON_MODE} AND nrows > ${DUNGEON_ROW_CAP})`;

/** Known checkpoint/carry bot accounts (public accounts named by the site owner); games containing them are skipped. */
export const KNOWN_BOT_IDS: readonly string[] = [
  // Resolved via Bungie GlobalName search (all linked platform memberships).
  '4611686018518440725', '4611686018518935262', // LuckBot9#961
  '4611686018537190973', // luckbot9#8561
  '4611686018540181977', '4611686018540204958', // destinycheckpoints#499
  '4611686018557682779', // DestinyCheckpoints#2859
  '4611686018536692735', '4611686018537888002', // TravelersChosenTeam#8992
  '4611686018555366187', '4611686018555366367', // D2Catalysts#662
];

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export class PlayedWithService {
  private db: Database | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly cfg: PlayedWithConfig, private readonly resolveName?: NameResolver) {}

  /** Done-marker stems currently present (re-read per request so new W38 files appear without restart). */
  readCompactDoneStems(): Set<string> {
    const out = new Set<string>();
    if (!this.cfg.compactDoneDir) return out;
    try {
      for (const f of fs.readdirSync(this.cfg.compactDoneDir)) if (f.endsWith('.json')) out.add(f.slice(0, -5));
    } catch { /* no markers yet */ }
    return out;
  }

  private async getDb(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.create(':memory:');
      await this.db.all(`SET threads=${this.cfg.threads}`);
      await this.db.all(`SET memory_limit='${this.cfg.memoryLimit}'`);
    const tmp = (this.cfg.tempDir || defaultTempDir(this.cfg.compactRoot || this.cfg.legacyRoot)).replace(/'/g, '');
    await this.db.all(`SET temp_directory='${tmp.replace(/\\/g, '/')}'`);
    await this.db.all('SET preserve_insertion_order=false');
    }
    return this.db;
  }

  /** One request at a time on the shared connection (temp tables). */
  async getPartners(selfIds: string[], instances: PlayerInstance[], limit = 500): Promise<PlayedWithResult> {
    const run = this.queue.then(() => this.getPartnersInner(selfIds, instances, limit));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async getPartnersInner(selfIds: string[], instances: PlayerInstance[], limit: number): Promise<PlayedWithResult> {
    const durations = new Map<string, number>();
    for (const i of instances) if (i.instanceId) durations.set(String(i.instanceId), Number(i.durationSeconds) || 0);
    const plan = planBands(durations.keys(), this.cfg, this.readCompactDoneStems());

    // Per band: files + this player's ids. Each band is read with its own IN-list so DuckDB
    // can skip row groups by min/max (files are sorted by instance_id); a join would scan whole bands.
    type BandRead = { kind: 'legacy' | 'compact'; files: string[]; ids: string[] };
    const reads: BandRead[] = [];
    const covered: string[] = [];
    const collect = (kind: 'legacy' | 'compact', root: string, m: Map<number, string[]>) => {
      for (const [band, ids] of m) {
        const files = bandFiles(root, band);
        if (files.length) { reads.push({ kind, files, ids }); covered.push(...ids); }
        else {
          plan.uncovered.push(...ids);
          plan.uncoveredReasons.band_missing = (plan.uncoveredReasons.band_missing || 0) + ids.length;
        }
      }
    };
    collect('legacy', this.cfg.legacyRoot, plan.legacy);
    collect('compact', this.cfg.compactRoot, plan.compact);
    const coverage: PlayedWithCoverage = {
      complete: plan.uncovered.length === 0,
      totalInstances: durations.size,
      coveredInstances: covered.length,
      uncoveredInstances: plan.uncovered.length,
      uncoveredReasons: plan.uncoveredReasons,
      legacyBands: plan.legacy.size,
      compactBands: plan.compact.size,
    };
    if (!covered.length) return { partners: [], coverage };

    const tStart = Date.now();
    const db = await this.getDb();
    await db.all('DROP TABLE IF EXISTS pw_mine');
    await db.all('DROP TABLE IF EXISTS pw_rows');
    await db.all('CREATE TEMP TABLE pw_mine (instance_id BIGINT, duration_seconds INTEGER)');
    await db.all('CREATE TEMP TABLE pw_rows (instance_id BIGINT, membership_id VARCHAR, display_name VARCHAR, period VARCHAR)');
    for (let i = 0; i < covered.length; i += 2000) {
      const chunk = covered.slice(i, i + 2000).map((id) => `(${BigInt(id)}, ${Math.round(durations.get(id) || 0)})`);
      await db.all(`INSERT INTO pw_mine VALUES ${chunk.join(',')}`);
    }
    const self = selfIds.length ? selfIds.map((s) => sqlStr(String(s))).join(',') : "''";
    const bots = this.cfg.excludeIds && this.cfg.excludeIds.length
      ? this.cfg.excludeIds.map((s) => sqlStr(String(s))).join(',') : "''";
    const one = (r: BandRead) => {
      const src = `read_parquet([${r.files.map(sqlStr).join(',')}], union_by_name=true)`;
      const inList = r.ids.map((id) => String(BigInt(id))).join(',');
      const legacy = r.kind === 'legacy';
      const per = legacy ? PERIOD_LEGACY : PERIOD_COMPACT;
      const name = legacy ? `NULLIF(display_name, '')` : 'CAST(NULL AS VARCHAR)';
      // Roster rows are one per character (PGCR entries). Window over the whole roster (self included).
      return `SELECT iid, mid, nm, per FROM (
          SELECT CAST(instance_id AS BIGINT) AS iid, CAST(membership_id AS VARCHAR) AS mid, ${name} AS nm, ${per} AS per,
                 mode AS md, count(*) OVER (PARTITION BY instance_id) AS nrows,
                 bool_or(CAST(membership_id AS VARCHAR) IN (${bots})) OVER (PARTITION BY instance_id) AS hasbot
          FROM ${src} WHERE instance_id IN (${inList})${HUB_CLAUSE}
        ) WHERE mid NOT IN (${self}) AND NOT hasbot AND ${ROSTER_OK}`;
    };
    // Small batches on parallel connections: one big UNION ALL plans every read_parquet serially.
    const batches: BandRead[][] = [];
    for (let i = 0; i < reads.length; i += 20) batches.push(reads.slice(i, i + 20));
    const conns = await Promise.all(Array.from({ length: Math.min(this.cfg.threads, batches.length) }, () => db.connect()));
    let next = 0;
    const collected: unknown[][] = [];
    await Promise.all(conns.map(async (c) => {
      while (next < batches.length) {
        const b = batches[next++];
        const res = await c.all(b.map(one).join(' UNION ALL '));
        collected.push(res.map((r: Record<string, unknown>) => Object.values(r)));
      }
    }));
    await Promise.all(conns.map((c) => c.close()));
    const flat = collected.flat() as unknown[][];
    for (let i = 0; i < flat.length; i += 5000) {
      const vals = flat.slice(i, i + 5000).map(([iid, mid, name, per]) =>
        `(${String(iid)}, ${sqlStr(String(mid))}, ${name == null ? 'NULL' : sqlStr(String(name))}, ${per == null ? 'NULL' : sqlStr(String(per))})`);
      if (vals.length) await db.all(`INSERT INTO pw_rows VALUES ${vals.join(',')}`);
    }
    const tRead = Date.now();
    const sql = `
      WITH shared AS (SELECT r.*, m.duration_seconds FROM pw_rows r JOIN pw_mine m USING (instance_id)),
      per_inst AS (
        SELECT membership_id, instance_id, any_value(duration_seconds) AS d, max(period) AS period,
               max(display_name) FILTER (WHERE display_name IS NOT NULL) AS name
        FROM shared GROUP BY membership_id, instance_id
      )
      SELECT membership_id, count(*) AS n, sum(d) AS t, max(period) AS last_period,
             arg_max(name, period) FILTER (WHERE name IS NOT NULL) AS name,
             CAST(arg_max(instance_id, period) AS VARCHAR) AS last_iid
      FROM per_inst GROUP BY membership_id
      ORDER BY n DESC, t DESC LIMIT ${Math.max(1, Math.min(5000, Math.floor(limit)))}`;
    const rows = (await db.all(sql)) as Array<{ membership_id: string; n: number | bigint; t: number | bigint | null; last_period: string | null; name: string | null; last_iid: string | null }>;
    await db.all('DROP TABLE IF EXISTS pw_mine');
    await db.all('DROP TABLE IF EXISTS pw_rows');

    const partners: PartnerRow[] = rows.map((r) => ({
      membershipId: String(r.membership_id),
      displayName: r.name || '',
      activitiesTogether: Number(r.n),
      timeTogetherSeconds: Number(r.t || 0),
      lastPlayedTogether: r.last_period || undefined,
      lastInstanceId: r.last_iid || undefined,
    }));
    const tAgg = Date.now();
    await this.fillMissingNames(partners);
    logger.info('Played With timing', { bands: reads.length, instances: covered.length, readMs: tRead - tStart, aggMs: tAgg - tRead, namesMs: Date.now() - tAgg });
    return { partners, coverage };
  }

  /** 10-16B rows carry no names: look them up from the PGCR of the last shared game (top partners only). */
  private async fillMissingNames(partners: PartnerRow[], max = 100): Promise<void> {
    if (!this.resolveName) return;
    const todo = partners.filter((p) => !p.displayName && p.lastInstanceId).slice(0, max);
    for (const p of todo) {
      try {
        const name = await this.resolveName(p.lastInstanceId!, p.membershipId);
        if (name) p.displayName = name;
      } catch (e) {
        logger.debug('Played With name lookup failed', { membershipId: p.membershipId, error: String(e) });
      }
    }
  }

  async close(): Promise<void> {
    if (this.db) await this.db.close();
    this.db = null;
  }
}
