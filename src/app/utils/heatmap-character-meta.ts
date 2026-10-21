import { getCharacterId } from './character-profile';
import {
  characterKey,
  classFromProfileCharacter,
  HeatmapCharacterLookup,
} from './heatmap-filters';
import { PlayerSearchDisplay } from '../models/player-search-display.model';

export function buildHeatmapCharacterMeta(
  selectedPlayers: PlayerSearchDisplay[],
  charactersByKey: { [key: string]: any[] | undefined },
  getPlayerKey: (p: PlayerSearchDisplay) => string
): Record<string, HeatmapCharacterLookup> {
  const classes: Record<string, HeatmapCharacterLookup> = {};
  for (const player of selectedPlayers) {
    const chars = charactersByKey[getPlayerKey(player)] || [];
    for (const char of chars) {
      const characterId = getCharacterId(char);
      if (!characterId) continue;
      const className = classFromProfileCharacter(char);
      if (!className && !player.membershipType) continue;
      classes[
        characterKey({
          game: player.game as 'D1' | 'D2',
          membershipId: player.membershipId,
          characterId,
        })
      ] = {
        className,
        membershipType: player.membershipType,
        displayName: (player.displayName || '').split('#')[0].trim(),
      };
    }
  }
  return classes;
}

export function heatmapCharacterMetaCacheKey(
  classes: Record<string, HeatmapCharacterLookup>
): string {
  return Object.keys(classes)
    .sort()
    .map(
      key =>
        `${key}=${classes[key].className || ''}:${classes[key].membershipType || ''}:${classes[key].displayName || ''}`
    )
    .join('|');
}
