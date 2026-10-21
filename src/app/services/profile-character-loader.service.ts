import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService, PlayerSearchResult } from '../core/data/bungie-api.service';
import {
  normalizeD1ProfileCharacters,
  getCharacterId,
} from '../utils/character-profile';
import { ActivityHistoryCharacter } from './activity-history-loader.service';

/** Account load phase mirrored from player-search LoadingStatus. */
export type ProfileLoadPhase =
  | 'fetching-profile'
  | 'loading-characters'
  | 'fetching-activities'
  | 'organizing-pgcrs'
  | 'displaying-activities'
  | 'complete'
  | 'error';

/** Minimal player identity for profile → character → activity load. */
export interface ProfileLoadPlayer {
  displayName: string;
  membershipId: string;
  membershipType: number;
  game?: 'D1' | 'D2';
}

/**
 * Host UI / session callbacks for ProfileCharacterLoaderService.
 * PlayerSearchComponent implements this; the loader owns Bungie profile I/O.
 */
export interface ProfileCharacterLoadHost {
  getPlayerKey(player: { membershipId: string; game?: 'D1' | 'D2' }): string;
  isD1Player(player: PlayerSearchResult | ProfileLoadPlayer): boolean;
  getPlatformName(membershipType: number | undefined): string;
  setCharactersKeyLoading(key: string, loading: boolean): void;
  setCharactersKeyError(key: string, message: string): void;
  updateAccountLoadingStatus(
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    status: ProfileLoadPhase,
    message: string,
    progress?: number
  ): void;
  setPlayerCharacters(playerKey: string, characters: any[]): void;
  setSelectedCharacterId(playerKey: string, characterId: string): void;
  resetActivityCount(accountKey: string): void;
  reportActivityCountDelta(
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    delta: number,
    isDone: boolean
  ): void;
  noteBungieApiIssue(game: 'D1' | 'D2' | 'both', error: unknown): void;
  loadActivityHistoryForCharacter(character: ActivityHistoryCharacter): Promise<void>;
}

/**
 * Fetch profile, set characters, then load per-character activity history (CODE_CLEANUP_SPEC).
 * Extracted from PlayerSearchComponent.loadCharacterHistory — behavior identical.
 */
@Injectable({ providedIn: 'root' })
export class ProfileCharacterLoaderService {
  private readonly bungie = inject(BungieApiService);

  async loadCharacterHistory(
    host: ProfileCharacterLoadHost,
    player: PlayerSearchResult | ProfileLoadPlayer
  ): Promise<void> {
    console.log('loadCharacterHistory called', { player });
    const key = `characters-${host.getPlayerKey(player)}`;
    host.setCharactersKeyLoading(key, true);
    host.setCharactersKeyError(key, '');

    const accountKey = host.getPlayerKey(player);
    const isD1 = host.isD1Player(player);
    const game: 'D1' | 'D2' = isD1 ? 'D1' : 'D2';
    const platform = host.getPlatformName(player.membershipType);

    try {
      host.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        game,
        player.membershipType,
        'fetching-profile',
        `Fetching ${game} profile for ${player.displayName}...`
      );

      if (isD1) {
        const profile = await firstValueFrom(
          this.bungie.getD1Profile(player.membershipType, player.membershipId)
        );
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }

        host.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'loading-characters',
          `Loading ${game} characters for ${player.displayName}...`
        );

        const characters = normalizeD1ProfileCharacters(profile.Response.data?.characters);
        host.setPlayerCharacters(accountKey, characters);
        if (characters.length > 0) {
          host.setSelectedCharacterId(accountKey, getCharacterId(characters[0]) || '');
        }

        host.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'fetching-activities',
          `Fetching ${game} activities for ${player.displayName}...`
        );

        host.resetActivityCount(accountKey);

        const characterLoadPromises = characters.map(async (char) => {
          const charId = getCharacterId(char);
          if (!charId) return;
          return host.loadActivityHistoryForCharacter({
            characterId: charId,
            membershipType: player.membershipType,
            membershipId: player.membershipId,
            game: 'D1',
          });
        });

        await Promise.all(characterLoadPromises.filter(Boolean));

        host.reportActivityCountDelta(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          0,
          true
        );
      } else {
        const profile = await firstValueFrom(
          this.bungie.getProfile(player.membershipType, player.membershipId)
        );
        console.log('Profile fetch result:', profile);
        if (!profile || !profile.Response) {
          throw new Error('No profile data received');
        }

        host.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'loading-characters',
          `Loading ${game} characters for ${player.displayName}...`
        );

        const characters = Object.values(profile.Response.characters?.data || {}) as Array<{
          characterId: string;
        }>;
        host.setPlayerCharacters(accountKey, characters);
        if (characters.length > 0) {
          host.setSelectedCharacterId(accountKey, getCharacterId(characters[0]) || '');
        }

        host.updateAccountLoadingStatus(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          'fetching-activities',
          `Fetching ${game} activities for ${player.displayName}...`
        );

        host.resetActivityCount(accountKey);

        const characterLoadPromises = characters.map(async (char) => {
          const charId = getCharacterId(char);
          if (!charId) return;
          return host.loadActivityHistoryForCharacter({
            characterId: charId,
            membershipType: player.membershipType,
            membershipId: player.membershipId,
            game: 'D2',
          });
        });

        await Promise.all(characterLoadPromises.filter(Boolean));

        host.reportActivityCountDelta(
          accountKey,
          player.displayName,
          platform,
          game,
          player.membershipType,
          0,
          true
        );
      }

      host.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        game,
        player.membershipType,
        'organizing-pgcrs',
        `Organizing ${game} data for ${player.displayName}...`
      );
    } catch (error: any) {
      console.error('Error loading character history:', error);
      host.noteBungieApiIssue(game, error);

      host.updateAccountLoadingStatus(
        accountKey,
        player.displayName,
        platform,
        game,
        player.membershipType,
        'error',
        `Error loading ${game} data for ${player.displayName}`
      );

      if (error.status === 503 || /SystemDisabled|temporarily disabled/i.test(String(error?.message ?? ''))) {
        host.setCharactersKeyError(
          key,
          `${game} data is temporarily unavailable from Bungie. Please try again later.`
        );
      } else {
        host.setCharactersKeyError(key, 'Error loading character history');
      }
      if (error.status && error.status >= 500) {
        console.warn('[loadCharacterHistory] Ignoring server error for', player.membershipId);
        return;
      }
      throw error;
    } finally {
      host.setCharactersKeyLoading(key, false);
    }
  }
}
