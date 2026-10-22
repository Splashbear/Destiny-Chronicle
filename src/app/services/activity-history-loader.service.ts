import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BungieApiService } from '../core/data/bungie-api.service';
import { DestinyManifestService } from '../core/data/manifest.service';
import { PgcrApiService, PlayerActivitiesCoverage, PlayerActivitiesResponse } from '../core/data/archive-api.service';
import { ActivityHistory, Character } from '../models/activity-history.model';
import { ActivityDbService, StoredActivity } from './activity-db.service';
import { environment } from '../../environments/environment';
import { convertLightActivityToHistory } from '../utils/activity-history-normalize';
import { D1_HISTORY_MODES, dedupeByInstanceId, isSocialActivity } from '../utils/activity-history-filters';
import { excludeExistingInstances } from '../utils/activity-dedupe';
import { partitionAgainstStored } from '../utils/archive-stub-merge';
import { partitionD1AgainstStored, d1BungiePageCaughtUp, d1RowsToIngest } from '../utils/d1-archive-merge';
import { d1ArchiveRowsForCharacter } from '../utils/d1-archive-character-rows';

/** Character identity for activity-history load (CODE_CLEANUP_SPEC). */
export type ActivityHistoryCharacter = Character & {
  game?: 'D1' | 'D2';
  mode?: number;
  membershipType: number;
  membershipId: string;
};

/** Account context returned when a tracked account starts fetching. */
export interface ActivityHistoryLoadAccountCtx {
  accountKey: string;
  displayName: string;
  platform: string;
}

/**
 * Host UI / session callbacks for ActivityHistoryLoaderService.
 * PlayerSearchComponent implements this; the loader owns Bungie/archive/IDB I/O.
 */
export interface ActivityHistoryLoadHost {
  setCharacterActivityLoading(loadingKey: string, loading: boolean): void;
  setCharacterActivityError(loadingKey: string, message: string): void;
  beginCharacterActivityFetch(character: ActivityHistoryCharacter): ActivityHistoryLoadAccountCtx | undefined;
  reportActivityCountDelta(
    ctx: ActivityHistoryLoadAccountCtx,
    game: 'D1' | 'D2',
    membershipType: number,
    delta: number,
    isDone: boolean
  ): void;
  noteActivitiesStored(): void;
  invalidateMembershipActivitiesCache(membershipId: string): void;
  addOverallActivitiesProcessed(count: number): void;
  noteLookupDataSource(source: 'archive' | 'bungie'): void;
  noteArchiveCoverage(cov: PlayerActivitiesCoverage): void;
  noteDcApiFallback(): void;
  clearDcApiFallbackNotice(): void;
  hasDcApiFallbackNotice(): boolean;
  processAndGroupActivities(): void;
  noteBungieApiIssue(game: 'D1' | 'D2' | 'both', error: unknown): void;
  refreshFilteredViewIfNeeded(newActivities: StoredActivity[]): void;
  tryShowInitialDisplay(activities: StoredActivity[]): void;
}

/**
 * Load per-character activity history from archive + Bungie (CODE_CLEANUP_SPEC).
 * Extracted from PlayerSearchComponent.loadActivityHistoryForCharacter — behavior identical.
 */
@Injectable({ providedIn: 'root' })
export class ActivityHistoryLoaderService {
  private readonly activityDb = inject(ActivityDbService);
  private readonly bungie = inject(BungieApiService);
  private readonly archiveApi = inject(PgcrApiService);
  private readonly manifest = inject(DestinyManifestService);

  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;
  private readonly d1ArchiveTimeoutMs = 20000;

  private async fetchActivitiesWithRetry(
    host: ActivityHistoryLoadHost,
    character: ActivityHistoryCharacter,
    page: number,
    maxRetries: number = this.maxRetries,
    keepKnownD1Rows = false
  ): Promise<ActivityHistory[]> {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        if (character.game === 'D1') {
          const response = await firstValueFrom(
            this.bungie.getD1ActivityHistory(
              character.membershipType,
              character.membershipId,
              character.characterId,
              character.mode || 0,
              page
            )
          );
          
          // Validate D1 response structure
          if (!response?.data?.activities) {
            if (environment.debug) {
              console.warn('[DEBUG] Invalid D1 activity response structure:', response);
            }
            return [];
          }

          // D1: same persistence rule as D2 — Bungie must supply activityDetails.instanceId.
          const validStructureActivities = response.data.activities.filter((activity: ActivityHistory) => {
            const inst = activity.activityDetails?.instanceId;
            if (!activity.period || inst == null || String(inst).trim() === '' || String(inst).trim() === '0') {
              if (environment.debug) {
                console.warn('[DEBUG] D1 activity missing period or instanceId:', activity);
              }
              return false;
            }
            const ref =
              activity.activityDetails?.referenceId ??
              (activity as any).referenceId ??
              (activity as any).activityHash;
            if (ref == null || String(ref).trim() === '') {
              if (environment.debug) {
                console.warn('[DEBUG] D1 activity missing referenceId:', activity);
              }
              return false;
            }
            return true;
          });

          // Flag-off keeps the old skip: an instance already stored is not returned.
          // Flag-on must still see those rows so a zero-stat archive stub can take
          // live kills and duration, and so a full page of stubs is not the end.
          let toValidate = validStructureActivities;
          if (!keepKnownD1Rows) {
            const dbActivities = await this.activityDb.getAllActivitiesForCharacter(
              character.membershipId,
              character.characterId
            );
            const dbInstanceIds = new Set(dbActivities.map(a => a.activityDetails?.instanceId));
            toValidate = validStructureActivities.filter((a: ActivityHistory) => !dbInstanceIds.has(a.activityDetails?.instanceId));
          }

          // Log raid activities
          const raidActivities = toValidate.filter((activity: ActivityHistory) => {
            const mode = activity.activityDetails?.mode;
            return mode === 3; // Raid mode
          });
          // console.log('[DEBUG] D1 Raid activities found:', {
          //   total: toValidate.length,
          //   raids: raidActivities.length,
          //   raidActivities: raidActivities.map((a: ActivityHistory) => ({
          //     period: a.period,
          //     mode: a.activityDetails?.mode,
          //     instanceId: a.activityDetails?.instanceId,
          //     completed: a.values?.completed?.basic?.value
          //   }))
          // });

          return toValidate;
        } else {
          const response = await firstValueFrom(
            // Correct parameter order: mode first, then page index
            this.bungie.getActivityHistory(
              character.membershipType,
              character.membershipId,
              character.characterId,
              character.mode,   // mode parameter (optional)
              page              // page index for pagination
            )
          );

          // Validate D2 response structure
          if (!response?.Response?.activities) {
            // console.warn('[DEBUG] Invalid D2 activity response structure:', response);
            return [];
          }

          // For D2, we trust the API to return correct activities
          const validActivities = response.Response.activities.filter((activity: ActivityHistory) => {
            if (!activity.period || !activity.activityDetails?.instanceId) {
              if (environment.debug) {
                console.warn('[DEBUG] D2 activity missing required fields:', activity);
              }
              return false;
            }
            return true;
          });

          // Log raid activities
          const raidActivities = validActivities.filter((activity: ActivityHistory) => {
            const mode = activity.activityDetails?.mode;
            return mode === 4; // Raid mode
          });
          // console.log('[DEBUG] D2 Raid activities found:', {
          //   total: validActivities.length,
          //   raids: raidActivities.length,
          //   raidActivities: raidActivities.map((a: ActivityHistory) => ({
          //     period: a.period,
          //     mode: a.activityDetails?.mode,
          //     referenceId: a.activityDetails?.referenceId,
          //     instanceId: a.activityDetails?.instanceId,
          //     completed: a.values?.completed?.basic?.value
          //   }))
          // });

          return validActivities;
        }
      } catch (error) {
        console.error(`Activity fetch error (attempt ${retries + 1}/${maxRetries}):`, error);
        retries++;
        if (retries === maxRetries) {
          host.noteBungieApiIssue(character.game === 'D1' ? 'D1' : 'D2', error);
          throw error;
        }
        // Exponential backoff on retry - setTimeout is acceptable here because:
        // 1) This is error recovery (rare), not the hot path
        // 2) Even if throttled in hidden tabs, retries will eventually execute
        // 3) The actual loading continues via other characters/requests
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * retries));
      }
    }
    return [];
  }


  /** Archive read must not hang a D1 load. Past this, the Bungie-only path runs. */
  private fetchD1ArchiveActivities(membershipId: string): Promise<PlayerActivitiesResponse | null> {
    const request = this.archiveApi.fetchPlayerActivities(membershipId, {
      game: 'D1',
      limit: 100000
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('D1 archive timeout')), this.d1ArchiveTimeoutMs);
      request.then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }


  async loadForCharacter(host: ActivityHistoryLoadHost, character: ActivityHistoryCharacter): Promise<void> {
    const loadingKey = `${character.membershipId}-${character.characterId}`;
    host.setCharacterActivityLoading(loadingKey, true);
    
    const accountCtx = host.beginCharacterActivityFetch(character);
    const accountKey = accountCtx?.accountKey;
    const existingStatus = accountCtx;
    
    try {
      const dbActivities = await this.activityDb.getAllActivitiesForCharacter(
        character.membershipId,
        character.characterId
      );

      let newActivities: StoredActivity[] = [];
      // W31: D2 catch-up stops at the archive-complete line (10B), not the
      // player's newest archived instance id. Compact holes from 10B–16B sit
      // below that newest id and were being skipped.
      let bungieStopAtIid: number | null = null;
      let bungieDeltaOnly = false;
      let archiveAnswered = false;
      let d1ArchiveFilled = false;

      // W55: D1 archive is opt-in and always partial. Older rows land first;
      // live Bungie still runs for every game the archive does not cover.
      // Any error or timeout leaves the Bungie-only path exactly as it is.
      if (character.game === 'D1' && environment.enableD1Archive && this.archiveApi.enabled) {
        try {
          const archiveData = await this.fetchD1ArchiveActivities(character.membershipId);
          const storedFromArchive = d1ArchiveRowsForCharacter(archiveData, character);
          if (storedFromArchive.length > 0) {
            const { fresh, replacements } = partitionD1AgainstStored(storedFromArchive, dbActivities);
            if (replacements.length > 0) {
              await this.activityDb.addActivities(replacements);
              host.noteActivitiesStored();
              const replaced = new Set(replacements.map(a => `${a.game}|${a.activityDetails?.instanceId}`));
              for (let i = 0; i < dbActivities.length; i++) {
                const key = `${dbActivities[i].game}|${dbActivities[i].activityDetails?.instanceId}`;
                if (replaced.has(key)) {
                  dbActivities[i] = replacements.find(
                    a => `${a.game}|${a.activityDetails?.instanceId}` === key
                  )!;
                }
              }
            }
            if (fresh.length > 0) {
              await this.activityDb.addActivities(fresh);
              host.noteActivitiesStored();
              dbActivities.push(...fresh);
              host.invalidateMembershipActivitiesCache(character.membershipId);
              if (accountKey && existingStatus) {
                host.reportActivityCountDelta(
                  accountCtx!,
                  'D1',
                  character.membershipType,
                  fresh.length,
                  false
                );
              }
              host.addOverallActivitiesProcessed(fresh.length);
            }
            d1ArchiveFilled = true;
            host.noteLookupDataSource('archive');
            host.processAndGroupActivities();
            console.log(
              '[Archive] D1 partial fill for membership',
              character.membershipId,
              ':',
              fresh.length,
              'new,',
              replacements.length,
              'placeholders replaced; live Bungie continues'
            );
          }
        } catch (err) {
          console.warn(
            '[Archive] D1 archive failed for membership',
            character.membershipId,
            '- Bungie-only path:',
            err
          );
          host.noteDcApiFallback();
        }
      }
      
      // Try loading from archive API first if enabled (membership-level list; PGCR stays lazy).
      // D1 skips the archive list: its D1 rows are zero-stat stubs (no duration),
      // and D1 always full-crawls Bungie anyway. Storing stubs first made the
      // crawl's dedupe drop the real rows, leaving the heatmap empty for D1.
      if (environment.useArchiveActivities && this.archiveApi.enabled && character.game !== 'D1') {
        try {
          const archiveData = await this.archiveApi.fetchPlayerActivities(
            character.membershipId,
            { game: character.game, limit: 100000 }
          );

          // Use archive rows when 'full', or when 'partial' still has lean rows (merged/gap/lite/extract).
          // compact_ids-only partials have empty activities[] — fall through to Bungie.
          // Backward compat: treat missing level as 'full' when source='archive' and rowCount > 0 (old server)
          const cov = archiveData?.coverage;
          if (cov) {
            host.noteArchiveCoverage(cov);
          }
          const effectiveLevel = cov?.level ?? (cov?.source === 'archive' && (cov?.rowCount ?? 0) > 0 ? 'full' : undefined);
          const leanPartial =
            effectiveLevel === 'partial' &&
            (cov?.rowCount ?? 0) > 0 &&
            (archiveData?.activities?.length ?? 0) > 0 &&
            cov?.source !== 'compact_ids' &&
            cov?.source !== 'none';
          if (archiveData && cov && (effectiveLevel === 'full' || leanPartial) && (cov.rowCount ?? 0) > 0) {
            archiveAnswered = true;
            host.noteLookupDataSource('archive');
            // Archive is healthy again — drop any prior outage fallback banner.
            if (host.hasDcApiFallbackNotice()) {
              host.clearDcApiFallbackNotice();
            }
            console.log(`[Archive] Found ${archiveData.coverage.rowCount} archived activities for ${character.membershipId} (${character.game}):`, {
              coverage: archiveData.coverage,
              characterId: character.characterId
            });

            const completeBelow = Number(cov.archiveCompleteBelowIid ?? 10_000_000_000);
            if (character.game === 'D2' && Number.isFinite(completeBelow) && completeBelow > 0) {
              bungieStopAtIid = completeBelow;
            }

            // Filter activities for this specific character (coerce ids - archive + Bungie both stringified).
            const characterActivities = archiveData.activities.filter(
              a => String(a.characterId) === String(character.characterId)
            );

            if (characterActivities.length > 0) {
              const convertedActivities = characterActivities.map(light =>
                convertLightActivityToHistory(light)
              );

              const storedActivities: StoredActivity[] = convertedActivities.map(activity => ({
                ...activity,
                membershipId: character.membershipId,
                characterId: character.characterId,
                instanceId: activity.activityDetails?.instanceId,
                mode: activity.activityDetails?.mode,
                game: character.game
              }));

              const uniqueNewActivities = excludeExistingInstances(dbActivities, storedActivities);

              if (uniqueNewActivities.length > 0) {
                await this.activityDb.addActivities(uniqueNewActivities);
                host.noteActivitiesStored();
                newActivities.push(...uniqueNewActivities);
                host.invalidateMembershipActivitiesCache(character.membershipId);

                if (accountKey && existingStatus) {
                  host.reportActivityCountDelta(
                    accountCtx!,
                    character.game as 'D1' | 'D2',
                    character.membershipType,
                    uniqueNewActivities.length,
                    false
                  );
                }

                host.addOverallActivitiesProcessed(uniqueNewActivities.length);
                console.log(`[Archive] Stored ${uniqueNewActivities.length} new activities from archive for character ${character.characterId}`);
              } else {
                console.log(`[Archive] Character ${character.characterId} already in IDB (${storedActivities.length} archive rows, 0 new)`);
              }

              // W31: D2 + flag ON stops at complete-below (10B). D1 full-crawls so a
              // partial D1 dump cannot hide games. Flag OFF: full skips Bungie;
              // lean-partial full-crawls.
              if (environment.archiveBungieDeltaFill && character.game === 'D2' && bungieStopAtIid != null) {
                bungieDeltaOnly = true;
                console.log(
                  `[Archive] W31 D2 catch-up (${effectiveLevel}) for ${character.membershipId}: ` +
                    `Bungie newest-first until iid <= ${bungieStopAtIid}`
                );
                host.processAndGroupActivities();
                // fall through to Bungie pagination (delta only)
              } else if (effectiveLevel === 'full') {
                host.processAndGroupActivities();
                host.setCharacterActivityLoading(loadingKey, false);
                return;
              } else {
                console.log(`[Archive] Partial lean coverage for ${character.membershipId}; continuing to Bungie for holes (delta fill OFF)`);
                host.processAndGroupActivities();
                // fall through to Bungie pagination (full crawl)
              }
            } else if (effectiveLevel === 'full' || leanPartial) {
              // Membership hit but 0 rows for this character.
              if (environment.archiveBungieDeltaFill && character.game === 'D2' && bungieStopAtIid != null) {
                bungieDeltaOnly = true;
                console.log(
                  `[Archive] W31 D2 catch-up (0 archive rows for char ${character.characterId}); stop at iid ${bungieStopAtIid}`
                );
                // fall through
              } else if (effectiveLevel === 'full') {
                console.log(`[Archive] Membership hit but 0 rows for character ${character.characterId}; skipping Bungie history`);
                host.setCharacterActivityLoading(loadingKey, false);
                return;
              }
              // leanPartial + flag OFF: fall through to full Bungie
            }
          }

          if (!archiveAnswered) {
            // Expected miss (404 / empty coverage) — silent Bungie fallback, no outage banner.
            console.log(`[Archive] No archived activities for ${character.membershipId} (${character.game}); falling back to Bungie`);
          }
        } catch (err) {
          console.warn(`[Archive] Failed to load from archive API for ${character.membershipId}, falling back to Bungie:`, err);
          host.noteDcApiFallback();
          // Fall through to Bungie API pagination
        }
      }
      
      // Select mode list based on game.
      // Destiny 1 requires individual mode pagination; include Story (2) so
      // campaign first missions are ingested for Guardian Firsts.
      // Destiny 2 can use a single aggregated request (mode undefined).
      // D1: mode 0 (None) returns every activity in one request. The old
      // [2, 6, 4] list was Story/Patrol/Raid only and dropped strikes, PvP, etc.
      // D2: a single request with no mode gets all modes.
      const modes: (number | undefined)[] = character.game === 'D1'
        ? [...D1_HISTORY_MODES]
        : [undefined];

      // Reached Bungie history pagination (full crawl or archive delta catch-up).
      host.noteLookupDataSource('bungie');

      // Process modes in parallel for faster loading
      const modePromises = modes.map(async (mode) => {
        const modeActivities: StoredActivity[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          const activities = await this.fetchActivitiesWithRetry(
            host,
            { ...character, mode },
            page,
            this.maxRetries,
            character.game === 'D1' && d1ArchiveFilled
          );
          
          if (!activities || activities.length === 0) {
            hasMore = false;
            continue;
          }

          let storedActivities: StoredActivity[] = activities.map(activity => ({
            ...activity,
            membershipId: character.membershipId,
            characterId: character.characterId,
            instanceId: activity.activityDetails?.instanceId,
            mode: activity.activityDetails?.mode,
            game: character.game // ensure we persist which game this activity belongs to
          }));

          // W31: Bungie returns newest-first. Keep rows above the complete-below
          // line (10B). Archive rows already stored cover that line and below.
          // W56: D1 archive is the fast list. Bungie keeps going while a page
          // still has new games or rows with no duration. Kills alone are not
          // a filled page: 2014 index rows can have kills and still need time.
          // A page whose stored rows already have duration is the handoff.
          if (character.game === 'D1' && d1ArchiveFilled) {
            if (d1BungiePageCaughtUp(storedActivities, dbActivities)) {
              hasMore = false;
              storedActivities = [];
            } else {
              storedActivities = d1RowsToIngest(storedActivities, dbActivities);
              hasMore = activities.length === 250;
              page++;
            }
          } else if (bungieDeltaOnly && bungieStopAtIid != null) {
            const pageIids = storedActivities
              .map(a => Number(a.instanceId))
              .filter(n => Number.isFinite(n) && n > 0);
            const pageMinIid = pageIids.length ? Math.min(...pageIids) : 0;
            storedActivities = storedActivities.filter(a => {
              const n = Number(a.instanceId);
              return Number.isFinite(n) && n > bungieStopAtIid!;
            });
            if (pageMinIid > 0 && pageMinIid <= bungieStopAtIid) {
              hasMore = false;
            } else {
              hasMore = activities.length === 250;
              page++;
            }
          } else {
            hasMore = activities.length === 250; // Assume 250 is page size
            page++;
          }

          modeActivities.push(...storedActivities);

          // Running total: report as reports are found so user sees progress
          if (accountKey && existingStatus && storedActivities.length > 0) {
            host.reportActivityCountDelta(
              accountCtx!,
              character.game as 'D1' | 'D2',
              character.membershipType,
              storedActivities.length,
              false
            );
          }

          // Legacy overall count for any other UI
          host.addOverallActivitiesProcessed(storedActivities.length);
        }
        
        return modeActivities;
      });

      // Wait for all modes to complete
      const allModeActivities = await Promise.all(modePromises);
      // One row per instance id; drop social spaces (mode/manifest based, not names).
      const allActivities = dedupeByInstanceId(allModeActivities.flat()).filter(
        a => !isSocialActivity(a.activityDetails?.mode, character.game === 'D2'
          ? this.manifest.getActivityDefinitionRaw(a.activityDetails?.referenceId)
          : null)
      );

      // Filter for unique new activities; a timed Bungie row also replaces a
      // zero-stat archive stub for the same instance (heals IDB filled before the D1 skip).
      const { fresh: uniqueNewActivities, replacements: stubReplacements } =
        character.game === 'D1' && d1ArchiveFilled
          ? partitionD1AgainstStored(allActivities, dbActivities)
          : partitionAgainstStored(allActivities, dbActivities);
      if (stubReplacements.length > 0) {
        await this.activityDb.addActivities(stubReplacements);
        host.noteActivitiesStored();
        const replacedIids = new Set(stubReplacements.map(a => String(a.activityDetails?.instanceId)));
        for (let i = 0; i < dbActivities.length; i++) {
          const iid = String(dbActivities[i].activityDetails?.instanceId);
          if (replacedIids.has(iid)) {
            dbActivities[i] = stubReplacements.find(a => String(a.activityDetails?.instanceId) === iid)!;
          }
        }
        host.invalidateMembershipActivitiesCache(character.membershipId);
        console.log(`[Sync] Replaced ${stubReplacements.length} zero-stat archive rows with Bungie rows for ${character.membershipId} (${character.game})`);
      }

          // Persist any new, unique activities to IndexedDB
          if (uniqueNewActivities.length > 0) {
            await this.activityDb.addActivities(uniqueNewActivities);
            host.noteActivitiesStored();
            // keep local cache in sync to avoid duplicate inserts on subsequent pages/modes
            dbActivities.push(...uniqueNewActivities);

            // Invalidate the per-player cache so the next getPlayerActivities() re-reads from DB
            host.invalidateMembershipActivitiesCache(character.membershipId);

            // If any of the newly stored activities fall on the date currently being viewed,
            // clear the per-date filtered cache and trigger a refresh so the user sees them.
            // Applies to both D1 and D2: loadActivityHistoryForCharacter runs per character
            // (D1 or D2), and this path triggers the same full-date refresh for either game.
            // Do NOT mark accounts complete here — full sync (more pages, Guardian Firsts, etc.) may still be running.
            host.refreshFilteredViewIfNeeded(uniqueNewActivities);
          }

          // Phase-A fast path: as soon as we have at least one activity for the selected date
          // (month/day match) we trigger a lightweight refresh so the user sees results instantly.
          host.tryShowInitialDisplay(allActivities);

      host.processAndGroupActivities();
    } catch (error) {
      console.error('Error loading activity history for character:', error);
      host.noteBungieApiIssue(character.game === 'D1' ? 'D1' : 'D2', error);
      host.setCharacterActivityError(loadingKey, 'Failed to load activity history');
    } finally {
      host.setCharacterActivityLoading(loadingKey, false);
    }
  }

}
