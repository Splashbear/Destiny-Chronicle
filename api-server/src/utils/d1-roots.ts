import * as fs from 'fs';
import { logger } from './logger';

/** Max D1 instance id served from archive when billions 1–2 are configured. */
export const D1_MAX_INSTANCE_ID_B2 = 2_000_000_000;
/** Legacy single-root cap (billion 1). */
export const D1_MAX_INSTANCE_ID_B1 = 1_000_000_000;

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
  if (configuredRootCount >= 2) {
    return 'D1 coverage: billions 1-2 (IDs 1-2B, Aug 30 2014 to ~Mar 2015). Later D1 history falls back to Bungie live.';
  }
  return 'D1 coverage: billion 1 only (IDs 1-1B, Aug 30 to Dec 9 2014). Later D1 history falls back to Bungie live.';
}

export function d1MaxInstanceId(configuredRootCount: number): number {
  return configuredRootCount >= 2 ? D1_MAX_INSTANCE_ID_B2 : D1_MAX_INSTANCE_ID_B1;
}

export function activityDedupeKey(a: {
  game?: string;
  instance_id?: string;
  membership_id?: string;
  character_id?: string;
}): string {
  return `${a.game || 'D1'}|${a.instance_id}|${a.membership_id}|${a.character_id}`;
}
