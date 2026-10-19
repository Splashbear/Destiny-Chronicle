export interface PlayedWithAccountChoice {
  id: string;
  label: string;
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
