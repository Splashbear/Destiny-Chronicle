import { parseAccountKey } from './account-key';

export interface PlayedWithAccountChoice {
  id: string;
  label: string;
}

/**
 * Map header account-card keys onto a Played With dropdown membership id.
 * Empty keys = no card filter (leave the current dropdown alone).
 * Prefers the current id when it is still among the selected D2 cards.
 */
export function playedWithMembershipIdFromAccountKeys(
  accountKeys: readonly string[] | null | undefined,
  accounts: readonly PlayedWithAccountChoice[] | null | undefined,
  currentId: string | null | undefined
): string | null {
  if (!accountKeys?.length || !accounts?.length) {
    return null;
  }
  const selectedIds = new Set<string>();
  for (const key of accountKeys) {
    const parsed = parseAccountKey(key);
    if (parsed?.game === 'D2' && parsed.membershipId) {
      selectedIds.add(parsed.membershipId);
    }
  }
  if (!selectedIds.size) {
    return null;
  }
  const matching = accounts.filter(account => selectedIds.has(account.id));
  if (!matching.length) {
    return null;
  }
  if (currentId && matching.some(account => account.id === currentId)) {
    return currentId;
  }
  return matching[0].id;
}

/** Destiny 2 profiles for the Played With account menu. A Destiny 1-only membership is omitted; a shared id stays when a Destiny 2 profile is loaded. */
export function d2PlayedWithAccounts(
  players: readonly {
    membershipId?: string | null;
    game?: string | null;
    displayName?: string | null;
    platform?: string | null;
  }[] | null | undefined
): PlayedWithAccountChoice[] {
  const seen = new Set<string>();
  const accounts: PlayedWithAccountChoice[] = [];
  for (const player of players || []) {
    const id = String(player?.membershipId || '');
    if (player?.game !== 'D2' || !id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = (player.displayName || '').trim() || `Account …${id.slice(-4)}`;
    const platform = (player.platform || '').trim();
    accounts.push({ id, label: platform ? `${name} (${platform})` : name });
  }
  return accounts;
}

/** Membership ids Played With may request. */
export function d2PlayedWithMembershipIds(
  players: readonly { membershipId?: string | null; game?: string | null }[] | null | undefined
): string[] {
  return d2PlayedWithAccounts(players).map(account => account.id);
}
