/**
 * Canonical account key: `game|membershipType|membershipId` (e.g. `D2|3|4611686018467...`).
 *
 * One shape everywhere, so a D1 and a D2 account with the same membershipId (or the same
 * membershipId on different platforms) can never share a cache entry, selection, or map slot.
 * It is also the shape already persisted in the archive manifest and the titles snapshot, so
 * those stored files did not change.
 *
 * Legacy shapes that older builds wrote or compared against (see `legacyAccountKeys`):
 *   `game|membershipId`, `game:membershipId`, `game-platformName-membershipId`,
 *   `membershipId|game|membershipType` (favorites), `membershipType|membershipId` (no game).
 * Only the first four name a game. A key with no game cannot be assigned to D1 or D2, so it is
 * never used as a fallback hit: callers re-fetch instead of guessing.
 */

export type AccountGame = 'D1' | 'D2';

export interface AccountIdentity {
  game?: string;
  membershipType?: number | string | null;
  membershipId?: string | number | null;
}

export interface ParsedAccountKey {
  game: AccountGame;
  membershipType: number;
  membershipId: string;
}

import { normalizeGame as normalizeDestinyGame } from './destiny-game';

const SEP = '|';

function normalizeGame(game: string | undefined | null): AccountGame {
  return normalizeDestinyGame(game);
}

function normalizeType(type: AccountIdentity['membershipType']): number {
  const n = Number(type ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** The canonical key. Missing game means D2 (matches the rest of the app); missing type is 0. */
export function canonicalAccountKey(identity: AccountIdentity): string {
  return [
    normalizeGame(identity.game),
    normalizeType(identity.membershipType),
    String(identity.membershipId ?? ''),
  ].join(SEP);
}

/**
 * Documented entry point for account/card keys. Kept for existing callers: the platform-name
 * callback is no longer part of the key (the numeric membershipType is) and is ignored.
 */
export function buildAccountKey(
  input: AccountIdentity & { getPlatformName?(membershipType: number): string }
): string {
  return canonicalAccountKey(input);
}

/** Parse a canonical key; returns null for any other shape (including legacy keys). */
export function parseAccountKey(key: string | null | undefined): ParsedAccountKey | null {
  if (!key) return null;
  const m = /^(D1|D2)\|(\d+)\|(.+)$/.exec(key);
  if (!m) return null;
  return { game: m[1] as AccountGame, membershipType: Number(m[2]), membershipId: m[3] };
}

export function isCanonicalAccountKey(key: string | null | undefined): boolean {
  return parseAccountKey(key) !== null;
}

/**
 * Older keys for this account that still name the game, newest-first. Use as a read fallback
 * for data written by earlier builds. Game-less shapes are deliberately not returned.
 */
export function legacyAccountKeys(
  identity: AccountIdentity,
  getPlatformName?: (membershipType: number) => string
): string[] {
  const game = normalizeGame(identity.game);
  const type = normalizeType(identity.membershipType);
  const id = String(identity.membershipId ?? '');
  const keys = [`${game}${SEP}${id}`, `${game}:${id}`, `${id}${SEP}${game}${SEP}${type}`];
  if (getPlatformName) {
    keys.push(`${game}-${getPlatformName(type)}-${id}`);
  }
  return keys;
}

/** Read `identity` from a record/map: canonical key first, then game-qualified legacy keys. */
export function lookupByAccount<T>(
  store: Map<string, T> | Record<string, T> | null | undefined,
  identity: AccountIdentity,
  getPlatformName?: (membershipType: number) => string
): T | undefined {
  if (!store) return undefined;
  const get = (k: string): T | undefined =>
    store instanceof Map ? store.get(k) : Object.prototype.hasOwnProperty.call(store, k) ? store[k] : undefined;
  const hit = get(canonicalAccountKey(identity));
  if (hit !== undefined) return hit;
  for (const legacy of legacyAccountKeys(identity, getPlatformName)) {
    const v = get(legacy);
    if (v !== undefined) return v;
  }
  return undefined;
}
