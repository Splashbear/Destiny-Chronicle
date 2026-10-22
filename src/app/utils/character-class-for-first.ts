import { ActivityFirstCompletion } from '../models/guardian-firsts.model';
import { ActivityHistory } from '../models/activity-history.model';
import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { getCharacterId } from './character-profile';

const CLASS_NAMES: Record<number, string> = {
  0: 'Titan',
  1: 'Hunter',
  2: 'Warlock',
};

export function classNameFromType(classType: number): string {
  return CLASS_NAMES[classType] ?? 'Unknown';
}

/**
 * Resolve completing character class for first-ever / story milestone rows (CODE_CLEANUP_SPEC).
 */
export function resolveCharacterClassForFirst(
  first: ActivityFirstCompletion | ActivityHistory | null | undefined,
  deps: {
    selectedPlayers: PlayerSearchDisplay[];
    getPlayerKey(player: PlayerSearchDisplay): string;
    characters: Record<string, any[]>;
  }
): string | undefined {
  if (!first) return undefined;
  const direct = (first as ActivityHistory).characterClass;
  if (direct && direct !== 'Unknown') return direct;
  const charId =
    (first as ActivityFirstCompletion).characterId ?? (first as any).characterId;
  const membershipId =
    (first as ActivityFirstCompletion).membershipId ?? (first as any).membershipId;
  if (!charId) return undefined;
  for (const pl of deps.selectedPlayers) {
    if (membershipId && pl.membershipId !== membershipId) continue;
    const chars = deps.characters[deps.getPlayerKey(pl)] || [];
    const match = chars.find((c) => getCharacterId(c) === charId);
    if (match) {
      const classType = (match as any).classType;
      if (typeof classType === 'number') return classNameFromType(classType);
    }
  }
  return undefined;
}
