import { resolveGame } from './destiny-game';
export interface BreakdownIdentityPlayer {
  game?: string;
  membershipId?: string;
  bungieGlobalDisplayName?: string;
  bungieGlobalDisplayNameCode?: string | number;
  displayName?: string;
}

/**
 * Official Bungie unique name (`Name#code`). A bare display name with no
 * numeric code is not identity evidence and must not link memberships.
 */
export function officialBungieNameKey(player: BreakdownIdentityPlayer): string | null {
  const bungieName = (player.bungieGlobalDisplayName || '').trim();
  const code = player.bungieGlobalDisplayNameCode;
  if (bungieName && code != null && String(code).trim() !== '') {
    return `${bungieName.toLowerCase()}#${code}`;
  }
  const display = (player.displayName || '').trim();
  const match = display.match(/^(.*)#(\d+)$/);
  if (match && match[1].trim()) {
    return `${match[1].trim().toLowerCase()}#${match[2]}`;
  }
  return null;
}

/**
 * Linked D2 platforms of the same official Bungie name#code share an identity
 * so one PGCR stored under PlayStation, Steam, and Xbox is counted once.
 * D1 has no cross-save, so each membership stays distinct. Bare names do not link.
 */
export function breakdownAccountIdentity(player: BreakdownIdentityPlayer): string {
  const membershipId = player.membershipId || '';
  if (player.game === 'D1') {
    return `D1:${membershipId}`;
  }
  const official = officialBungieNameKey(player);
  if (official) return `D2:${official}`;
  return `D2:${membershipId}`;
}

export function breakdownIdentityByMembership(
  players: BreakdownIdentityPlayer[] | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const player of players || []) {
    if (!player.membershipId) continue;
    const next = breakdownAccountIdentity(player);
    const prev = map[player.membershipId];
    // Same Bungie mid can host D1 + D2; keep D2 so cross-save PGCRs still dedupe.
    if (prev?.startsWith('D2:') && next.startsWith('D1:')) continue;
    map[player.membershipId] = next;
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
  const game = resolveGame({ game: activity.game, instanceId: activity.activityDetails?.instanceId });
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
