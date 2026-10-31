export type SharePermalinkPlayer = {
  displayName: string;
  membershipId: string;
  membershipType: number;
  game: string;
  platform: string;
};

/**
 * Build /share?date=&players=&view= query URL for permalink state.
 */
export function buildSharePermalinkUrl(opts: {
  date?: string | null;
  players?: SharePermalinkPlayer[];
  textView?: boolean;
}): string {
  const queryParams = new URLSearchParams();
  if (opts.date) {
    queryParams.set('date', opts.date);
  }
  if (opts.players?.length) {
    const playerData = opts.players.map((player) => ({
      displayName: player.displayName,
      membershipId: player.membershipId,
      membershipType: player.membershipType,
      game: player.game,
      platform: player.platform,
    }));
    queryParams.set('players', encodeURIComponent(JSON.stringify(playerData)));
  }
  if (opts.textView) {
    queryParams.set('view', 'text');
  }
  const qs = queryParams.toString();
  // Empty selection → site root so refresh shows the search gate, not a stale /share restore.
  if (!qs) return '/';
  return `/share?${qs}`;
}
