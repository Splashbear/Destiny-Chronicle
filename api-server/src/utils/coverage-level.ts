/**
 * W3 coverage.level rules (LAUNCH BLOCKER).
 *
 * 'full' only if: D2, has rows, not truncated, no W9 hole overlap/abut in the
 * player's instance-id range, and tier was not already partial/absent.
 * D1 must never be 'full'. Empty windows must not be 'full'.
 */

import * as fs from 'fs';
import * as path from 'path';

export type CoverageLevel = 'full' | 'partial' | 'absent';

export interface HoleRun {
  start: number;
  end: number;
  len?: number;
}

export interface CoverageResolveInput {
  tierLevel: CoverageLevel;
  source: string;
  game?: 'D1' | 'D2' | string;
  activities: Array<{ instance_id?: string; period?: string; game?: string }>;
  /** Request limit used for the query (after clamping). */
  limit: number;
  /** When true, append W8 documentation note. */
  gapLeanEnabled?: boolean;
  holeRuns?: HoleRun[];
}

export interface CoverageResolveResult {
  level: CoverageLevel;
  notes: string[];
  truncated: boolean;
  holeOverlap: boolean;
}

let cachedHoles: HoleRun[] | null | undefined;

/** Load W9 missing-IID runs (2313 runs). Cached after first read. */
export function loadGapMissingIidRuns(explicitPath?: string): HoleRun[] {
  if (cachedHoles !== undefined && !explicitPath) {
    return cachedHoles || [];
  }
  const candidates = [
    explicitPath,
    process.env.GAP_MISSING_IID_RUNS_PATH,
    path.join(__dirname, '..', '..', 'data', 'gap_missing_iid_runs.json'),
    path.join(process.cwd(), 'data', 'gap_missing_iid_runs.json'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const runs = (raw.runs || raw) as HoleRun[];
      if (!Array.isArray(runs)) continue;
      const normalized = runs
        .map((r) => ({ start: Number(r.start), end: Number(r.end) }))
        .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start)
        .sort((a, b) => a.start - b.start);
      if (!explicitPath) cachedHoles = normalized;
      return normalized;
    } catch {
      continue;
    }
  }
  if (!explicitPath) cachedHoles = [];
  return [];
}

/** For tests — inject or clear hole cache. */
export function setGapMissingIidRunsForTests(runs: HoleRun[] | null): void {
  cachedHoles = runs === null ? undefined : runs;
}

/** W10: treat near-hole iids as abut (Bot sample was 231 below hole start). */
export const HOLE_ABUT_MARGIN = 1000;

/**
 * True if [a0,a1] overlaps [b0,b1] or comes within `margin` instance IDs (inclusive).
 */
export function rangesOverlapOrAbut(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  margin: number = HOLE_ABUT_MARGIN
): boolean {
  const loA = Math.min(a0, a1);
  const hiA = Math.max(a0, a1);
  const loB = Math.min(b0, b1) - margin;
  const hiB = Math.max(b0, b1) + margin;
  return loA <= hiB && hiA >= loB;
}

/** Binary search: any hole overlaps/abuts [minIid, maxIid] within HOLE_ABUT_MARGIN? */
export function playerRangeHitsHole(minIid: number, maxIid: number, holes: HoleRun[]): boolean {
  if (!holes.length || !Number.isFinite(minIid) || !Number.isFinite(maxIid)) return false;
  const lo = Math.min(minIid, maxIid);
  const hi = Math.max(minIid, maxIid);
  const margin = HOLE_ABUT_MARGIN;
  // Find first hole with end+margin >= lo
  let left = 0;
  let right = holes.length - 1;
  let idx = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (holes[mid].end + margin >= lo) {
      idx = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  if (idx < 0) return false;
  for (let i = idx; i < holes.length; i++) {
    const h = holes[i];
    if (h.start - margin > hi) break;
    if (rangesOverlapOrAbut(lo, hi, h.start, h.end, margin)) return true;
  }
  return false;
}

/** W10: only compact-only partials strip activity rows from the response. */
export function shouldStripPartialActivities(source: string): boolean {
  return source === 'compact_ids';
}

function instanceIds(activities: CoverageResolveInput['activities']): number[] {
  const out: number[] = [];
  for (const a of activities) {
    const n = Number(a.instance_id);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/**
 * Apply W3 rules to produce the client-facing coverage.level.
 */
export function resolveCoverageLevel(input: CoverageResolveInput): CoverageResolveResult {
  const notes: string[] = [];
  const rowCount = input.activities.length;
  const game = (input.game || '').toUpperCase();
  const truncated = rowCount > 0 && rowCount >= input.limit;
  const holes = input.holeRuns ?? loadGapMissingIidRuns();
  const iids = instanceIds(input.activities);
  let holeOverlap = false;
  if (iids.length > 0 && holes.length > 0) {
    const minIid = Math.min(...iids);
    const maxIid = Math.max(...iids);
    holeOverlap = playerRangeHitsHole(minIid, maxIid, holes);
  }

  // Start from tier, never upgrade absent/partial → full here.
  let level: CoverageLevel = input.tierLevel;

  // W3: D1 must never be full (live Bungie is source of truth).
  if (game === 'D1') {
    level = rowCount > 0 ? 'partial' : 'absent';
    notes.push('W3: D1 coverage is never full (live Bungie D1)');
  }

  // Empty / out-of-range window: never full.
  if (rowCount === 0) {
    if (level === 'full') level = 'absent';
    // keep partial/absent from compact-known-player cases
    notes.push('W3: empty result is not full coverage');
  }

  // Truncated response (hit limit): not full.
  if (truncated && level === 'full') {
    level = 'partial';
    notes.push(`W3: truncated at limit=${input.limit}; coverage partial`);
  }

  // W9 hole overlap/abut in player's instance range.
  if (holeOverlap && level === 'full') {
    level = 'partial';
    notes.push('W3: player instance range overlaps/abuts a known archive hole (W9); coverage partial');
  }

  // Compact IDs are always partial (no dates) — reinforce.
  if (input.source === 'compact_ids' && level === 'full') {
    level = 'partial';
  }

  // W8 documentation when gap lean is on.
  if (input.gapLeanEnabled) {
    notes.push(
      "W8: ~245k gap rows have membership_id='0' (unreachable by player lookup; zeros in raw dump)"
    );
  }

  return { level, notes, truncated, holeOverlap };
}
