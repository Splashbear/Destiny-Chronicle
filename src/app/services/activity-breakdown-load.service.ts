import { Injectable } from '@angular/core';
import {
  ActivityBreakdownService,
  ActivityCountRow,
} from './activity-breakdown.service';

export type ActivityBreakdownGroup = {
  type: string;
  label: string;
  game?: 'D1' | 'D2';
  rows: ActivityCountRow[];
};

/** Host for Breakdown tab load orchestration (CODE_CLEANUP_SPEC). */
export interface ActivityBreakdownLoadHost {
  getSelectedPlayersLength(): number;
  getActivityBreakdownGroupsLength(): number;
  isBreakdownLoadInFlight(): boolean;
  setBreakdownDirty(dirty: boolean): void;
  bumpBreakdownLoadGen(): number;
  getBreakdownLoadGen(): number;
  setBreakdownLoadInFlight(on: boolean): void;
  setLoadingActivityBreakdown(loading: boolean): void;
  clearBreakdownRowsAndGroups(): void;
  clearSelectedBreakdownCardLabels(): void;
  markForCheck(): void;
  getBreakdownMembershipIds(): string[];
  getBreakdownSelectedGames(): Array<'D1' | 'D2'>;
  setBreakdownRetainExpansion(retain: boolean): void;
  setActivityBreakdownRows(rows: ActivityCountRow[] | null): void;
  setActivityBreakdownGroups(groups: ActivityBreakdownGroup[]): void;
  recomputeBreakdownChartData(): void;
  logBreakdownDebug(context: string): void;
  getActiveTab(): string;
  isBreakdownDirty(): boolean;
  reloadBreakdownPreserveView(): void;
}

/**
 * Activity Breakdown tab load with preserve-view / gen abort (CODE_CLEANUP_SPEC).
 */
@Injectable({ providedIn: 'root' })
export class ActivityBreakdownLoadService {
  constructor(private activityBreakdownService: ActivityBreakdownService) {}

  async loadActivityBreakdown(
    host: ActivityBreakdownLoadHost,
    options?: { preserveView?: boolean }
  ): Promise<void> {
    if (host.getSelectedPlayersLength() === 0) return;
    const preserve =
      !!options?.preserveView && host.getActivityBreakdownGroupsLength() > 0;
    if (preserve && host.isBreakdownLoadInFlight()) {
      host.setBreakdownDirty(true);
      return;
    }
    const gen = host.bumpBreakdownLoadGen();
    host.setBreakdownLoadInFlight(true);
    host.setBreakdownDirty(false);
    if (!preserve) {
      host.setLoadingActivityBreakdown(true);
      host.clearBreakdownRowsAndGroups();
      host.clearSelectedBreakdownCardLabels();
      host.markForCheck();
    }
    try {
      const membershipIds = host.getBreakdownMembershipIds();
      if (membershipIds.length === 0) return;
      this.activityBreakdownService.clearActivityCountsCache();
      const rows = await this.activityBreakdownService.getActivityCounts(membershipIds);
      if (gen !== host.getBreakdownLoadGen()) return;

      let effectiveRows = rows;
      const selectedGames = host.getBreakdownSelectedGames();
      if (selectedGames.length > 0) {
        const allowed = new Set(selectedGames);
        effectiveRows = rows.filter((r) => !r.game || allowed.has(r.game));
      }

      host.setBreakdownRetainExpansion(preserve);
      host.setActivityBreakdownRows(effectiveRows);
      host.setActivityBreakdownGroups(
        this.activityBreakdownService.groupRowsByType(effectiveRows)
      );
      host.recomputeBreakdownChartData();
      host.logBreakdownDebug('loadActivityBreakdown');
    } catch (err) {
      if (gen !== host.getBreakdownLoadGen()) return;
      console.error('[ActivityBreakdown] Failed to load', err);
      if (!preserve) {
        host.setActivityBreakdownRows([]);
        host.setActivityBreakdownGroups([]);
      }
    } finally {
      if (gen === host.getBreakdownLoadGen()) {
        host.setLoadingActivityBreakdown(false);
        host.setBreakdownLoadInFlight(false);
        host.markForCheck();
        if (host.isBreakdownDirty() && host.getActiveTab() === 'breakdown') {
          host.setBreakdownDirty(false);
          host.reloadBreakdownPreserveView();
        }
      }
    }
  }
}
