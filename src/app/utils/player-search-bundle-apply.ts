import {
  dedupePlayerSearchDisplay,
  type PlayerSearchBundle,
} from './player-search-results';
import type { PlayerSearchDisplay } from '../models/player-search-display.model';

export interface SearchResultListsHost {
  d1SearchResults: PlayerSearchDisplay[];
  d2SearchResults: PlayerSearchDisplay[];
  crossSavePlayer: PlayerSearchDisplay | null;
  showPlatformPicker: boolean;
}

export function resetSearchResultLists(host: SearchResultListsHost): void {
  host.d1SearchResults = [];
  host.d2SearchResults = [];
  host.crossSavePlayer = null;
  host.showPlatformPicker = false;
}

export function applySearchBundle(
  host: SearchResultListsHost,
  bundle: PlayerSearchBundle,
  mode: 'replace' | 'append'
): void {
  if (mode === 'replace') {
    host.d1SearchResults = bundle.d1;
    host.d2SearchResults = bundle.d2;
    host.crossSavePlayer = bundle.crossSave;
    return;
  }
  host.d1SearchResults = dedupePlayerSearchDisplay([
    ...host.d1SearchResults,
    ...bundle.d1,
  ]);
  host.d2SearchResults = dedupePlayerSearchDisplay([
    ...host.d2SearchResults,
    ...bundle.d2,
  ]);
  host.crossSavePlayer =
    host.d2SearchResults.find((p) => p.isCrossSavePrimary) || null;
}
