/**
 * D1/D2 character profile helpers (extracted from player-search).
 * CODE_CLEANUP_SPEC — behavior identical.
 */

/**
 * Bungie D1 Account Summary often returns `characters` as an object map (like D2), not an array.
 * Normalizing avoids `.map is not a function` and ensures we iterate every character.
 */
export function normalizeD1ProfileCharacters(raw: unknown): any[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    return Object.values(raw as object);
  }
  return [];
}

/**
 * Character id for D1 (`characterBase.characterId`) or D2 (`characterId`).
 * Always string — D1 ids are 64-bit; never rely on JSON number precision.
 */
export function getCharacterId(char: any): string | undefined {
  const raw = char?.characterId ?? char?.characterBase?.characterId;
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  return String(raw);
}

/** Minutes played per character, handling D1 vs D2 profile shapes. */
export function getCharacterMinutesPlayed(char: any, game: 'D1' | 'D2'): number {
  if (!char) return 0;
  if (game === 'D1') {
    const base = char.characterBase || char;
    const raw = Number(base?.minutesPlayedTotal ?? base?.minutesPlayed ?? 0);
    return isNaN(raw) ? 0 : raw;
  }
  const raw = Number(char.minutesPlayedTotal ?? char.minutesPlayed ?? 0);
  return isNaN(raw) ? 0 : raw;
}
