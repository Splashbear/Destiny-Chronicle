import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { collectDisplayedRaidDungeonFirsts } from './displayed-raid-dungeon-firsts';
import type { FirstsVariantGroup } from './firsts-variant-grouping';

/**
 * Collect Firsts raid/dungeon/pantheon/Rite variant groups for selected players (CODE_CLEANUP_SPEC).
 */
export function collectDisplayedRaidDungeonFirstsForPlayers(
  selectedPlayers: PlayerSearchDisplay[],
  getVariants: (player: PlayerSearchDisplay) => FirstsVariantGroup[]
): ActivityFirstCompletion[] {
  const groups: FirstsVariantGroup[] = [];
  for (const player of selectedPlayers) {
    groups.push(...getVariants(player));
  }
  return collectDisplayedRaidDungeonFirsts(groups);
}
