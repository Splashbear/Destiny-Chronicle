/**
 * Archive username → membershipId search (Bot 2026-10-26 option 2).
 *
 * Env: PLAYED_WITH_NAME_SEARCH_ROOT → {root}/names_by_prefix/p=ab.parquet
 *
 * Row: mid, display_name (latest), match_norm, last_seen, is_prior
 * (latest name + up to 3 prior names per mid; each searchable name is a row).
 *
 * Full ChronicleServer build is gated — see STATUS / BOT_DECISIONS.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'duckdb-async';
import { logger } from '../utils/logger';

const qPath = (p: string) => p.replace(/\\/g, '/');

export const USERNAME_SEARCH_MIN_CHARS = 3;
export const USERNAME_SEARCH_MAX_RESULTS = 10;

export interface UsernameSearchHit {
  membershipId: string;
  displayName: string;
  lastSeen?: string;
  nameSource: 'archive_index';
  matchedPriorName?: boolean;
}

export function normalizeUsernameSearchKey(raw: string): string {
  const withoutCode = String(raw ?? '').split('#')[0] ?? '';
  return withoutCode
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function usernameSearchPrefixKey(norm: string): string {
  const p = (norm.slice(0, 2) || '__').padEnd(2, '_');
  if (!/^[a-z0-9]{2}$/.test(p)) return '__';
  return p;
}

export function loadUsernameSearchRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const root = (env.PLAYED_WITH_NAME_SEARCH_ROOT || '').trim();
  return root || null;
}

function sqlStr(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}

export class UsernameSearchService {
  private readonly prefixDir: string;

  constructor(private readonly root: string) {
    this.prefixDir = path.join(root, 'names_by_prefix');
  }

  isReady(): boolean {
    try {
      return (
        fs.existsSync(this.prefixDir) &&
        fs.readdirSync(this.prefixDir).some((f) => f.startsWith('p=') && f.endsWith('.parquet'))
      );
    } catch {
      return false;
    }
  }

  /**
   * Build prefix buckets from name-table parquet (mid, name, first_seen, last_seen).
   * Keeps latest + up to 3 prior names per mid.
   */
  async buildFromNameTable(
    nameTableGlobOrFile: string,
    opts?: { threads?: number; memoryLimit?: string },
  ): Promise<{ mids: number; rows: number; buckets: number }> {
    fs.mkdirSync(this.prefixDir, { recursive: true });
    for (const f of fs.readdirSync(this.prefixDir)) {
      if (f.startsWith('p=') && f.endsWith('.parquet')) {
        fs.unlinkSync(path.join(this.prefixDir, f));
      }
    }

    const db = await Database.create(':memory:');
    try {
      if (opts?.threads) await db.all(`PRAGMA threads=${Number(opts.threads)}`);
      if (opts?.memoryLimit) {
        await db.all(`PRAGMA memory_limit='${opts.memoryLimit.replace(/'/g, '')}'`);
      }

      const src = qPath(nameTableGlobOrFile);
      await db.all(`
        CREATE TABLE src AS
        SELECT CAST(mid AS VARCHAR) AS mid,
               CAST(name AS VARCHAR) AS name,
               CAST(last_seen AS VARCHAR) AS last_seen
        FROM read_parquet('${src}')
        WHERE name IS NOT NULL AND TRIM(CAST(name AS VARCHAR)) <> ''
      `);

      await db.all(`
        CREATE TABLE ranked AS
        SELECT mid, name, last_seen,
               ROW_NUMBER() OVER (PARTITION BY mid ORDER BY last_seen DESC NULLS LAST, name) AS rn
        FROM src
        WHERE lower(trim(name)) NOT IN ('private guardian', 'guardian')
      `);
      await db.all(`
        CREATE TABLE kept AS
        SELECT mid, name, last_seen, (rn > 1) AS is_prior
        FROM ranked WHERE rn <= 4
      `);
      await db.all(`
        CREATE TABLE latest AS
        SELECT mid, name AS display_name, last_seen
        FROM ranked WHERE rn = 1
      `);

      const raw = (await db.all(`
        SELECT k.mid, l.display_name, k.name AS match_name, l.last_seen, k.is_prior
        FROM kept k JOIN latest l USING (mid)
      `)) as Array<{
        mid: string;
        display_name: string;
        match_name: string;
        last_seen: string;
        is_prior: boolean;
      }>;

      type Emit = {
        mid: string;
        display_name: string;
        match_norm: string;
        last_seen: string;
        is_prior: boolean;
      };
      const byPrefix = new Map<string, Emit[]>();
      const midSet = new Set<string>();
      for (const r of raw) {
        const match_norm = normalizeUsernameSearchKey(r.match_name);
        if (match_norm.length < USERNAME_SEARCH_MIN_CHARS) continue;
        midSet.add(String(r.mid));
        const pref = usernameSearchPrefixKey(match_norm);
        const list = byPrefix.get(pref) || [];
        list.push({
          mid: String(r.mid),
          display_name: String(r.display_name),
          match_norm,
          last_seen: String(r.last_seen ?? ''),
          is_prior: !!r.is_prior,
        });
        byPrefix.set(pref, list);
      }

      let rows = 0;
      for (const [pref, list] of byPrefix) {
        const out = path.join(this.prefixDir, `p=${pref}.parquet`);
        const values = list
          .map(
            (r) =>
              `(${sqlStr(r.mid)}, ${sqlStr(r.display_name)}, ${sqlStr(r.match_norm)}, ${sqlStr(r.last_seen)}, ${r.is_prior ? 'TRUE' : 'FALSE'})`,
          )
          .join(',\n');
        await db.all(`
          CREATE OR REPLACE TABLE bucket AS
          SELECT * FROM (VALUES ${values})
          t(mid, display_name, match_norm, last_seen, is_prior)
        `);
        await db.all(`COPY bucket TO '${qPath(out)}' (FORMAT parquet)`);
        rows += list.length;
      }

      const summary = { mids: midSet.size, rows, buckets: byPrefix.size };
      logger.info('Username search index built', summary);
      return summary;
    } finally {
      await db.close();
    }
  }

  async search(query: string, limit = USERNAME_SEARCH_MAX_RESULTS): Promise<UsernameSearchHit[]> {
    const norm = normalizeUsernameSearchKey(query);
    if (norm.length < USERNAME_SEARCH_MIN_CHARS) return [];
    if (!this.isReady()) return [];

    const pref = usernameSearchPrefixKey(norm);
    const file = path.join(this.prefixDir, `p=${pref}.parquet`);
    if (!fs.existsSync(file)) return [];

    const db = await Database.create(':memory:');
    try {
      const like = norm.replace(/[%_\\]/g, '\\$&') + '%';
      const rows = (await db.all(`
        SELECT mid, display_name, last_seen, is_prior,
               ROW_NUMBER() OVER (
                 PARTITION BY mid
                 ORDER BY CASE WHEN is_prior THEN 1 ELSE 0 END, last_seen DESC NULLS LAST
               ) AS rn
        FROM read_parquet('${qPath(file)}')
        WHERE match_norm LIKE ${sqlStr(like)} ESCAPE '\\'
      `)) as Array<{
        mid: string;
        display_name: string;
        last_seen: string;
        is_prior: boolean;
        rn: number;
      }>;

      const hits: UsernameSearchHit[] = [];
      for (const r of rows) {
        if (Number(r.rn) !== 1) continue;
        hits.push({
          membershipId: String(r.mid),
          displayName: String(r.display_name),
          lastSeen: r.last_seen || undefined,
          nameSource: 'archive_index',
          matchedPriorName: !!r.is_prior,
        });
        if (hits.length >= limit) break;
      }
      return hits;
    } finally {
      await db.close();
    }
  }
}
