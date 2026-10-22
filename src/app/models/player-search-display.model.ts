import { PlayerSearchResult } from '../core/data/bungie-api.service';

/** Search-result row shown in the platform picker / account list. */
export interface PlayerSearchDisplay extends PlayerSearchResult {
  game: 'D1' | 'D2';
  platform: string;
  iconPath?: string;
  isPrimary?: boolean;
  isPublic?: boolean;
  crossSaveOverride?: number;
}
