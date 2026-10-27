/**
 * Client-only account search against favorites / Played With partners already in memory.
 * Bot decision 2026-10-26 option 1 — no archive API; mid hits still need LinkedProfiles before load.
 */

export type LocalAccountSearchSource = 'favorites' | 'played-with' | 'selected';

export interface LocalAccountCandidate {
  membershipId: string;
  displayName: string;
  membershipType?: number;
  game?: 'D1' | 'D2';
  platform?: string;
  source: LocalAccountSearchSource;
  /** ISO period when known (Played With lastPlayedTogether). */
  lastSeen?: string;
}

export const LOCAL_ACCOUNT_SEARCH_MIN_CHARS = 3;
export const LOCAL_ACCOUNT_SEARCH_MAX_RESULTS = 10;

/** Lowercase, strip accents, trim; drop bungie #code for comparison. */
export function normalizeLocalSearchName(raw: string): string {
  const withoutCode = String(raw ?? '').split('#')[0] ?? '';
  return withoutCode
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function sourceRank(source: LocalAccountSearchSource): number {
  if (source === 'favorites') return 0;
  if (source === 'selected') return 1;
  return 2;
}

/**
 * Prefix-match (and exact) against candidate display names.
 * Dedupes by membershipId, prefers favorites over selected over played-with.
 */
export function matchLocalAccounts(
  query: string,
  candidates: LocalAccountCandidate[],
  opts?: { minChars?: number; limit?: number },
): LocalAccountCandidate[] {
  const minChars = opts?.minChars ?? LOCAL_ACCOUNT_SEARCH_MIN_CHARS;
  const limit = opts?.limit ?? LOCAL_ACCOUNT_SEARCH_MAX_RESULTS;
  const q = normalizeLocalSearchName(query);
  if (q.length < minChars) return [];

  const best = new Map<string, LocalAccountCandidate>();
  for (const c of candidates) {
    if (!c?.membershipId || !c.displayName) continue;
    if (c.displayName === 'Private Guardian' || c.displayName === 'Guardian') continue;
    const name = normalizeLocalSearchName(c.displayName);
    if (!name || !(name === q || name.startsWith(q))) continue;
    const prev = best.get(c.membershipId);
    if (!prev || sourceRank(c.source) < sourceRank(prev.source)) {
      best.set(c.membershipId, c);
    }
  }

  return [...best.values()]
    .sort((a, b) => {
      const sr = sourceRank(a.source) - sourceRank(b.source);
      if (sr !== 0) return sr;
      return normalizeLocalSearchName(a.displayName).localeCompare(normalizeLocalSearchName(b.displayName));
    })
    .slice(0, limit);
}

export function localAccountMatchNote(c: LocalAccountCandidate): string {
  if (c.source === 'favorites') return 'From favorites';
  if (c.source === 'selected') return 'Already selected';
  if (c.lastSeen) {
    const day = c.lastSeen.slice(0, 10);
    return `Found in Played With, name as of ${day}`;
  }
  return 'Found in Played With';
}
