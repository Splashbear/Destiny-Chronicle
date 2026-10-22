import { PlayerSearchDisplay } from '../models/player-search-display.model';
import { d2PlayedWithAccounts, PlayedWithAccountChoice } from './played-with-accounts';
import {
  buildHeatmapCharacterMeta,
  heatmapCharacterMetaCacheKey,
} from './heatmap-character-meta';
import { HeatmapCharacterLookup } from './heatmap-filters';

/** Cached D2 Played With account choices (CODE_CLEANUP_SPEC). */
export function getCachedPlayedWithAccounts(
  selectedPlayers: PlayerSearchDisplay[],
  cache: { key: string; value: PlayedWithAccountChoice[] }
): PlayedWithAccountChoice[] {
  const accounts = d2PlayedWithAccounts(selectedPlayers);
  const key = accounts.map((a) => `${a.id}\t${a.label}`).join('\n');
  if (key === cache.key) return cache.value;
  cache.key = key;
  cache.value = accounts;
  return accounts;
}

/** Cached membership IDs for heatmap (CODE_CLEANUP_SPEC). */
export function getCachedHeatmapMembershipIds(
  selectedPlayers: PlayerSearchDisplay[],
  cache: { key: string; value: string[] }
): string[] {
  const ids = selectedPlayers.map((p) => p.membershipId);
  const key = ids.join('\n');
  if (key === cache.key) return cache.value;
  cache.key = key;
  cache.value = ids;
  return ids;
}

/** Cached character meta for heatmap (CODE_CLEANUP_SPEC). */
export function getCachedHeatmapCharacterMeta(
  selectedPlayers: PlayerSearchDisplay[],
  characters: { [key: string]: any[] },
  getPlayerKey: (p: PlayerSearchDisplay) => string,
  cache: { key: string; value: Record<string, HeatmapCharacterLookup> }
): Record<string, HeatmapCharacterLookup> {
  const classes = buildHeatmapCharacterMeta(selectedPlayers, characters, getPlayerKey);
  const cacheKey = heatmapCharacterMetaCacheKey(classes);
  if (cacheKey === cache.key) return cache.value;
  cache.key = cacheKey;
  cache.value = classes;
  return classes;
}
