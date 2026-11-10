/**
 * Site deep link: `?a=<membershipType>-<membershipId>[-d1|-d2][,<more>]&tab=<tab>&d=<YYYY-MM-DD>`
 *
 * Accounts are keyed by platform (membershipType) + membershipId. The optional
 * `-d1` / `-d2` suffix pins the game (Discord cards always add it). Without it the
 * game comes from `gameFromMembership`: Steam/Epic/etc. are D2; Xbox/PSN are D1
 * unless Bungie's profile data corroborates cross-save D2 (see destiny-game.ts).
 *
 * Bad input never throws. `parseDeepLink` returns null so the caller shows the normal home page.
 */
import { DestinyGame, gameFromExplicit, gameFromMembership } from './destiny-game';
import { parsePermalinkDateParam } from './permalink-date-param';
import { getPlatformName } from './platform-name';

export type DeepLinkTab =
  | 'activities'
  | 'firsts'
  | 'titles'
  | 'accomplishments'
  | 'breakdown'
  | 'heatmap'
  | 'playedWith'
  | 'timeStory';

export interface DeepLinkAccount {
  membershipType: number;
  membershipId: string;
  /** Present only when the link pinned the game. Otherwise resolve with `resolveDeepLinkGame`. */
  game?: DestinyGame;
}

export interface DeepLink {
  accounts: DeepLinkAccount[];
  tab: DeepLinkTab;
  /** YYYY-MM-DD, validated. */
  date?: string;
}

export const DEEP_LINK_MAX_ACCOUNTS = 10;
const DESTINY_MEMBERSHIP_TYPES = new Set([1, 2, 3, 4, 5, 6]);

/** URL tab names (lower-case) -> site tab. `otd` is the activities tab on a date. */
const TAB_BY_NAME: Record<string, DeepLinkTab> = {
  otd: 'activities',
  activities: 'activities',
  seals: 'titles',
  titles: 'titles',
  firsts: 'firsts',
  heatmap: 'heatmap',
  playedwith: 'playedWith',
  breakdown: 'breakdown',
  accomplishments: 'accomplishments',
  timestory: 'timeStory',
  hours: 'timeStory',
  'time-story': 'timeStory',
};

export function parseDeepLinkTab(raw: unknown): DeepLinkTab {
  if (typeof raw !== 'string') return 'activities';
  return TAB_BY_NAME[raw.trim().toLowerCase()] ?? 'activities';
}

export function parseDeepLinkAccount(raw: string): DeepLinkAccount | null {
  const m = /^(\d{1,3})-(\d{1,20})(?:-(d1|d2))?$/i.exec(raw.trim());
  if (!m) return null;
  const membershipType = Number(m[1]);
  if (!DESTINY_MEMBERSHIP_TYPES.has(membershipType)) return null;
  const game = m[3] ? gameFromExplicit(m[3]) : null;
  const account: DeepLinkAccount = { membershipType, membershipId: m[2] };
  if (game) account.game = game;
  return account;
}

function one(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** Parse query params (Angular `queryParams` or a `URLSearchParams`-like record). null = not a usable deep link. */
export function parseDeepLink(params: Record<string, unknown> | null | undefined): DeepLink | null {
  const a = one(params?.['a']);
  if (!a) return null;
  const seen = new Set<string>();
  const accounts: DeepLinkAccount[] = [];
  for (const part of a.split(',')) {
    const account = parseDeepLinkAccount(part);
    if (!account) continue;
    const key = `${account.membershipType}-${account.membershipId}-${account.game ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push(account);
    if (accounts.length >= DEEP_LINK_MAX_ACCOUNTS) break;
  }
  if (accounts.length === 0) return null;
  const link: DeepLink = { accounts, tab: parseDeepLinkTab(one(params?.['tab'])) };
  const date = parsePermalinkDateParam(one(params?.['d']));
  if (date) link.date = date.date;
  return link;
}

/** Bungie profile fields that corroborate D2 (LinkedProfiles / GetMembershipsById rows). */
export interface DeepLinkProfileEvidence {
  crossSaveOverride?: unknown;
  applicableMembershipTypes?: ReadonlyArray<unknown> | null;
  bungieGlobalDisplayNameCode?: unknown;
}

/**
 * Game for one account. A pinned game wins; otherwise gameFromMembership, treating the
 * profile as D2 evidence only when it came from a D2 endpoint (`profile` supplied).
 */
export function resolveDeepLinkGame(
  account: DeepLinkAccount,
  profile?: DeepLinkProfileEvidence | null
): DestinyGame {
  if (account.game) return account.game;
  const verdict = gameFromMembership(
    account.membershipType,
    profile ? { ...profile, fromD2Endpoint: true } : undefined
  );
  return verdict ?? 'D2';
}

/** True when the game for this account can only be known by asking Bungie (Xbox/PSN without a pin). */
export function deepLinkNeedsProfile(account: DeepLinkAccount): boolean {
  return !account.game && (account.membershipType === 1 || account.membershipType === 2);
}

export interface DeepLinkPlayerPayload {
  displayName: string;
  membershipId: string;
  membershipType: number;
  game: DestinyGame;
  platform: string;
}

export function deepLinkPlayerPayload(
  account: DeepLinkAccount,
  game: DestinyGame,
  displayName?: string | null
): DeepLinkPlayerPayload {
  return {
    displayName: displayName || 'Guardian',
    membershipId: account.membershipId,
    membershipType: account.membershipType,
    game,
    platform: getPlatformName(account.membershipType),
  };
}

/** Build a deep link (used by the Discord cards). Always pins the game. */
export function buildDeepLinkUrl(
  base: string,
  opts: {
    accounts: Array<{ membershipType: number; membershipId: string; game: DestinyGame }>;
    tab?: string;
    date?: string;
  }
): string {
  const a = opts.accounts
    .map((x) => `${x.membershipType}-${x.membershipId}-${x.game.toLowerCase()}`)
    .join(',');
  const qs = new URLSearchParams({ a });
  if (opts.tab) qs.set('tab', opts.tab);
  if (opts.date) qs.set('d', opts.date);
  return `${base.replace(/\/+$/, '')}/?${qs.toString().replace(/%2C/g, ',')}`;
}
