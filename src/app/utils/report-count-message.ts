import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

/**
 * User-visible "X reports for username platform found. Done!" lines (CODE_CLEANUP_SPEC).
 */
export function buildReportCountMessage(
  activities: ActivityHistory[],
  selectedPlayers: PlayerSearchDisplay[],
  getPlatformName: (membershipType: number) => string
): string {
  const players = (selectedPlayers || []).filter(Boolean);
  if (players.length === 0) {
    const n = activities.length;
    return n === 0
      ? 'No reports found. Done!'
      : `${n} report${n === 1 ? '' : 's'} found. Done!`;
  }
  const countByMember = new Map<string, number>();
  for (const a of activities) {
    const mid = (a as any).membershipId as string | undefined;
    if (mid) {
      countByMember.set(mid, (countByMember.get(mid) ?? 0) + 1);
    }
  }
  const parts: string[] = [];
  for (const player of players) {
    const count = countByMember.get(player.membershipId) ?? 0;
    const platform = getPlatformName(player.membershipType);
    const name = player.displayName || 'Unknown';
    parts.push(
      `${count} report${count === 1 ? '' : 's'} for ${name} ${platform}`
    );
  }
  return parts.join('. ') + '. Done!';
}

/** One line for "Total number of reports for X is N". */
export function getReportSummaryLine(
  activities: ActivityHistory[],
  selectedPlayers: PlayerSearchDisplay[],
  getPlatformName: (membershipType: number) => string
): string {
  const players = (selectedPlayers || []).filter(Boolean);
  if (players.length === 0) return 'selected profiles';
  const countByMember = new Map<string, number>();
  for (const a of activities) {
    const mid = (a as any).membershipId as string | undefined;
    if (mid) countByMember.set(mid, (countByMember.get(mid) ?? 0) + 1);
  }
  const parts = players
    .filter((p) => (countByMember.get(p.membershipId) ?? 0) > 0)
    .map(
      (p) =>
        `${p.displayName || 'Unknown'} ${getPlatformName(p.membershipType)}`
    );
  return parts.length > 0 ? parts.join(', ') : 'selected profiles';
}
