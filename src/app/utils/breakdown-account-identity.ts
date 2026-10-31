export interface BreakdownIdentityPlayer {
  game?: string;
  membershipId?: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: string | number;
  displayName?: string;
}

/**
 * Linked D2 platforms of the same Bungie name share an identity so one PGCR
 * stored under PlayStation, Steam, and Xbox is counted once. D1 has no
 * cross-save, so each membership stays distinct.
 */
export function breakdownAccountIdentity(player: BreakdownIdentityPlayer): string {
  const membershipId = player.membershipId || '';
  if (player.game === 'D1') {
    return `D1:${membershipId}`;
  }
  const bungieName = (player.bungieGlobalDisplayName || '').trim();
  if (bungieName) {
    return `D2:${bungieName.toLowerCase()}#${player.bungieGlobalDisplayNameCode ?? ''}`;
  }
  const display = (player.displayName || '').trim();
  const hash = display.lastIndexOf('#');
  if (hash > 0) {
    return `D2:${display.slice(0, hash).toLowerCase()}#${display.slice(hash + 1)}`;
  }
  if (display) {
    return `D2:${display.toLowerCase()}#`;
  }
  return `D2:${membershipId}`;
}

export function breakdownIdentityByMembership(
  players: BreakdownIdentityPlayer[] | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const player of players || []) {
    if (!player.membershipId) continue;
    map[player.membershipId] = breakdownAccountIdentity(player);
  }
  return map;
}

/** One stored row of the same PGCR on linked platforms / characters. */
export function breakdownActivityDedupeKey(
  activity: {
    membershipId?: string;
    game?: string;
    period?: string;
    activityDetails?: { instanceId?: string | number; referenceId?: string | number };
  },
  identityByMembership?: Record<string, string> | null
): string | null {
  const membershipId = activity.membershipId || '';
  const identity = identityByMembership?.[membershipId] || membershipId;
  const game = activity.game || 'D2';
  const instanceId = activity.activityDetails?.instanceId;
  if (instanceId != null && String(instanceId) !== '') {
    return `${identity}|${game}|${instanceId}`;
  }
  const referenceId = activity.activityDetails?.referenceId;
  if (activity.period && referenceId != null && referenceId !== '') {
    return `${identity}|${game}|${activity.period}|${referenceId}`;
  }
  return null;
}
