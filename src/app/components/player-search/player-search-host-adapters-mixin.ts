// @ts-nocheck
/** Thin host-adapter wrappers for PlayerSearchComponent (CODE_CLEANUP_SPEC). */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  build_asPlayerSearchInitHost,
  build_asAccountLoadingStatusHost,
  build_asFavoritesLoadHost,
  build_asPlayerSelectLoadHost,
  build_asPlayerAccountSyncHost,
  build_asProfileCharacterLoadHost,
  build_asActivityHistoryLoadHost,
  build_asDateActivityGroupingHost,
  build_asFilteredActivitiesBrowseHost,
  build_asAccountStatsCalculatorHost,
  build_asDateSelectFlowHost,
  build_asPlayerSearchFlowHost,
  build_asPlayerSelectionClearHost,
  build_asGuardianFirstsLoadHost,
  build_asActivityBreakdownLoadHost,
  build_asTitlesTabLoadHost,
  build_asExportShareFlowHost,
  build_asArchiveExportFlowHost,
} from './player-search-host-adapters';
import {
  build_setCharacterActivityLoading,
  build_setCharacterActivityError,
  build_beginCharacterActivityFetch,
  build_reportActivityCountDelta,
  build_refreshFilteredViewIfNeeded,
  build_tryShowInitialDisplay,
  build_updateLoadingProgress,
} from './player-search-activity-history-host';
import { PlayerSearchState } from './player-search-state';

export abstract class PlayerSearchHostAdaptersMixin extends PlayerSearchState {
  protected asPlayerSearchInitHost() {
    return build_asPlayerSearchInitHost(this);
  }
  protected asAccountLoadingStatusHost() {
    return build_asAccountLoadingStatusHost(this);
  }
  protected asFavoritesLoadHost() {
    return build_asFavoritesLoadHost(this);
  }
  protected asPlayerSelectLoadHost() {
    return build_asPlayerSelectLoadHost(this);
  }
  protected asPlayerAccountSyncHost(): PlayerAccountSyncHost {
    return build_asPlayerAccountSyncHost(this);
  }
  protected asProfileCharacterLoadHost(): ProfileCharacterLoadHost {
    return build_asProfileCharacterLoadHost(this);
  }
  protected asActivityHistoryLoadHost(): ActivityHistoryLoadHost {
    return build_asActivityHistoryLoadHost(this);
  }
  protected asDateActivityGroupingHost(): DateActivityGroupingHost {
    return build_asDateActivityGroupingHost(this);
  }
  protected asFilteredActivitiesBrowseHost(): FilteredActivitiesBrowseHost {
    return build_asFilteredActivitiesBrowseHost(this);
  }
  protected asAccountStatsCalculatorHost(): AccountStatsCalculatorHost {
    return build_asAccountStatsCalculatorHost(this);
  }
  protected asDateSelectFlowHost() {
    return build_asDateSelectFlowHost(this);
  }
  protected asPlayerSearchFlowHost() {
    return build_asPlayerSearchFlowHost(this);
  }
  protected asPlayerSelectionClearHost() {
    return build_asPlayerSelectionClearHost(this);
  }
  protected asGuardianFirstsLoadHost() {
    return build_asGuardianFirstsLoadHost(this);
  }
  protected asExportShareFlowHost() {
    return build_asExportShareFlowHost(this);
  }
  protected asActivityBreakdownLoadHost() {
    return build_asActivityBreakdownLoadHost(this);
  }
  protected asTitlesTabLoadHost() {
    return build_asTitlesTabLoadHost(this);
  }
  protected asArchiveExportFlowHost() {
    return build_asArchiveExportFlowHost(this);
  }

  setCharacterActivityLoading(loadingKey: string, loading: boolean): void {
    build_setCharacterActivityLoading(this, loadingKey, loading);
  }

  setCharacterActivityError(loadingKey: string, message: string): void {
    build_setCharacterActivityError(this, loadingKey, message);
  }

  beginCharacterActivityFetch(character: any): any {
    return build_beginCharacterActivityFetch(this, character);
  }

  refreshFilteredViewIfNeeded(newActivities: any[]): void {
    build_refreshFilteredViewIfNeeded(this, newActivities);
  }

  tryShowInitialDisplay(activities: any[]): void {
    build_tryShowInitialDisplay(this, activities);
  }

  protected updateLoadingProgress(
    phase: any,
    current: number,
    total: number,
    message: string
  ): void {
    build_updateLoadingProgress(this, phase, current, total, message);
  }

  protected reportActivityCountDelta(
    accountKey: string,
    displayName: string,
    platform: string,
    game: 'D1' | 'D2',
    membershipType: number,
    delta: number,
    isDone: boolean
  ): void {
    build_reportActivityCountDelta(
      this,
      accountKey,
      displayName,
      platform,
      game,
      membershipType,
      delta,
      isDone
    );
  }
}
