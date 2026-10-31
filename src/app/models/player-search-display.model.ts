import { PlayerSearchResult } from '../core/data/bungie-api.service';

/** Search-result row shown in the platform picker / account list. */
export interface PlayerSearchDisplay extends PlayerSearchResult {
  game: 'D1' | 'D2';
  platform: string;
  iconPath?: string;
  isPrimary?: boolean;
  isPublic?: boolean;
  crossSaveOverride?: number;
  /** GAME_FILTER_SPEC 2.1 — LinkedProfiles / profile character signals. */
  dateLastPlayed?: string;
  characterCount?: number;
  archiveGameCount?: number;
  /** false = empty platform (dim); true = has play; undefined = unknown. */
  hasGames?: boolean;
}
