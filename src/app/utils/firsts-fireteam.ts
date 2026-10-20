import { resolvePgcrPlayerName } from './pgcr-player-name';

/** Short name for Firsts cards: Bungie name without #code, else platform display name. */
export function shortFireteamName(destinyUserInfo: {
  displayName?: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: number | string;
} | null | undefined): string {
  const global = destinyUserInfo?.bungieGlobalDisplayName?.trim();
  if (global) return global;
  const full = resolvePgcrPlayerName(destinyUserInfo);
  if (!full || full === 'Guardian') return '';
  const hash = full.indexOf('#');
  return hash > 0 ? full.slice(0, hash) : full;
}

/** Unique fireteam names in PGCR entry order. Skips blank / Guardian placeholders. */
export function fireteamNamesFromPgcr(pgcr: { entries?: any[]; players?: Array<{ id?: string; name?: string }> } | null | undefined): string[] {
  if (!pgcr) return [];
  const seen = new Set<string>();
  const names: string[] = [];

  if (Array.isArray(pgcr.entries) && pgcr.entries.length) {
    for (const e of pgcr.entries) {
      const id = String(e?.player?.destinyUserInfo?.membershipId || e?.characterId || '');
      const name = shortFireteamName(e?.player?.destinyUserInfo);
      if (!name) continue;
      const key = id || name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  }

  if (Array.isArray(pgcr.players) && pgcr.players.length) {
    for (const p of pgcr.players) {
      const id = String(p?.id || '');
      const raw = String(p?.name || '').trim();
      if (!raw || raw === 'Guardian') continue;
      const name = raw.includes('#') ? raw.slice(0, raw.indexOf('#')) : raw;
      const key = id || name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}
