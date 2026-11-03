/**
 * GAME_FILTER_SPEC Phase 2.1 — which search hits have Destiny play time.
 * Prefer LinkedProfiles.dateLastPlayed / character presence; no history scans.
 */
import { canonicalAccountKey } from './account-key';

export interface SearchPlaySignals {
  dateLastPlayed?: string | null;
  characterCount?: number | null;
  archiveGameCount?: number | null;
}

export interface LinkedProfilePlayCard {
  membershipType?: number;
  membershipId?: string;
  dateLastPlayed?: string | null;
  isCrossSavePrimary?: boolean;
  crossSaveOverride?: number;
}

/** Bungie sentinel / missing timestamps mean the platform was never played. */
export function isMeaningfulLastPlayed(dateLastPlayed?: string | null): boolean {
  if (!dateLastPlayed || typeof dateLastPlayed !== 'string') return false;
  const trimmed = dateLastPlayed.trim();
  if (!trimmed || trimmed.startsWith('0001-01-01')) return false;
  const t = Date.parse(trimmed);
  return Number.isFinite(t) && t > 0;
}

/**
 * True when the account clearly has Destiny play data.
 * False when characters are empty or last-played is missing/sentinel.
 * null when we do not have enough signal yet (do not grey out).
 */
export function accountHasGames(signals: SearchPlaySignals): boolean | null {
  if (typeof signals.characterCount === 'number') {
    if (signals.characterCount <= 0) return false;
    return true;
  }
  if (typeof signals.archiveGameCount === 'number') {
    if (signals.archiveGameCount <= 0) return false;
    return true;
  }
  if (signals.dateLastPlayed !== undefined && signals.dateLastPlayed !== null) {
    return isMeaningfulLastPlayed(signals.dateLastPlayed);
  }
  return null;
}

/**
 * Index Bungie LinkedProfiles (a Destiny 2 data source) by canonical account key.
 * Entries are D2 only: `D2|<type>|<id>`, plus a platform-agnostic `D2|0|<id>` fallback.
 * D1 accounts are intentionally never matched against this data (a D1 id can equal a D2 id).
 */
export function linkedProfilePlayByMembership(
  profiles: LinkedProfilePlayCard[] | null | undefined
): Map<string, { dateLastPlayed?: string | null; isCrossSavePrimary?: boolean }> {
  const map = new Map<string, { dateLastPlayed?: string | null; isCrossSavePrimary?: boolean }>();
  if (!Array.isArray(profiles)) return map;
  for (const p of profiles) {
    if (!p?.membershipId) continue;
    const entry = {
      dateLastPlayed: p.dateLastPlayed,
      isCrossSavePrimary: p.isCrossSavePrimary,
    };
    map.set(
      canonicalAccountKey({ game: 'D2', membershipType: p.membershipType, membershipId: p.membershipId }),
      entry
    );
    const anyPlatform = canonicalAccountKey({ game: 'D2', membershipType: 0, membershipId: p.membershipId });
    if (!map.has(anyPlatform)) map.set(anyPlatform, entry);
  }
  return map;
}

/** Look up a search hit in a `linkedProfilePlayByMembership` index. D1 hits never match. */
export function lookupLinkedProfilePlay(
  index: ReturnType<typeof linkedProfilePlayByMembership>,
  player: { game?: string; membershipType?: number | string; membershipId: string }
): { dateLastPlayed?: string | null; isCrossSavePrimary?: boolean } | undefined {
  if (player.game === 'D1') return undefined;
  return (
    index.get(canonicalAccountKey({ game: 'D2', membershipType: player.membershipType, membershipId: player.membershipId })) ||
    index.get(canonicalAccountKey({ game: 'D2', membershipType: 0, membershipId: player.membershipId }))
  );
}

export interface SearchAccountForSort {
  hasGames?: boolean | null;
  dateLastPlayed?: string | null;
  membershipId?: string;
}

/** Accounts with games first (newest last-played first); empty / unknown last. */
export function sortSearchAccountsByPlayActivity<T extends SearchAccountForSort>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => {
    const aHas = a.hasGames === true ? 0 : a.hasGames === false ? 2 : 1;
    const bHas = b.hasGames === true ? 0 : b.hasGames === false ? 2 : 1;
    if (aHas !== bHas) return aHas - bHas;
    const aT = isMeaningfulLastPlayed(a.dateLastPlayed) ? Date.parse(a.dateLastPlayed!) : 0;
    const bT = isMeaningfulLastPlayed(b.dateLastPlayed) ? Date.parse(b.dateLastPlayed!) : 0;
    if (aT !== bT) return bT - aT;
    return String(a.membershipId || '').localeCompare(String(b.membershipId || ''));
  });
}

export function formatSearchAccountMeta(opts: {
  game: 'D1' | 'D2' | string;
  platform: string;
  hasGames?: boolean | null;
  archiveGameCount?: number | null;
}): string {
  if (opts.hasGames === false) {
    return 'No games found';
  }
  const game = opts.game === 'D1' ? 'D1' : 'D2';
  if (typeof opts.archiveGameCount === 'number' && opts.archiveGameCount > 0) {
    return `${game} · ${opts.archiveGameCount.toLocaleString()} games`;
  }
  return `${game} · ${opts.platform}`;
}

/** Character count from a Destiny2 GetProfile (components 100/200) response. */
export function characterCountFromD2ProfileResponse(response: any): number | null {
  if (!response || response.ErrorCode !== 1 || !response.Response) return null;
  const ids = response.Response.profile?.data?.characterIds;
  if (Array.isArray(ids)) return ids.length;
  const data = response.Response.characters?.data;
  if (data && typeof data === 'object') return Object.keys(data).length;
  return 0;
}
