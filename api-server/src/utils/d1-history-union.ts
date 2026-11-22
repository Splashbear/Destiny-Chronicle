import { LeanActivity } from '../types/lean-activity.types';

/**
 * D1 history = the D1 archive index (billions 1..N) plus the lite D1 history file.
 *
 * Before this, a D1 request returned only the archive rows whenever the archive knew
 * the account, so lite-only games (e.g. anything above the archive cap) disappeared.
 * Now the two are unioned per account, one entry per (game, instance_id):
 *   - only D1 rows for this membership_id are considered (D1/D2 stay separate);
 *   - when a game is in both, the archive row wins, but fields the archive lacks are
 *     filled from the lite row (completed when null, combat stats when the archive
 *     row is a stats-missing stub, and empty identity/metadata fields);
 *   - lite-only games are appended.
 * Several archive rows for the same game (different characters) are all kept and
 * left to the route's dedupe; lite rows for a game already in the archive are dropped.
 */
export interface D1UnionResult {
  activities: LeanActivity[];
  archiveRows: number;
  liteOnlyGames: number;
  overlapGames: number;
}

function isD1For(a: LeanActivity, membershipId: string): boolean {
  return a.game === 'D1' && String(a.membership_id) === String(membershipId) && !!a.instance_id;
}

function preferLite(arch: LeanActivity, lite: LeanActivity): LeanActivity {
  const out: LeanActivity = { ...arch };
  if (out.completed == null && lite.completed != null) out.completed = lite.completed;
  if (arch.stats_missing && !lite.stats_missing) {
    out.kills = lite.kills;
    out.deaths = lite.deaths;
    out.assists = lite.assists;
    out.duration_seconds = lite.duration_seconds;
    delete out.stats_missing;
  }
  if (!out.period && lite.period) out.period = lite.period;
  if (!out.activity_hash && lite.activity_hash) out.activity_hash = lite.activity_hash;
  if (!out.director_activity_hash && lite.director_activity_hash) out.director_activity_hash = lite.director_activity_hash;
  if (!out.mode && lite.mode) out.mode = lite.mode;
  if (!out.membership_type && lite.membership_type) out.membership_type = lite.membership_type;
  if (!out.display_name && lite.display_name) out.display_name = lite.display_name;
  if (!out.character_id && lite.character_id) out.character_id = lite.character_id;
  if (!out.standing && lite.standing) out.standing = lite.standing;
  if (!out.starting_phase_index && lite.starting_phase_index) out.starting_phase_index = lite.starting_phase_index;
  if (!out.fireteam_id && lite.fireteam_id) out.fireteam_id = lite.fireteam_id;
  return out;
}

/** Pick the lite row to borrow from when lite has several rows for one game. */
function liteRank(a: LeanActivity): number {
  return (a.completed != null ? 2 : 0) + (a.stats_missing ? 0 : 1);
}

export function unionD1History(
  membershipId: string,
  archive: readonly LeanActivity[],
  lite: readonly LeanActivity[],
  limit?: number
): D1UnionResult {
  const archRows = archive.filter(a => isD1For(a, membershipId));
  const liteByGame = new Map<string, LeanActivity>();
  for (const l of lite) {
    if (!isD1For(l, membershipId)) continue;
    const key = `D1|${l.instance_id}`;
    const prev = liteByGame.get(key);
    if (!prev || liteRank(l) > liteRank(prev)) liteByGame.set(key, l);
  }

  const archGames = new Set<string>();
  const merged: LeanActivity[] = [];
  for (const a of archRows) {
    const key = `D1|${a.instance_id}`;
    archGames.add(key);
    const l = liteByGame.get(key);
    merged.push(l ? preferLite(a, l) : a);
  }
  let overlapGames = 0;
  let liteOnlyGames = 0;
  for (const [key, l] of liteByGame) {
    if (archGames.has(key)) {
      overlapGames++;
      continue;
    }
    liteOnlyGames++;
    merged.push(l);
  }

  merged.sort((x, y) => String(y.period).localeCompare(String(x.period)));
  const activities = limit != null && limit >= 0 ? merged.slice(0, limit) : merged;
  return { activities, archiveRows: archRows.length, liteOnlyGames, overlapGames };
}
