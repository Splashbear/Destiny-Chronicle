import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from '../core/data/bungie-api.service';
import { ActivityHistory } from '../models/activity-history.model';
import { environment } from '../../environments/environment';
import { PGCRCacheService } from './pgcr-cache.service';
import { pgcrPeriodMatches, pgcrPeriodMatchesForD1, resolvePgcrPeriod } from '../utils/pgcr-prune';

/** Minimal character identity for PGCR membership matching. */
export interface PgcrBatchCharacter {
  membershipId: string;
  characterId: string;
  membershipType: number;
  game?: 'D1' | 'D2';
}

interface PgcrEntryLike {
  characterId?: string;
  player?: {
    characterClass?: string;
    destinyUserInfo?: {
      membershipId?: string;
      membershipType?: number;
      displayName?: string;
    };
  };
}

/**
 * Validate a slice of activity history against PGCR cache / Bungie (CODE_CLEANUP_SPEC).
 * Extracted from PlayerSearchComponent.validatePGCRBatch — behavior identical.
 */
@Injectable({ providedIn: 'root' })
export class ActivityPgcrBatchService {
  private readonly pgcrCache = inject(PGCRCacheService);
  private readonly bungie = inject(BungieApiService);

  async validateBatch(
    activities: ActivityHistory[],
    character: PgcrBatchCharacter,
    startIdx: number,
    batchSize: number,
    platformName?: (membershipType: number) => string
  ): Promise<ActivityHistory[]> {
    const batch = activities.slice(startIdx, startIdx + batchSize);
    const validatedActivities: ActivityHistory[] = [];
    const nameOf = platformName ?? ((mt: number) => String(mt));

    if (environment.debug) {
      console.log(`[DEBUG] Looking for character in PGCRs:`, {
        membershipId: character.membershipId,
        characterId: character.characterId,
        game: character.game,
        membershipType: character.membershipType,
        platform: nameOf(character.membershipType),
      });
    }

    const pgcrPromises = batch
      .map((activity) => {
        const instanceId = activity.activityDetails?.instanceId;
        if (!instanceId) {
          if (environment.debug) {
            console.warn('[DEBUG] Activity missing instanceId:', activity);
          }
          return null;
        }

        return {
          promise: (async () => {
            const cached =
              character.game === 'D1'
                ? await this.pgcrCache.getD1PGCR(instanceId, activity.period)
                : await this.pgcrCache.getD2PGCR(instanceId);

            if (cached) {
              return cached as any;
            }

            const fetched = await firstValueFrom(
              this.bungie.getPGCR(instanceId, character.game === 'D1')
            );

            if (character.game === 'D1') {
              await this.pgcrCache.cacheD1PGCR(
                instanceId,
                fetched,
                character.membershipId,
                activity.period
              );
            } else {
              await this.pgcrCache.cacheD2PGCR(instanceId, fetched);
            }

            return fetched;
          })(),
          activity,
          instanceId,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const results = await Promise.allSettled(pgcrPromises.map((p) => p.promise));

    results.forEach((result, index) => {
      const { activity, instanceId } = pgcrPromises[index];

      if (result.status === 'fulfilled' && result.value) {
        const pgcr = result.value;

        const hasEntries = Array.isArray(pgcr.entries) && pgcr.entries.length > 0;
        const hasPrunedPlayers = Array.isArray(pgcr.players) && pgcr.players.length > 0;
        if (!hasEntries && !hasPrunedPlayers) {
          if (environment.debug) {
            console.warn(
              `[DEBUG] PGCR ${instanceId} has no entries (undefined or empty). Marking as unavailable.`
            );
          }
          validatedActivities.push({
            ...activity,
            pgcrUnavailable: true,
          });
          return;
        }

        const pgcrPeriod = resolvePgcrPeriod(pgcr);
        const periodMatches =
          character.game === 'D1'
            ? pgcrPeriodMatchesForD1(activity.period, pgcrPeriod)
            : pgcrPeriodMatches(activity.period, pgcrPeriod);
        if (activity.period && !periodMatches) {
          validatedActivities.push({
            ...activity,
            pgcrUnavailable: true,
          });
          return;
        }
        if (environment.debug) {
          console.log(`[DEBUG] Processing PGCR ${instanceId}:`, {
            entries: pgcr.entries.map((e: PgcrEntryLike) => ({
              membershipId: e.player?.destinyUserInfo?.membershipId,
              characterId: e.characterId,
              displayName: e.player?.destinyUserInfo?.displayName,
              membershipType: e.player?.destinyUserInfo?.membershipType,
              platform: nameOf(e.player?.destinyUserInfo?.membershipType ?? 0),
            })),
          });
        }

        const playerInPgcr = hasPrunedPlayers
          ? pgcr.players.some(
              (p: { id?: string }) => String(p.id) === String(character.membershipId)
            )
          : pgcr.entries.some((entry: PgcrEntryLike) => {
              return entry.player?.destinyUserInfo?.membershipId === character.membershipId;
            });

        if (playerInPgcr) {
          if (environment.debug) {
            console.log(
              `[DEBUG] Successfully validated activity ${instanceId} for player ${character.membershipId}`
            );
          }
          validatedActivities.push({
            ...activity,
            validated: true,
            validatedAt: new Date().toISOString(),
            characterClass: hasPrunedPlayers
              ? pgcr.players.find(
                  (p: { id?: string; class?: string }) =>
                    String(p.id) === String(character.membershipId)
                )?.class
              : pgcr.entries.find(
                  (entry: PgcrEntryLike) =>
                    (entry.player?.destinyUserInfo?.membershipId === character.membershipId &&
                      entry.characterId === character.characterId) ||
                    entry.player?.destinyUserInfo?.membershipId === character.membershipId ||
                    entry.characterId === character.characterId ||
                    (entry.player?.destinyUserInfo?.membershipType === character.membershipType &&
                      entry.player?.destinyUserInfo?.membershipId === character.membershipId)
                )?.player?.characterClass || activity.characterClass,
          });
        } else if (environment.debug) {
          console.warn(
            `[DEBUG] Player ${character.membershipId} not found in PGCR ${instanceId}`
          );
        }
      } else {
        const error = result.status === 'rejected' ? result.reason : 'Unknown error';
        if (environment.debug) {
          console.warn(`[DEBUG] Failed to fetch PGCR ${instanceId}:`, error);
        }
        if (environment.debug && character.game === 'D1' && error?.status === 500) {
          console.log(
            `[DEBUG] Attempting to fetch D1 activity ${instanceId} using D2 endpoint`
          );
        }
      }
    });

    return validatedActivities;
  }
}
