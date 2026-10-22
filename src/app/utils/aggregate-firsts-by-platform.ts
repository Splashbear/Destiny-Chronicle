import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';

/** Earliest first completion per name for players on one platform. */
export function earliestFirstsForPlatformPlayers(
  players: Array<{ platform: string }>,
  platform: string,
  getFirsts: (player: { platform: string }) => ActivityFirstCompletion[]
): ActivityFirstCompletion[] {
  const seen = new Map<string, ActivityFirstCompletion>();
  for (const player of players) {
    if (player.platform !== platform) continue;
    for (const f of getFirsts(player)) {
      const existing = seen.get(f.name);
      if (!existing || new Date(f.completionDate) < new Date(existing.completionDate)) {
        seen.set(f.name, f);
      }
    }
  }
  return Array.from(seen.values());
}

/** Earliest first-ever activity among players on one platform matching game. */
export function earliestFirstEverForPlatformPlayers<TPlayer extends { platform: string }>(
  players: TPlayer[],
  platform: string,
  matchesGame: (player: TPlayer) => boolean,
  getFirstEver: (player: TPlayer) => ActivityHistory | undefined
): ActivityHistory | undefined {
  let earliest: ActivityHistory | undefined;
  for (const player of players) {
    if (player.platform !== platform) continue;
    if (!matchesGame(player)) continue;
    const first = getFirstEver(player);
    if (first && (!earliest || new Date(first.period) < new Date(earliest.period))) {
      earliest = first;
    }
  }
  return earliest;
}
