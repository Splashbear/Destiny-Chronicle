/**
 * GAME_FILTER_SPEC Phase 2.1 — which search hits have Destiny play time.
 * Prefer LinkedProfiles.dateLastPlayed / character presence; no history scans.
 */

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

export function linkedProfilePlayByMembership(
  profiles: LinkedProfilePlayCard[] | null | undefined
): Map<string, { dateLastPlayed?: string | null; isCrossSavePrimary?: boolean }> {
  const map = new Map<string, { dateLastPlayed?: string | null; isCrossSavePrimary?: boolean }>();
  if (!Array.isArray(profiles)) return map;
  for (const p of profiles) {
    if (!p?.membershipId) continue;
    const type = Number(p.membershipType);
    const key = `${Number.isFinite(type) ? type : 0}|${p.membershipId}`;
    map.set(key, {
      dateLastPlayed: p.dateLastPlayed,
      isCrossSavePrimary: p.isCrossSavePrimary,
    });
    // Also index by membershipId alone so D1/D2 mid collisions still match LinkedProfiles.
    if (!map.has(p.membershipId)) {
      map.set(p.membershipId, {
        dateLastPlayed: p.dateLastPlayed,
        isCrossSavePrimary: p.isCrossSavePrimary,
      });
    }
  }
  return map;
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
