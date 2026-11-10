/**
 * Solo / solo-flawless from a Bungie or pruned PGCR (CODE_CLEANUP_SPEC).
 * Empty membership ids must not be treated as "not solo" — fall through instead.
 */

export interface SoloFromPgcrResult {
  isSolo: boolean;
  isSoloFlawless: boolean;
  /** True when the PGCR had enough roster data to decide. */
  resolved: boolean;
}

function uniqueMembershipIds(ids: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const s = id != null ? String(id).trim() : '';
    if (s) out.add(s);
  }
  return [...out];
}

/**
 * Detect solo and solo-flawless from PGCR entries and/or pruned players.
 * Returns resolved:false when the report has no usable roster (caller may fall back
 * to activity-history playerCount — often missing on archive lean rows).
 */
export function soloFromPgcr(
  pgcr: { entries?: any[]; players?: Array<{ id?: string; deaths?: number }> } | null | undefined
): SoloFromPgcrResult {
  if (!pgcr) {
    return { isSolo: false, isSoloFlawless: false, resolved: false };
  }

  if (Array.isArray(pgcr.entries) && pgcr.entries.length > 0) {
    const ids = uniqueMembershipIds(
      pgcr.entries.map((e: any) => e?.player?.destinyUserInfo?.membershipId)
    );
    if (ids.length > 0) {
      const isSolo = ids.length === 1;
      if (!isSolo) {
        return { isSolo: false, isSoloFlawless: false, resolved: true };
      }
      const totalDeaths = pgcr.entries.reduce(
        (sum: number, e: any) => sum + (e?.values?.deaths?.basic?.value ?? 0),
        0
      );
      return { isSolo: true, isSoloFlawless: totalDeaths === 0, resolved: true };
    }
    // Entries present but ids stripped — try players before giving up.
  }

  if (Array.isArray(pgcr.players) && pgcr.players.length > 0) {
    const ids = uniqueMembershipIds(pgcr.players.map(p => p?.id));
    if (ids.length > 0) {
      const isSolo = ids.length === 1;
      if (!isSolo) {
        return { isSolo: false, isSoloFlawless: false, resolved: true };
      }
      const totalDeaths = pgcr.players.reduce((sum, p) => sum + (p?.deaths ?? 0), 0);
      return { isSolo: true, isSoloFlawless: totalDeaths === 0, resolved: true };
    }
  }

  return { isSolo: false, isSoloFlawless: false, resolved: false };
}

/** Fireteam flawless: every entry/player has 0 deaths (any fireteam size). */
export function flawlessFromPgcr(
  pgcr: { entries?: any[]; players?: Array<{ deaths?: number }> } | null | undefined
): boolean | null {
  if (!pgcr) return null;
  if (Array.isArray(pgcr.entries) && pgcr.entries.length > 0) {
    const totalDeaths = pgcr.entries.reduce(
      (sum: number, e: any) => sum + (e?.values?.deaths?.basic?.value ?? 0),
      0
    );
    return totalDeaths === 0;
  }
  if (Array.isArray(pgcr.players) && pgcr.players.length > 0) {
    const totalDeaths = pgcr.players.reduce((sum, p) => sum + (p?.deaths ?? 0), 0);
    return totalDeaths === 0;
  }
  return null;
}
