/**
 * Helpers for single-game archive PGCR assembly (game + instance ID).
 * Player-centric lean peels are not a full fireteam — treat as a miss.
 */

/** Modes that almost always have a multi-player roster in Destiny. */
export const MULTIPLAYER_MODES = new Set<number>([
  4, // Raid
  82, // Dungeon
  3, // Strike / playlist
  16, 17, 46, 47, // Nightfall family
  5, 10, 12, 19, 31, 37, 38, 39, 48, 59, 60, 61, 62, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 84, 85, 86, 87, 88, 89, 90, 91,
]);

export interface RosterLeanRow {
  membership_id?: string;
  mode?: number;
}

/**
 * True when archive rows look like a single-player peel of a multiplayer activity.
 * Full fireteam indexes (gap / D1 act globs) should not hit this after a complete glob.
 */
export function isPartialArchiveRoster(
  rows: RosterLeanRow[],
  opts?: { fromFireteamIndex?: boolean }
): boolean {
  if (!rows.length) return true;
  if (opts?.fromFireteamIndex) return false;
  const mids = new Set(
    rows.map(r => String(r.membership_id || '')).filter(id => id && id !== '0')
  );
  if (mids.size >= 2) return false;
  const mode = Number(rows[0]?.mode ?? 0);
  if (MULTIPLAYER_MODES.has(mode)) return true;
  // Unknown / 0 mode with a single mid: safer to miss than show a one-player "raid".
  if (!mode) return true;
  return false;
}

/** Describe configured game-data roots for history + instance routes (reachability audits). */
export interface GameDataRootDescriptor {
  kind: 'lean' | 'lite' | 'gap' | 'gap_extra' | 'd1_act';
  path: string;
  usedBy: Array<'history' | 'instance'>;
}

export function describeConfiguredGameDataRoots(input: {
  leanActivitiesPath?: string;
  playerActivitiesLitePath?: string;
  gapIndexRoot?: string;
  gapIndexSortedRoot?: string;
  gapIndexExtraRoots?: string[];
  enableGapLean?: boolean;
  d1IndexRoots?: string[];
}): GameDataRootDescriptor[] {
  const out: GameDataRootDescriptor[] = [];
  const push = (kind: GameDataRootDescriptor['kind'], path: string, usedBy: GameDataRootDescriptor['usedBy']) => {
    const p = String(path || '').trim();
    if (!p) return;
    out.push({ kind, path: p, usedBy });
  };
  push('lean', input.leanActivitiesPath || '', ['history', 'instance']);
  if (input.playerActivitiesLitePath && input.playerActivitiesLitePath !== input.leanActivitiesPath) {
    push('lite', input.playerActivitiesLitePath, ['history']);
  }
  if (input.enableGapLean) {
    push('gap', input.gapIndexRoot || '', ['history', 'instance']);
    push('gap', input.gapIndexSortedRoot || '', ['history', 'instance']);
    for (const r of input.gapIndexExtraRoots || []) {
      push('gap_extra', r, ['history', 'instance']);
    }
  }
  for (const r of input.d1IndexRoots || []) {
    push('d1_act', r, ['history', 'instance']);
  }
  return out;
}
