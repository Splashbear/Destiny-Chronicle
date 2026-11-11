import { breakdownActivityDedupeKey } from './breakdown-account-identity';
import { ownPlayerTimePlayedSeconds } from './player-time-played-seconds';
import type { TimeStorySourceRow } from './time-story-source';

export type LinkedSourceReliability = 'player-time' | 'archive-duration' | 'unknown';

const RELIABILITY_RANK: Record<LinkedSourceReliability, number> = {
  'player-time': 2,
  'archive-duration': 1,
  unknown: 0,
};

export function linkedSourceReliability(row: TimeStorySourceRow): LinkedSourceReliability {
  if (ownPlayerTimePlayedSeconds(row) != null) return 'player-time';
  if (typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds) && row.durationSeconds > 0) {
    return 'archive-duration';
  }
  return 'unknown';
}

export function stableLinkedSourceKey(row: TimeStorySourceRow): string {
  return `${row.game || ''}|${row.membershipId || ''}|${row.characterId || ''}`;
}

/**
 * Pick one representation of the same linked participant in one report.
 * Prefer a verified player-time record over archive duration. If both have
 * proven player time, keep the longer participation (more complete record).
 * Archive-duration ties use a stable membership/character key, never
 * first-selected order, and never sum the duplicates.
 */
export function preferLinkedSourceRow(a: TimeStorySourceRow, b: TimeStorySourceRow): TimeStorySourceRow {
  const rankA = RELIABILITY_RANK[linkedSourceReliability(a)];
  const rankB = RELIABILITY_RANK[linkedSourceReliability(b)];
  if (rankA !== rankB) return rankA > rankB ? a : b;
  if (rankA === RELIABILITY_RANK['player-time']) {
    const timeA = ownPlayerTimePlayedSeconds(a) ?? 0;
    const timeB = ownPlayerTimePlayedSeconds(b) ?? 0;
    if (timeA !== timeB) return timeA > timeB ? a : b;
  }
  const keyCmp = stableLinkedSourceKey(a).localeCompare(stableLinkedSourceKey(b));
  if (keyCmp !== 0) return keyCmp < 0 ? a : b;
  return String(a.instanceId || '').localeCompare(String(b.instanceId || '')) <= 0 ? a : b;
}

function stubForDedupe(row: TimeStorySourceRow) {
  const hash = row.activityHash;
  return {
    membershipId: row.membershipId,
    game: row.game,
    period: row.period,
    activityDetails: {
      instanceId: row.instanceId,
      referenceId: hash != null && String(hash) !== '' ? String(hash) : undefined,
    },
  };
}

/** Collapse linked representations of the same game + participant. */
export function dedupeLinkedSourceRows(
  rows: TimeStorySourceRow[],
  identityByMembership?: Record<string, string>
): TimeStorySourceRow[] {
  const groups = new Map<string, TimeStorySourceRow>();
  const unmatched: TimeStorySourceRow[] = [];
  for (const row of rows) {
    const key = breakdownActivityDedupeKey(stubForDedupe(row), identityByMembership);
    if (!key) {
      unmatched.push(row);
      continue;
    }
    const prev = groups.get(key);
    groups.set(key, prev ? preferLinkedSourceRow(prev, row) : row);
  }
  return [...groups.values(), ...unmatched];
}
