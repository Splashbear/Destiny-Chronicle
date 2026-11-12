import * as fs from 'fs';
import { logger } from './logger';

/** Max D1 instance id served from archive when billions 1–3 are configured. */
export const D1_MAX_INSTANCE_ID_B3 = 3_000_000_000;
/** Max D1 instance id served from archive when billions 1–2 are configured. */
export const D1_MAX_INSTANCE_ID_B2 = 2_000_000_000;
/** Legacy single-root cap (billion 1). */
export const D1_MAX_INSTANCE_ID_B1 = 1_000_000_000;
/** One D1 "billion" root covers this many instance ids (root i → ((i)*B, (i+1)*B]). */
export const D1_BILLION = 1_000_000_000;
/** D1 played-with band size: pw/iid_band=N with N = floor(instance_id / BAND). */
export const D1_PW_BAND_SIZE = 1_000_000;

/**
 * Parse `;`-separated multi-root env, falling back to a single-root var.
 * Empty entries are dropped; order is preserved; duplicates removed.
 */
export function parseRootList(multi?: string | null, single?: string | null): string[] {
  const raw = String(multi || '').trim() || String(single || '').trim();
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(';')) {
    const p = part.trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Keep roots that exist on disk; log and skip the rest. */
export function filterExistingRoots(roots: string[], label: string): string[] {
  const ok: string[] = [];
  for (const root of roots) {
    try {
      if (fs.existsSync(root)) ok.push(root);
      else logger.warn(`${label} missing, skipping`, { root });
    } catch {
      logger.warn(`${label} inaccessible, skipping`, { root });
    }
  }
  return ok;
}

/**
 * Coverage note from how many roots were configured (env list length),
 * not how many currently exist on disk.
 */
export function d1CoverageCaveat(configuredRootCount: number): string {
  if (configuredRootCount >= 3) {
    return 'D1 coverage: billions 1-3 (IDs 1-3B, Aug 30 2014 to ~Jul 2015). Later D1 history falls back to Bungie live.';
  }
  if (configuredRootCount >= 2) {
    return 'D1 coverage: billions 1-2 (IDs 1-2B, Aug 30 2014 to ~Mar 2015). Later D1 history falls back to Bungie live.';
  }
  return 'D1 coverage: billion 1 only (IDs 1-1B, Aug 30 to Dec 9 2014). Later D1 history falls back to Bungie live.';
}

export function d1MaxInstanceId(configuredRootCount: number): number {
  if (configuredRootCount >= 3) return D1_MAX_INSTANCE_ID_B3;
  if (configuredRootCount >= 2) return D1_MAX_INSTANCE_ID_B2;
  return D1_MAX_INSTANCE_ID_B1;
}

/**
 * Which configured D1 root indexes (0-based, same order as D1_INDEX_ROOTS) can
 * contain this instance id. Derived from root count × D1_BILLION — not a hardcoded
 * path list. Exact billion boundaries may exist in adjacent roots (shared bands).
 */
export function d1RootIndexesForInstanceId(
  instanceId: string | number,
  configuredRootCount: number
): number[] {
  const id = typeof instanceId === 'number' ? instanceId : Number(instanceId);
  if (!Number.isFinite(id) || id < 1 || configuredRootCount < 1) return [];
  const maxId = d1MaxInstanceId(configuredRootCount);
  if (id > maxId) return [];

  const primary = Math.min(configuredRootCount - 1, Math.floor((id - 1) / D1_BILLION));
  const out = new Set<number>([primary]);
  // Shared boundary bands (e.g. iid 1e9 in billion-1 and band 1000 in billion-2).
  if (id % D1_BILLION === 0 && primary + 1 < configuredRootCount) {
    out.add(primary + 1);
  }
  return [...out].sort((a, b) => a - b);
}

/** Played-with iid_band for a D1 instance id. */
export function d1PlayedWithBand(instanceId: string | number): number {
  const id = typeof instanceId === 'number' ? instanceId : Number(instanceId);
  if (!Number.isFinite(id) || id < 0) return 0;
  return Math.floor(id / D1_PW_BAND_SIZE);
}

export function activityDedupeKey(a: {
  game?: string;
  instance_id?: string;
  membership_id?: string;
  character_id?: string;
}): string {
  return `${a.game || 'D1'}|${a.instance_id}|${a.membership_id}|${a.character_id}`;
}
