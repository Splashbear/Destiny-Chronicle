import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { PlatformStats } from '../models/platform-stats.model';

/**
 * Platforms with activity for a game, else all selected players for that game (CODE_CLEANUP_SPEC).
 */
export function getPlatformsForGame(input: {
  game: string;
  perPlatformStats: PlatformStats[] | null | undefined;
  selectedPlayers: PlayerSearchDisplay[];
  isD1Player(player: PlayerSearchDisplay): boolean;
  getPlatformName(membershipType: number): string;
}): string[] {
  const { game, perPlatformStats, selectedPlayers } = input;
  if (perPlatformStats?.length) {
    const list = perPlatformStats
      .filter(
        (s) =>
          s.game === game &&
          ((s.totalActivities ?? 0) > 0 || (s.totalTime ?? 0) > 0)
      )
      .map((s) => s.platform);
    if (list.length) {
      return Array.from(new Set(list));
    }
  }

  const platforms = new Set<string>();
  for (const player of selectedPlayers) {
    const isGameMatch =
      (game === 'D1' && input.isD1Player(player)) ||
      (game === 'D2' && !input.isD1Player(player));
    if (!isGameMatch) continue;
    platforms.add(input.getPlatformName(player.membershipType));
  }
  return Array.from(platforms);
}
