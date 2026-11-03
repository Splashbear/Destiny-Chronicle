/**
 * Single source of truth for "is this Destiny 1 or Destiny 2?".
 *
 * Callers pass whatever evidence they have; the first tier that yields a
 * verdict wins. The order is fixed and never uses a calendar cutoff on its
 * own (D1 is still live, so recent D1 dates are valid):
 *
 *  1. EXPLICIT   `game` field ('D1' | 'D2', case-insensitive). Set from which
 *                API produced the row, so it is always trusted when present.
 *  2. PGCR SHAPE The raw post-game carnage report body:
 *                  - D2 markers: `activityDetails.directorActivityHash` or an
 *                    `activityDetails.modes` array (D1 has neither).
 *                  - D1 markers: the Bungie D1 `{ data: … }` envelope, or the
 *                    legacy shape (entries present, no
 *                    `activityDetails.durationSeconds`).
 *                D2 markers are checked first. Indeterminate -> next tier.
 *  3. INSTANCE   Instance ids 1..D1_MAX_INSTANCE_ID are D1-only. The bound
 *                mirrors api-server `D1_MAX_INSTANCE_ID_B2` (D1 archive
 *                billions 1-2, Aug 2014 .. ~Mar 2015). D1 keeps producing
 *                ids above that bound (it is still active) and D2 started
 *                far above it, so an id ABOVE the bound is "no verdict",
 *                never "D2". Zero / non-numeric ids give no verdict.
 *  4. MEMBERSHIP D1 only ever existed on Xbox (1) and PlayStation (2).
 *                Any other membershipType (Steam 3, Stadia 5, Epic 6,
 *                BungieNext 254, ...) is D2. For types 1/2 the default is D1.
 *                Cross-save data (`crossSaveOverride` > 0, or a non-empty
 *                `applicableMembershipTypes`) only flips a 1/2 account to D2
 *                when the record is otherwise clearly D2 ("D2 corroboration"):
 *                  - it came from a D2 endpoint / Bungie profile
 *                    (`fromD2Endpoint: true`), or
 *                  - it carries the D2-only Bungie Name code
 *                    (`bungieGlobalDisplayNameCode`).
 *                Cross-save fields on their own never prove D2: a D1 account
 *                (e.g. a D1 PSN whose Bungie profile is cross-saved on Xbox)
 *                can still be echoed with them. `bungieGlobalDisplayName`
 *                (no code) / `isCrossSavePrimary` never change the verdict.
 *                A D2 instance id is NOT used as corroboration: D1 is still
 *                live and its ids also exceed D1_MAX_INSTANCE_ID.
 *  5. DEFAULT    `fallback` (default 'D2').
 */

export type DestinyGame = 'D1' | 'D2';

/** Mirrors api-server `D1_MAX_INSTANCE_ID_B2` (api-server/src/utils/d1-roots.ts). */
export const D1_MAX_INSTANCE_ID = 2_000_000_000;

export type GameEvidenceSource =
  | 'explicit'
  | 'pgcr-shape'
  | 'instance-id'
  | 'membership-type'
  | 'default';

export interface GameEvidence {
  game?: string | null;
  /** Raw (or D1-enveloped) PGCR body. */
  pgcr?: unknown;
  instanceId?: string | number | null;
  membershipType?: number | string | null;
  crossSaveOverride?: number | string | null;
  /** Bungie `applicableMembershipTypes` (cross-save). Same corroboration rule as crossSaveOverride. */
  applicableMembershipTypes?: ReadonlyArray<number | string> | null;
  /** D2-only Bungie Name code (`Name#1234`). Corroborates cross-save fields as D2. */
  bungieGlobalDisplayNameCode?: number | string | null;
  /** True when the record was fetched from a D2 endpoint / Bungie profile (GetMembershipsById, LinkedProfiles, GetProfile). */
  fromD2Endpoint?: boolean;
  /** Last-resort answer when nothing above has a verdict. Default 'D2'. */
  fallback?: DestinyGame;
}

export interface GameResolution {
  game: DestinyGame;
  source: GameEvidenceSource;
}

/** Tier 1. Accepts 'D1'/'D2' in any case; anything else is no verdict. */
export function gameFromExplicit(game: unknown): DestinyGame | null {
  if (typeof game !== 'string') return null;
  const g = game.trim().toUpperCase();
  return g === 'D1' ? 'D1' : g === 'D2' ? 'D2' : null;
}

function pgcrBody(pgcr: any): any {
  return pgcr && typeof pgcr === 'object' && pgcr.data && typeof pgcr.data === 'object'
    ? pgcr.data
    : pgcr;
}

/** Tier 2. */
export function gameFromPgcrShape(pgcr: unknown): DestinyGame | null {
  if (!pgcr || typeof pgcr !== 'object') return null;
  const body = pgcrBody(pgcr);
  const details = body?.activityDetails ?? {};
  if (details.directorActivityHash !== undefined || Array.isArray(details.modes)) {
    return 'D2';
  }
  if (body !== pgcr) return 'D1';
  if (details.durationSeconds === undefined && Array.isArray(body?.entries)) {
    return 'D1';
  }
  return null;
}

/** Tier 3. Only ever returns 'D1' (see header). */
export function gameFromInstanceId(instanceId: unknown): 'D1' | null {
  if (instanceId === null || instanceId === undefined || instanceId === '') return null;
  const n = Number(instanceId);
  return Number.isFinite(n) && n > 0 && n <= D1_MAX_INSTANCE_ID ? 'D1' : null;
}

export interface MembershipD2Evidence {
  crossSaveOverride?: unknown;
  applicableMembershipTypes?: ReadonlyArray<unknown> | null;
  bungieGlobalDisplayNameCode?: unknown;
  fromD2Endpoint?: boolean;
}

/** True when the record is otherwise clearly D2 (see header, tier 4). */
export function hasD2Corroboration(e: MembershipD2Evidence | null | undefined): boolean {
  if (!e) return false;
  if (e.fromD2Endpoint === true) return true;
  const code = e.bungieGlobalDisplayNameCode;
  if (code === null || code === undefined || code === '') return false;
  const n = Number(code);
  return Number.isFinite(n) ? n > 0 : String(code).trim().length > 0;
}

function hasCrossSaveFields(e: MembershipD2Evidence): boolean {
  const override = Number(e.crossSaveOverride ?? 0);
  if (Number.isFinite(override) && override > 0) return true;
  return Array.isArray(e.applicableMembershipTypes) && e.applicableMembershipTypes.length > 0;
}

/**
 * Tier 4. Always returns a verdict when a membershipType is known.
 * Xbox/PSN are D1 unless cross-save fields are corroborated as D2.
 */
export function gameFromMembership(
  membershipType: unknown,
  d2Evidence?: MembershipD2Evidence | null
): DestinyGame | null {
  if (membershipType === null || membershipType === undefined || membershipType === '') {
    return null;
  }
  const t = Number(membershipType);
  if (!Number.isFinite(t)) return null;
  if (t !== 1 && t !== 2) return 'D2';
  return d2Evidence && hasCrossSaveFields(d2Evidence) && hasD2Corroboration(d2Evidence) ? 'D2' : 'D1';
}

/** Run the fixed chain and report which tier decided. */
export function resolveGameDetailed(e: GameEvidence | null | undefined): GameResolution {
  const ev = e ?? {};
  const explicit = gameFromExplicit(ev.game);
  if (explicit) return { game: explicit, source: 'explicit' };

  const shape = gameFromPgcrShape(ev.pgcr);
  if (shape) return { game: shape, source: 'pgcr-shape' };

  const pgcrId = (pgcrBody(ev.pgcr) as any)?.activityDetails?.instanceId;
  const byId = gameFromInstanceId(ev.instanceId ?? pgcrId);
  if (byId) return { game: byId, source: 'instance-id' };

  const byMembership = gameFromMembership(ev.membershipType, ev);
  if (byMembership) return { game: byMembership, source: 'membership-type' };

  return { game: ev.fallback ?? 'D2', source: 'default' };
}

export function resolveGame(e: GameEvidence | null | undefined): DestinyGame {
  return resolveGameDetailed(e).game;
}

export function isD1(e: GameEvidence | null | undefined): boolean {
  return resolveGame(e) === 'D1';
}

/** `x === 'D1' ? 'D1' : 'D2'` replacement for values that are already a game label. */
export function normalizeGame(game: unknown): DestinyGame {
  return gameFromExplicit(game) ?? 'D2';
}
